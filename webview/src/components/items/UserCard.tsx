import { memo } from 'react'
import { LinkedText } from './LinkedText'
import { chipLabel, chipTitle, pasteBlockPreview, pasteLineCount } from '../../feed/reference'
import type { Chip, ChipKind, UserItem } from '../../feed/types'
import s from '../feed.module.css'

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
  /** Open a link from one's own message in the system browser. */
  onOpenLink: (url: string) => void
}

export const UserCard = ({ item, onOpenLink }: UserCardProps) => (
  <div className={s.user}>
    <div className={s.userHead}>
      <span className={s.label}>YOU</span>
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
        ) : // A paste with nothing after it in the message takes a whole line: the room is free anyway,
        // and seven words in a narrow chip are not enough to recall what exactly was sent.
        token.chip.kind === 'paste' && index === item.tokens.length - 1 ? (
          <PasteBlock key={index} chip={token.chip} />
        ) : (
          <ChipView key={index} chip={token.chip} />
        ),
      )}
    </div>
  </div>
)

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
const ChipView = memo(({ chip }: { chip: Chip }) => (
  <span className={`${s.chip} ${CHIP_CLASS[chip.kind]}`} data-tooltip={chipTitle(chip)}>
    {/* There is deliberately no attachment type icon - see renderChipNode in Composer: the chip here is
        the same one as in the input field and should look the same. */}
    {chipLabel(chip)}
  </span>
))

/**
 * The same paste chip, but full width - and with the start of the text over several lines instead of
 * seven words. It is computed from the paste's text like the ordinary one, hence memo as well: the feed
 * repaints on every chunk of a printing answer, while a sent paste never changes.
 */
const PasteBlock = memo(({ chip }: { chip: Chip }) => {
  const text = chip.text ?? ''
  const lines = pasteLineCount(text)

  return (
    <span className={`${s.chip} ${s.chipPaste} ${s.chipPasteBlock}`} data-tooltip={chipTitle(chip)}>
      <span className={s.chipPasteCount}>
        {lines} {lines === 1 ? 'line' : 'lines'} pasted
      </span>
      <span className={s.chipPasteText}>{pasteBlockPreview(text)}</span>
    </span>
  )
})
