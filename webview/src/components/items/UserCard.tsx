import { chipLabel } from '../../feed/reference'
import type { ChipKind, UserItem } from '../../feed/types'
import s from '../feed.module.css'

const CHIP_GLYPH: Record<ChipKind, string> = { file: '▤', img: '▣', dir: '▸', cmd: '/', ref: '⟨⟩', quote: '"' }
const CHIP_CLASS: Record<ChipKind, string> = {
  file: s.chipFile ?? '',
  img: s.chipImg ?? '',
  dir: s.chipDir ?? '',
  cmd: s.chipCmd ?? '',
  ref: s.chipRef ?? '',
  quote: s.chipQuote ?? '',
}

interface UserCardProps {
  item: UserItem
}

export const UserCard = ({ item }: UserCardProps) => (
  <div className={s.user}>
    <div className={s.userHead}>
      <span className={s.label}>YOU</span>
      <span className={s.time}>{item.time}</span>
      <div className={s.spacer} />
    </div>

    {/* Цитату показываем целиком прямо здесь: без неё вопрос вида «а почему?»
        повисает в воздухе — непонятно, о чём он. */}
    {item.quotes.map((quote, index) => (
      <blockquote key={index} className={s.userQuote}>
        {quote}
      </blockquote>
    ))}

    <div className={s.userBody}>
      {item.tokens.map((token, index) =>
        token.kind === 'text' ? (
          <span key={index}>{token.value}</span>
        ) : (
          <span
            key={index}
            className={`${s.chip} ${CHIP_CLASS[token.chip.kind]}`}
            title={
              token.chip.kind === 'quote'
                ? (token.chip.text ?? '')
                : token.chip.range
                  ? `${token.chip.value} ${token.chip.range}`
                  : token.chip.value
            }
          >
            <span className={s.chipGlyph}>{CHIP_GLYPH[token.chip.kind]}</span>
            {chipLabel(token.chip)}
          </span>
        ),
      )}
    </div>
  </div>
)
