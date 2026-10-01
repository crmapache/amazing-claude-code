import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { parseParagraphs } from '../../feed/markdown'
import type { Paragraph, TextPart } from '../../feed/types'
import { BULLET } from './Markdown'
import { Formula } from './Formula'
import s from '../feed.module.css'

/**
 * What an agent wrote, inside a card that is about something else - a scenario step's row, the main
 * thread's word between the steps, its verdict under a card.
 *
 * Those lines used to be the raw text, and the raw text of an agent is markdown: a report opened with
 * `**4. The report**` in asterisks, a branch's name stood in backticks, and a list folded into one line of
 * "- this; - that" because a line of plain text has no way to break. Here it goes through the panel's own
 * parsing (see parseParagraphs), so a heading is bold, code is code and a list item starts a line - the
 * same text reads the same way in the card and in the step's log behind it.
 *
 * It is a glance rather than the answer itself, and two things follow from that.
 *
 * - **Nothing in it is pressed.** It stands inside the card's own button, which opens the whole log; a
 *   path that opens a file or a code span that copies itself would be a button inside a button, and a
 *   press on the card's text would do something other than what a press on the card does. So the pieces
 *   are drawn and not wired, and the paragraphs are spans rather than divs for the same reason - a button
 *   holds phrasing content only.
 * - **It is cut to [lines], and the cut is honest about which end it took.** A finished card shows how
 *   its answer began, and fades out at the bottom. A card still talking shows what it said last - its
 *   [newest] lines - and fades out at the top, because the question its live line answers is whether it is
 *   working right now. Across blocks of different kinds no line clamp of the browser's counts lines
 *   reliably, so the box is capped at so many line heights and the fade goes on only when something is
 *   actually cut.
 */
export const Glance = ({
  text,
  lines,
  newest = false,
  className,
}: {
  text: string
  /** How many lines of it to show at most. Absent - all of it. */
  lines?: number
  /** Show the end of it rather than the beginning when it does not fit. */
  newest?: boolean
  className?: string
}) => {
  const paragraphs = useMemo(() => parseParagraphs(text.trim()), [text])
  const box = useRef<HTMLSpanElement>(null)
  const flow = useRef<HTMLSpanElement>(null)
  const [cut, setCut] = useState(false)

  useLayoutEffect(() => {
    const outer = box.current
    const inner = flow.current
    if (!lines || !outer || !inner || typeof ResizeObserver === 'undefined') {
      setCut(false)
      return
    }

    // Both ends are watched: the text grows while a card talks, and the panel narrows when the IDE's
    // tool window is dragged - either can push the last line past the cap or bring it back.
    const measure = () => setCut(inner.offsetHeight > outer.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(outer)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [lines])

  const classes = [
    s.glance,
    lines ? s.glanceCapped : '',
    newest ? s.glanceNewest : '',
    cut ? (newest ? s.glanceCutTop : s.glanceCutBottom) : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span
      ref={box}
      className={classes}
      style={lines ? ({ '--acc-glance-lines': lines } as CSSProperties) : undefined}
    >
      <span ref={flow} className={s.glanceFlow}>
        {paragraphs.map((paragraph, index) => (
          <Block key={index} paragraph={paragraph} />
        ))}
      </span>
    </span>
  )
}

const Block = ({ paragraph }: { paragraph: Paragraph }) => {
  if (paragraph.codeBlock) {
    return <span className={s.glanceCodeBlock}>{paragraph.parts.map((part) => part.text).join('')}</span>
  }

  if (paragraph.math) {
    return (
      <span className={s.glanceBlock}>
        <Formula latex={paragraph.parts[0]?.text ?? ''} display={false} />
      </span>
    )
  }

  // A table keeps its rows and loses its grid: a grid needs widths the line of a card does not have, and a
  // row read across - its cells one after another - still says what it said.
  if (paragraph.table) {
    const { header, rows } = paragraph.table
    return (
      <>
        {[header, ...rows].map((row, index) => (
          <span key={index} className={index === 0 ? `${s.glanceBlock} ${s.glanceHeading}` : s.glanceBlock}>
            {row.map((cell, cellIndex) => (
              <span key={cellIndex}>
                {cellIndex > 0 ? <span className={s.glanceMarker}> · </span> : null}
                <Parts parts={cell} />
              </span>
            ))}
          </span>
        ))}
      </>
    )
  }

  const classes = [
    s.glanceBlock,
    paragraph.heading ? s.glanceHeading : '',
    paragraph.bullet ? s.glanceBullet : '',
    paragraph.quote ? s.glanceQuote : '',
  ]
    .filter(Boolean)
    .join(' ')

  const depth = paragraph.depth ?? 0

  return (
    <span className={classes} style={depth > 0 ? { marginLeft: `${depth * 1.2}em` } : undefined}>
      {paragraph.bullet ? <span className={s.glanceMarker}>{paragraph.marker ?? BULLET} </span> : null}
      <Parts parts={paragraph.parts} />
    </span>
  )
}

const Parts = ({ parts }: { parts: TextPart[] }) => (
  <>
    {parts.map((part, index) => (
      <Part key={index} part={part} />
    ))}
  </>
)

/** The pieces the feed draws (see PartView in Markdown), in the same colours and without their presses. */
const Part = ({ part }: { part: TextPart }) => {
  if (part.math) return <Formula latex={part.text} display={false} />

  const classes = [
    part.code ? s.glanceCode : '',
    part.href ? s.glanceLink : '',
    part.mark ? s.mark : '',
    part.strong ? s.glanceStrong : '',
    part.em ? s.em : '',
  ]
    .filter(Boolean)
    .join(' ')

  return classes ? <span className={classes}>{part.text}</span> : <>{part.text}</>
}
