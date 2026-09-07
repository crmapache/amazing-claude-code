import { memo, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { COPY_ATTRIBUTE } from '../../feed/copy'
import { loadMath, mathNode, mathVersion, subscribeMath } from '../../math'
import s from '../feed.module.css'

/**
 * A formula on screen - the same component for one standing on its own and one inside a line, because
 * everything that is awkward about them is the same for both: the library arriving late, the source that
 * has to survive a copy, and the failure that must not look like one. Two of these would have parted ways
 * on the first change to either.
 *
 * The node is cloned in rather than rendered by React, and that is the whole point of the arrangement:
 * KaTeX builds its tree with createElement, so no HTML is parsed on the way from an answer to the screen.
 * The alternative - renderToString into dangerouslySetInnerHTML - would have opened the panel's first
 * HTML sink on text nobody vouched for, in a window that holds the bridge to the IDE.
 */
export const Formula = memo(({ latex, display }: { latex: string; display: boolean }) => {
  // The library lands once, long after the first draw. This is how a formula hears about it - and only a
  // formula does: held higher up, the arrival would redraw the whole panel instead of these few nodes.
  useSyncExternalStore(subscribeMath, mathVersion)

  const host = useRef<HTMLSpanElement>(null)
  const node = mathNode(latex, display)

  /**
   * What the formula means in the clipboard.
   *
   * KaTeX lays two copies of the formula side by side - a hidden MathML one for a screen reader and a
   * visible one made of glyphs - and the hidden half is hidden by a clip rather than taken out of the
   * layout, so a selection carries both: "E=mc2E=mc2". The feed already knows how to answer that question
   * (see COPY_ATTRIBUTE, until now used only by the chips of a message), and the answer here is the best
   * one there is: what the agent wrote. It sits on the outermost node, so half a formula in a selection
   * still comes out whole - half a formula is not a formula.
   */
  const source = display ? `$$${latex}$$` : `$${latex}$`

  useLayoutEffect(() => {
    if (!node) {
      loadMath()
      return
    }
    host.current?.replaceChildren(node.cloneNode(true))
  }, [node])

  // No library yet, or a formula KaTeX would not take: the source stands as the text it is. Both are
  // ordinary states rather than errors - the first lasts a moment on the first formula of a session, and
  // the second is what the agent actually typed, which says more than a red word about a parse error.
  const glyphs = node ? <span ref={host} /> : <span className={s.formulaSource}>{source}</span>

  const copy = { [COPY_ATTRIBUTE]: source }

  // A block of its own scrolls sideways: the panel is 350px wide at its narrowest, and a formula that does
  // not fit is cut off with no way to reach the rest of it - .katex does not scroll and does not wrap.
  return display ? (
    <div className={`${s.math} ${s.formulaBlock}`} {...copy}>
      {glyphs}
    </div>
  ) : (
    // Nothing of its own to say: an inline formula stands in the line as KaTeX sets it. A tall fraction is
    // allowed to reach into the lines around it rather than push them apart - that is how mathematics is
    // set on paper, and the feed's leading is a bare number out of the IDE's console settings that goes as
    // low as 1.4. `.math` is here for the two rules that need to find a formula: the paint of the search
    // steps over it, and the hidden half of it is kept out of a selection.
    <span className={s.math} {...copy}>
      {glyphs}
    </span>
  )
})
