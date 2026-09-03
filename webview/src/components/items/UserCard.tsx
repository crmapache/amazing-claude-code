import { memo, useMemo } from 'react'
import { LinkedText } from './LinkedText'
import { Caret } from './Caret'
import { CopyButton } from './CopyButton'
import { chipFile, chipLabel, chipTitle, pasteBlockPreview, pasteBody, pasteLineCount } from '../../feed/reference'
import { COPY_ATTRIBUTE } from '../../feed/copy'
import { clipboardText } from '../../feed/tokens'
import type { Chip, ChipKind, UserItem } from '../../feed/types'
import type { CardState } from '../../hooks/useCardState'
import { useOpenFile } from '../../hooks/useOpenFile'
import s from '../feed.module.css'
import { useT } from '../../i18n'

const CHIP_CLASS: Record<ChipKind, string> = {
  file: s.chipFile ?? '',
  img: s.chipImg ?? '',
  dir: s.chipDir ?? '',
  cmd: s.chipCmd ?? '',
  ref: s.chipRef ?? '',
  quote: s.chipQuote ?? '',
  paste: s.chipPaste ?? '',
}

interface UserCardProps {
  item: UserItem
  /** What is unfolded in the feed - here it is the pastes inside the message (see PasteView). */
  cards: CardState
  /** Open a link from one's own message in the system browser. */
  onOpenLink: (url: string) => void
}

export const UserCard = ({ item, cards, onOpenLink }: UserCardProps) => {
  const t = useT()

  return (
  <div className={s.user}>
    <div className={s.userHead}>
      <span className={s.label}>{t.feed.you}</span>
      <span className={s.time}>{item.time}</span>
      <div className={s.spacer} />
    </div>

    {/* The quote is shown whole right here: without it a question like "but why?" hangs in the air -
        there is no telling what it is about. */}
    {item.quotes.map((quote, index) => (
      <blockquote key={index} className={s.userQuote}>
        {quote}
      </blockquote>
    ))}

    <div className={s.userBody}>
      {item.tokens.map((token, index) =>
        token.kind === 'text' ? (
          <TextToken key={index} value={token.value} echo={token.echo === true} onOpenLink={onOpenLink} />
        ) : token.chip.kind === 'paste' ? (
          // A paste with nothing after it in the message takes a whole line: the room is free anyway,
          // and seven words in a narrow chip are not enough to recall what exactly was sent.
          <PasteView
            key={index}
            chip={token.chip}
            block={index === item.tokens.length - 1}
            open={cards.isOpen(`${item.id}:paste:${index}`)}
            onToggle={() => cards.toggle(`${item.id}:paste:${index}`)}
          />
        ) : (
          <ChipView key={index} chip={token.chip} />
        ),
      )}
    </div>
  </div>
  )
}

/**
 * The text is shown exactly as it was typed - without markup and without rewrapping of ours: the lines
 * are preserved by .userBody itself (white-space: pre-wrap). An address in the text stays a live link: it
 * is clicked rather than retyped by hand.
 *
 * We dim only what the panel put in itself - the agent's question repeated beside the chosen answer (see
 * UserToken.echo). What a person typed never fades, however it happens to end: the repeat used to be
 * guessed by a question mark at the end of the line, and an ordinary question to the agent ("did you
 * merge it yourself?") went pale - that is, exactly what was the whole message looked unimportant.
 */
const TextToken = ({
  value,
  echo,
  onOpenLink,
}: {
  value: string
  echo: boolean
  onOpenLink: (url: string) => void
}) => (
  <span className={echo ? s.userEcho : undefined}>
    <LinkedText text={value} onOpenLink={onOpenLink} />
  </span>
)

/**
 * An attachment chip inside a sent message.
 *
 * A memo component of its own for the sake of a collapsed paste: its caption and tooltip are computed
 * from the text itself, while the feed repaints on every chunk of a printing answer. The chip meanwhile
 * does not change at all - and recomputing it a hundred times a second serves nothing.
 */
const ChipView = memo(({ chip }: { chip: Chip }) => {
  const t = useT()
  const openFile = useOpenFile()
  const file = openFile ? chipFile(chip) : null
  // No attribute at all when there is nothing to add (see chipTitle): an empty one is still a hover, and
  // an empty box under the pointer reads as something that failed to load.
  const title = chipTitle(chip)
  // What the chip means in the clipboard travels beside it: copied as it looks, `App.tsx` is a name with
  // no path in it, while what the agent was handed is the path itself (see copiedText).
  const copy = { [COPY_ATTRIBUTE]: clipboardText({ kind: 'chip', chip }) }

  /*
   * A chip that stands for a file opens it - a button rather than a span with a click on it, so that a
   * keyboard reaches it as well as a pointer. It was the one file name in the feed that did nothing when
   * clicked, and a person who has just attached a file is the surest to click it. Where there is no
   * editor (the phone), or nothing to open (a folder, a command), it stays the plain chip below.
   *
   * The hover says what a click does, the way it does on every path that opens (see PathLink) - unless
   * the name had to be cut, and then the hover is the only place the whole of it exists (see chipTitle).
   */
  if (file && openFile) {
    return (
      <button
        type="button"
        className={`${s.chip} ${CHIP_CLASS[chip.kind]} ${s.chipOpens}`}
        aria-label={`${t.feed.copy.openFile}: ${chip.value}`}
        data-tooltip={title || t.feed.copy.openFile}
        {...copy}
        onClick={() => openFile(file)}
      >
        {chipLabel(chip)}
      </button>
    )
  }

  return (
    <span className={`${s.chip} ${CHIP_CLASS[chip.kind]}`} data-tooltip={title || undefined} {...copy}>
      {/* There is deliberately no attachment type icon - see renderChipNode in Composer: the chip here is
          a reminder of what was sent, and the colour of the kind is reminder enough. */}
      {chipLabel(chip)}
    </span>
  )
})

