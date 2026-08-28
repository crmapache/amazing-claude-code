/**
 * The input field under the keyboard: fast typing, Asian input methods, editing in the middle.
 *
 * The field is not an ordinary input - it is a contentEditable with live chips in it, and it takes keys
 * away from the browser for the hint, the history, the chips and for sending. Every such interception is
 * a chance to take a key that belonged to somebody else, and the somebody who suffers first is an input
 * method assembling a character: Enter confirms its candidate, Tab and the arrows walk its list, the
 * digits pick from it, Escape throws the half-typed character away.
 *
 * So this runs the real panel (the harness renders the very same App, see webview/src/harness) in a real
 * browser and drives it two ways at once:
 *
 *   - plain typing, with no input method anywhere - the regression half. Sending, the line break, the
 *     history, undo, the hint, the chips, Escape and the digit hotkeys must behave exactly as before;
 *   - a genuine composition through the browser's own engine (CDP Input.imeSetComposition, the same path
 *     a Korean or Chinese keyboard takes) - the half that used to be broken.
 *
 * It also measures the keystroke: how long it takes from the key to the next frame, plainly, during a
 * composition and with the "@" hint open over a large project.
 *
 * How to run it:
 *
 *   cd webview && pnpm dev            # the harness on :5173, in a terminal of its own
 *   npm i playwright --prefix /tmp/acc-shots      # once: Playwright is not a dependency of this repo
 *   PLAYWRIGHT=/tmp/acc-shots/node_modules/playwright/index.mjs node scripts/composer-input.mjs
 *
 * Exits non-zero on the first failed check, so it can stand in a chain. HEADED=1 shows the browser.
 *
 * Playwright is deliberately not in package.json - see the same note in screenshots.mjs.
 */

/** An ES module ignores NODE_PATH, so the path has to arrive as a path rather than as a lookup root. */
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright')

