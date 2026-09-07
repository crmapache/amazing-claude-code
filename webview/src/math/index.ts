import katexStyles from './katex.css?url'

/**
 * KaTeX, fetched the first time a formula appears and never before.
 *
 * The library is 76 KB gzip of JavaScript and 22 KB of stylesheet, and a conversation about code holds no
 * mathematics at all. So it travels the way the nine dictionaries do (see i18n/index.ts): a dynamic import
 * behind a module-level cache, one attempt, and everything that needs it asks a plain function whether it
 * has arrived. Nothing on screen waits for it - a formula whose library has not landed yet stands as the
 * text it was written as, which is exactly what it looked like before any of this existed.
 *
 * The stylesheet comes in as a url rather than as an import of the styles themselves, and that is not a
 * flourish: imported the ordinary way it is merged into the entry stylesheet of both bundles - measured,
 * 22.6 KB of it - and every load pays for it whether or not a formula is ever drawn. As a url it is a
 * string here and a `<link>` written out below, at the same moment as the library.
 */
type Katex = (typeof import('katex'))['default']

let katex: Katex | null = null
let attempt: Promise<void> | null = null
const listeners = new Set<() => void>()

/**
 * What the arrival is counted by. A number rather than a flag because this is read through
 * useSyncExternalStore, and that wants a snapshot it can compare between renders.
 */
let version = 0

export const subscribeMath = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const mathVersion = (): number => version

/**
 * Fetch the library, once.
 *
 * A failure is final and silent: the phone loads this over the network from the relay, and out of signal a
 * retried import fails again on every frame of a printing answer - a network storm exactly where there is
 * no network. One attempt, and the formulas go on standing as their own source.
 */
export const loadMath = (): void => {
  if (katex || attempt) return

  attempt = Promise.all([import('katex'), styles()])
    .then(([module]) => {
      katex = module.default ?? (module as unknown as Katex)
      version += 1
      listeners.forEach((listener) => listener())
    })
    .catch(() => {
      // Nothing to say and nowhere to say it: the formula reads as the text it was written as.
    })
}

/**
 * The stylesheet, written into the head once and waited for.
 *
 * Waited for because without it KaTeX's markup is a row of bare glyphs in the wrong sizes - a formula
 * that is drawn and then jumps into shape reads as a fault. A stylesheet that never arrives resolves all
 * the same: unstyled mathematics is still mathematics, and holding the formula as text forever because a
 * file is missing would be the worse of the two.
 */
const styles = (): Promise<void> =>
  new Promise((resolve) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = katexStyles
    link.addEventListener('load', () => resolve())
    link.addEventListener('error', () => resolve())
    document.head.append(link)
  })

/**
 * How a formula is built, and why every one of these is written out rather than left to its default.
 *
 * The feed carries text nobody vouched for - what the model said, what a file it read holds, what a
 * command printed, a page off the web - and the panel's window holds the bridge to the IDE. So the things
 * that would turn a formula into a way in are shut by name:
 *
 * `trust` is the gate on `\href`, `\url`, `\includegraphics` and the `\html*` family. Open, `\href` would
 * put a real anchor into the feed past the rule that only lets `https?://` through and opens it in the
 * system browser; `\includegraphics` would be a formula's way of reaching the network; `\htmlData` would
 * hang arbitrary data attributes on it, and the feed reads those - one of them decides what a copy carries.
 *
 * `maxSize` and `maxExpand` are the ceilings on how much one formula may ask for. maxSize is Infinity by
 * default, so a single `\rule{100000em}{100000em}` in a README the agent read would lay the panel out
 * around an element the size of a city. maxExpand is what stands between a macro that defines itself and a
 * hang: `\def` and its family are built in, and this number is the only thing stopping them.
 *
 * `throwOnError` stays on and the throw is caught here, because KaTeX's own failure markup is `#cc0000`
 * written inline - a colour from outside the palette, which would survive the light theme - with the
 * reason in a native `title`, in English, in a panel that speaks ten languages. The source of the formula
 * says more than either, so that is what is shown instead.
 *
 * `macros` is deliberately not passed at all: KaTeX treats it as a namespace it may write into, so one
 * shared object would let a formula redefine commands for every formula drawn after it.
 */
const OPTIONS = {
  throwOnError: true,
  trust: false,
  strict: false,
  maxSize: 8,
  maxExpand: 1000,
  globalGroup: false,
  // Both halves, which is the default and stays it: the MathML half is the only one a screen reader can
  // read, and the visible half is marked aria-hidden.
  output: 'htmlAndMathml',
} as const

/**
 * How many built formulas are kept. The feed is rebuilt on every piece of a printing answer, so building
 * one afresh each time would cost a full KaTeX parse per formula per frame; a long conversation, on the
 * other hand, has no business holding every formula it ever showed.
 */
const CACHE_LIMIT = 300

/** A built formula, or null for one KaTeX would not take. Absent means "not built yet". */
const built = new Map<string, Element | null>()

/**
 * The formula as a detached node, ready to be cloned into place - or null while the library is still on
 * its way, and for a formula that would not parse.
 *
 * Cloned rather than moved: one node lives in one place, and the same formula stands in the answer being
 * printed and in the settled one, which are two different trees over the same text.
 */
export const mathNode = (latex: string, display: boolean): Element | null => {
  if (!katex) return null

  const key = `${display ? 'd' : 'i'} ${latex}`
  const known = built.get(key)
  if (known !== undefined) {
    // Bumped to the newest end of the map's own order: a plain get does not move it there by itself, and
    // without this a formula still on screen and asked for on every frame of a printing answer is exactly
    // as old, by eviction order, as one built once and never looked at again - and the eviction below throws
    // out whichever of the two happens to have been built first.
    built.delete(key)
    built.set(key, known)
    return known
  }

  let node: Element | null = null
  try {
    const holder = document.createElement('span')
    // render() builds the tree with createElement and setAttribute - no HTML is parsed anywhere on this
    // path, so nothing inside a formula can become markup. renderToString into innerHTML would have made
    // the panel's safety a property of somebody else's serialiser.
    katex.render(latex, holder, { ...OPTIONS, displayMode: display })
    node = holder
  } catch {
    node = null
  }

  if (built.size >= CACHE_LIMIT) {
    const oldest = built.keys().next()
    if (!oldest.done) built.delete(oldest.value)
  }

  built.set(key, node)
  return node
}