/**
 * A paste in a sent message, and the one attachment that opens.
 *
 * It opens because there is nowhere else to read it. A file chip stands for a file that is still on
 * disk; a paste stands for text that exists nowhere but in this message, and the collapsed chip shows
 * seven words of it. That used to be what the hover hint was for - it carried the whole text - and a
 * hundred lines in a hint the width of a hint is a strip of twenty characters down the window, cut off
 * at its edge (see chipTitle). Here the text is in the feed instead: it is selected, copied and found
 * by the browser's own search, and the phone - which has no hover at all and so had no way to see a
 * paste whatsoever - opens it with the same tap.
 *
 * And precisely because it opens, the collapsed chip carries no hint at all - it is the one chip in the
 * panel without one. A hint that repeats the first lines of the text stands over the feed at the very
 * moment the click puts those same lines into it, so it covers the answer it was previewing; and the
 * click itself needs no announcing, since the caret says the chip folds the same way a folded group of
 * calls does.
 *
 * [block] is a paste with nothing after it in the message: the room is free anyway, so the collapsed
 * form takes the whole width and shows the first lines rather than seven words. Standing in the middle
 * of a message it stays an ordinary chip, and the text it opens goes below it on a line of its own.
 *
 * memo for the same reason as the ordinary chip: the feed repaints on every chunk of a printing answer,
 * while a sent paste never changes.
 */
const PasteView = memo(({
  chip,
  block,
  open,
  onToggle,
}: {
  chip: Chip
  block: boolean
  open: boolean
  onToggle: () => void
}) => {
  const t = useT()
  const text = chip.text ?? ''

  // A hundred kilobytes is an ordinary paste, and both of these walk the text whole. Neither is wanted
  // on a repaint that changed a word in the answer below.
  const lines = useMemo(() => pasteLineCount(text), [text])
  const body = useMemo(() => (open ? pasteBody(text) : null), [open, text])

  // A button rather than a span with a click on it: this is the one chip that does something, and a
  // keyboard has to be able to reach it as well as a pointer.
  const collapsed = block ? (
    <button
      type="button"
      className={`${s.chip} ${s.chipPaste} ${s.chipPasteBlock} ${s.chipPasteOpens}`}
      onClick={onToggle}
    >
      <span className={s.chipPasteHead}>
        {/* The same arrow as on a folded group of calls: what folds in this panel says so with it. */}
        <Caret open={false} />
        <span className={s.chipPasteCount}>{t.feed.pastedLines(lines)}</span>
      </span>
      <span className={s.chipPasteText}>{pasteBlockPreview(text)}</span>
    </button>
  ) : (
    <button
      type="button"
      className={`${s.chip} ${s.chipPaste} ${s.chipPasteOpens}`}
      onClick={onToggle}
    >
      {chipLabel(chip)}
    </button>
  )

  if (!open || !body) return collapsed

  return (
    <>
      {/* The chip stays where it was when it is not the whole line: the message keeps reading the way it
          was written, with the text hanging below rather than in place of the attachment. */}
      {!block && collapsed}
      <span className={`${s.chip} ${s.chipPaste} ${s.chipPasteBlock} ${s.chipPasteFull}`}>
        <span className={s.chipPasteHead}>
          {/* Only this closes it back: inside the open text a click is a person selecting a line, and a
              paste that collapses under a selection cannot be copied by hand at all. */}
          <button
            type="button"
            className={s.chipPasteToggle}
            data-tooltip={t.feed.pasteClose}
            onClick={onToggle}
          >
            <Caret open />
            {t.feed.pastedLines(lines)}
          </button>
          {/* The whole paste travels, however much of it is drawn - see pasteBody. */}
          <CopyButton text={text} className={s.chipPasteCopy} title={t.feed.copyPaste} />
        </span>
        <span className={s.chipPasteBody}>{body.text}</span>
        {body.shownLines < body.lines && (
          <span className={s.chipPasteCut}>{t.feed.pasteShown(body.shownLines, body.lines)}</span>
        )}
      </span>
    </>
  )
})