const BASE = 'http://localhost:5173/harness.html'
const FIELD = '[contenteditable="true"]'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
/** What the panel was being asked to do when something went wrong - a crash names the check it fell on. */
let doing = 'starting up'
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  results.push({ ok, name, got, want })
  doing = name
  console.log(`${ok ? '  ok' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)
}

const browser = await chromium.launch({ headless: !process.env.HEADED })
const page = await browser.newPage({ viewport: { width: 900, height: 900 } })
const crashes = []
page.on('pageerror', (error) => crashes.push(`after "${doing}": ${error}`))

await page.goto(BASE)
await sleep(1200)

const cdp = await page.context().newCDPSession(page)

// --- Driving the panel ------------------------------------------------------

/**
 * A scenario is picked by its own name in the harness's list. Every check starts from one, because a
 * panel with no conversation shows the login gate instead of the field.
 */
const scenario = async (name, settle = 2500) => {
  await page.getByText(name, { exact: true }).click()
  await sleep(settle)
  await watchOutgoing()
}

/**
 * What the panel sent to the IDE. The harness's bridge is rebuilt on every scenario, so the wrapper is
 * put back on after each one.
 */
const watchOutgoing = () =>
  page.evaluate(() => {
    window.__outgoing = []
    const original = window.__accSend
    if (!original || original.__watched) return
    const watched = (payload) => {
      window.__outgoing.push(payload)
      return original(payload)
    }
    watched.__watched = true
    window.__accSend = watched
  })

const outgoing = (type) => page.evaluate((t) => window.__outgoing.filter((p) => p.includes(`"${t}"`)).length, type)
const forgetOutgoing = () => page.evaluate(() => { window.__outgoing = [] })

const text = () => page.$eval(FIELD, (node) => node.textContent)
const chips = () => page.$eval(FIELD, (node) => node.querySelectorAll('[contenteditable="false"]').length)
const hintHas = (needle) => page.evaluate((n) => document.body.innerText.includes(n), needle)

/** Empty the field the way a person would not: straight through the DOM, so no check depends on another. */
const clear = async () => {
  await page.click(FIELD)
  await page.$eval(FIELD, (node) => {
    node.innerHTML = ''
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await sleep(150)
}

const caretAt = async (fromEnd) => {
  for (let i = 0; i < fromEnd; i++) await page.keyboard.press('ArrowLeft')
}

/** The project's file list: the panel is normally sent one by the IDE, the harness sends none. */
const sendFiles = (files) => page.evaluate((list) => window.__accReceive?.({ type: 'files', files: list }), files)

// --- Composition ------------------------------------------------------------

/**
 * A step of a genuine composition. Not a synthetic event: imeSetComposition goes through the same engine
 * path a keyboard's input method does, so the browser really holds an unfinished character in the field
 * and really raises isComposing on the keys that follow.
 */
const composing = async (value) => {
  await cdp.send('Input.imeSetComposition', { text: value, selectionStart: value.length, selectionEnd: value.length })
  await sleep(40)
}

/** The candidate is confirmed - the only thing that ends a composition (a dispatched Enter does not). */
const confirm = async (value) => {
  await cdp.send('Input.insertText', { text: value })
  await sleep(150)
}

const composeWord = async (steps, final) => {
  for (const step of steps) await composing(step)
  await confirm(final)
}

// ============================================================================
// The regression half: no input method anywhere, everything as a Latin keyboard sees it
// ============================================================================

console.log('\nplain typing (no input method)\n')

await scenario('A single call')

await clear()
await page.click(FIELD)
const FAST = 'The quick brown fox jumps over the lazy dog 0123456789 and keeps on typing'
await page.keyboard.type(FAST, { delay: 0 })
await sleep(400)
check('fast typing loses nothing', await text(), FAST)

await clear()
await page.click(FIELD)
await page.keyboard.type('hello world', { delay: 8 })
await sleep(200)
await caretAt(5)
await page.keyboard.type('BIG ', { delay: 0 })
await sleep(300)
check('typing in the middle stays in the middle', await text(), 'hello BIG world')

await clear()
await page.click(FIELD)
await page.keyboard.type('hello world', { delay: 8 })
await sleep(200)
await caretAt(5)
await page.evaluate(() => {
  const transfer = new DataTransfer()
  transfer.setData('text/plain', 'PASTED ')
  document
    .querySelector('[contenteditable="true"]')
    .dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }))
})
await sleep(300)
check('a paste lands where the caret stood', await text(), 'hello PASTED world')

await clear()
await page.click(FIELD)
await page.keyboard.type('one', { delay: 5 })
await page.keyboard.down('Shift')
await page.keyboard.press('Enter')
await page.keyboard.up('Shift')
await page.keyboard.type('two', { delay: 0 })
await sleep(300)
check('shift+enter breaks the line', await text(), 'one\ntwo')

await clear()
await page.click(FIELD)
await page.keyboard.type('a message that goes out', { delay: 5 })
await sleep(250)
await forgetOutgoing()
await page.keyboard.press('Enter')
await sleep(400)
check('enter sends', await outgoing('prompt'), 1)
check('enter empties the field', await text(), '')

await page.keyboard.press('ArrowUp')
await sleep(300)
check('the up arrow brings the sent message back', await text(), 'a message that goes out')

await clear()
await page.click(FIELD)
await page.keyboard.type('undone', { delay: 5 })
await sleep(800)
await page.keyboard.press('Meta+z')
await sleep(300)
check('undo takes the typing back', await text(), '')
await page.keyboard.press('Meta+Shift+z')
await sleep(300)
check('redo puts it back', await text(), 'undone')

await clear()
await page.click(FIELD)
await page.keyboard.type('/mod', { delay: 10 })
await sleep(300)
check('the command hint opens', await hintHas('model'), true)
await page.keyboard.press('Tab')
await sleep(300)
check('tab picks the command out of the hint', await chips(), 1)

await sendFiles(['src/panel/Composer.tsx', 'src/panel/Feed.tsx', 'README.md'])
await clear()
await page.click(FIELD)
await page.keyboard.type('@Comp', { delay: 10 })
await sleep(300)
check('the file hint opens', await hintHas('Composer.tsx'), true)
await page.keyboard.press('Enter')
await sleep(300)
check('enter picks the file out of the hint', await chips(), 1)

await page.keyboard.press('ArrowLeft')
await sleep(150)
await page.keyboard.press('Backspace')
await sleep(300)
check('backspace removes the chip the arrow reached', await chips(), 0)

await clear()
await page.click(FIELD)
await page.keyboard.type('/mod', { delay: 10 })
await sleep(300)
await forgetOutgoing()
await page.keyboard.press('Escape')
await sleep(300)
check('escape closes the hint without stopping the turn', await outgoing('stop'), 0)

await scenario('A burst of calls in a row', 1200)
await page.click(FIELD)
await forgetOutgoing()
await page.keyboard.press('Escape')
await sleep(400)
check('escape stops the running turn', await outgoing('stop'), 1)

await scenario('A burst of calls in a row', 1200)
await page.click(FIELD)
await forgetOutgoing()
await page.keyboard.down('Shift')
await page.keyboard.press('Tab')
await page.keyboard.up('Shift')
await sleep(400)
check('shift+tab drives the mode round', await outgoing('setMode'), 1)

await scenario('Waiting for a permission', 3000)
await clear()
await forgetOutgoing()
await page.keyboard.press('2')
await sleep(400)
check('a digit answers the permission while the field is empty', await outgoing('permissionDecision'), 1)

// ============================================================================
// The Asian half: a genuine composition through the browser's engine
// ============================================================================

console.log('\nan input method assembling characters\n')

await scenario('A single call')

await clear()
await page.click(FIELD)
await composeWord(['ㅇ', '아', '안', '안ㄴ', '안녀', '안녕'], '안녕')
await composeWord(['ㅎ', '하', '핫', '하세'], '하세')
await composeWord(['ㅇ', '요'], '요')
check('a korean sentence assembles', await text(), '안녕하세요')

await clear()
await page.click(FIELD)
await composeWord(['n', 'ni', 'nih', 'niha', 'nihao'], '你好')
check('chinese pinyin assembles', await text(), '你好')

await clear()
await page.click(FIELD)
await page.keyboard.type('start end', { delay: 8 })
await sleep(200)
await caretAt(3)
await composeWord(['n', 'ni', 'nihao'], '你好')
check('an input method works in the middle too', await text(), 'start 你好end')

await sendFiles(['src/panel/Composer.tsx', 'src/panel/Feed.tsx', 'README.md'])
await clear()
await page.click(FIELD)
await page.keyboard.type('@', { delay: 10 })
await sleep(250)
await composing('C')
await composing('Co')
check('the file hint is open over the half-typed word', await hintHas('Composer.tsx'), true)
await page.keyboard.press('Enter')
await sleep(300)
check('enter confirms the candidate rather than picking a file', await chips(), 0)
await page.keyboard.press('Tab')
await sleep(300)
check('tab does not pick a file either', await chips(), 0)
await page.keyboard.press('ArrowDown')
await page.keyboard.press('ArrowDown')
await sleep(250)
check('the arrows leave the hint alone', await chips(), 0)
await confirm('好')
await sleep(200)
// The confirming keys above ended the composition, exactly as a real one would: what was in the buffer
// stayed as text and the confirmed character followed it.
check('the confirmed character lands in the field', await text(), '@Co好')

await clear()
await page.click(FIELD)
await page.keyboard.type('/mod', { delay: 10 })
await sleep(300)
await composing('e')
await page.keyboard.press('Enter')
await sleep(300)
check('enter does not pick a command out of the hint either', await chips(), 0)
await confirm('e')
await sleep(250)

await scenario('A burst of calls in a row', 1200)
await page.click(FIELD)
await composing('n')
await composing('ni')
await forgetOutgoing()
await page.keyboard.press('Escape')
await sleep(400)
check('escape throws the character away without stopping the turn', await outgoing('stop'), 0)

await scenario('A burst of calls in a row', 1200)
await page.click(FIELD)
await composing('n')
await composing('ni')
await forgetOutgoing()
await page.keyboard.down('Shift')
await page.keyboard.press('Tab')
await page.keyboard.up('Shift')
await sleep(400)
check('shift+tab does not change the mode mid-character', await outgoing('setMode'), 0)

await scenario('Waiting for a permission', 3000)
await clear()
await page.click(FIELD)
await composing('n')
await composing('ni')
await forgetOutgoing()
await page.keyboard.press('2')
await sleep(400)
check('a digit picks a candidate rather than answering the permission', await outgoing('permissionDecision'), 0)

await scenario('A question with options', 3000)
await clear()
await page.click(FIELD)
await composing('n')
await composing('ni')
await forgetOutgoing()
await page.keyboard.press('Enter')
await sleep(400)
check('enter does not answer the question mid-character', await outgoing('askAnswer'), 0)

/**
 * The habit the whole thing exists for: the first Enter confirms the candidate, the second sends. The
 * second must not find a draft the panel still counts as empty (see handleCompositionEnd).
 */
await scenario('A single call')
await clear()
await page.click(FIELD)
await composeWord(['n', 'ni', 'nihao'], '你好')
await forgetOutgoing()
await page.keyboard.press('Enter')
await sleep(400)
check('the enter after the character sends the message', await outgoing('prompt'), 1)
check('and empties the field', await text(), '')

/** A command typed by an input method still becomes a chip - once the character is finished, not before. */
await clear()
await page.click(FIELD)
await page.keyboard.type('/model', { delay: 8 })
await sleep(200)
await composing(' ')
check('the command stays plain text while the character is unfinished', await chips(), 0)
await confirm(' ')
await sleep(300)
check('and becomes a chip as soon as it is finished', await chips(), 1)

/**
 * A Latin keyboard meets this path too: press-and-hold on a Mac and the dead keys of the European
 * layouts open an accent menu through the very same composition.
 */
await scenario('Waiting for a permission', 3000)
await clear()
await page.click(FIELD)
await page.keyboard.type('caf', { delay: 8 })
await sleep(150)
await composing('e')
await forgetOutgoing()
await page.keyboard.press('2')
await sleep(300)
check('a digit over the accent menu does not answer the permission', await outgoing('permissionDecision'), 0)
await confirm('é')
await sleep(200)
check('the accented letter lands in the field', await text(), 'café2')

// ============================================================================
// The keystroke, measured
// ============================================================================

console.log('\nkeystroke to the next frame, milliseconds\n')

const measure = async (label, run) => {
  await page.evaluate(() => {
    window.__lat = []
    const node = document.querySelector('[contenteditable="true"]')
    if (node.__measured) return
    node.__measured = true
    // A composition sends no keydown of its own - its clock starts on its own event, otherwise the
    // measurement would count the pauses between the driver's steps.
    const start = () => { window.__t0 = performance.now() }
    node.addEventListener('keydown', start)
    node.addEventListener('compositionupdate', start)
    node.addEventListener('input', () => {
      requestAnimationFrame(() => window.__lat.push(performance.now() - window.__t0))
    })
  })
  await run()
  await sleep(400)
  const stats = await page.evaluate(() => {
    const sorted = window.__lat.slice().sort((a, b) => a - b)
    const at = (q) => Math.round((sorted[Math.floor(sorted.length * q)] ?? 0) * 10) / 10
    return { n: sorted.length, p50: at(0.5), p90: at(0.9), max: Math.round((sorted.at(-1) ?? 0) * 10) / 10 }
  })
  console.log(`  ${label}: ${JSON.stringify(stats)}`)
}

await scenario('A burst of calls in a row', 2500)
await clear()
await page.click(FIELD)
await measure('plain typing, busy feed', () =>
  // A millisecond apart is already about fifty characters a second - faster than a person types, and the
  // fastest this measures anything real. Zero apart is not a faster typist but a different thing entirely:
  // the events then arrive closer together than the panel commits a frame, and the feed's own repaint
  // chain (nothing to do with the field) runs into React's nested-update limit.
  page.keyboard.type('measuring one keystroke inside a busy panel 0123456789', { delay: 1 }),
)

await clear()
await page.click(FIELD)
await measure('during a composition', async () => {
  for (let word = 0; word < 6; word++) await composeWord(['n', 'ni', 'nih', 'niha', 'nihao'], '你好')
})

/** A big project: the hint searches the paths on every repaint unless the search is remembered. */
await sendFiles(Array.from({ length: 4000 }, (_, i) => `src/module${i % 40}/component${i}/index.tsx`))
await clear()
await page.click(FIELD)
await measure('with the "@" hint open over 4000 paths', () => page.keyboard.type('@component1', { delay: 0 }))

// ============================================================================

await browser.close()

const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (crashes.length > 0) console.log(`\nthe page threw:\n${crashes.slice(0, 5).join('\n')}`)
if (failed.length > 0 || crashes.length > 0) process.exit(1)
