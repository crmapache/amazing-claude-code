import { linkify } from '../../feed/markdown'
import { chipLabel } from '../../feed/reference'
import type { ChipKind, UserItem } from '../../feed/types'
import s from '../feed.module.css'

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
  /** Открыть ссылку из собственного сообщения в системном браузере. */
  onOpenLink: (url: string) => void
}

export const UserCard = ({ item, onOpenLink }: UserCardProps) => (
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
          // Текст показываем ровно как набрали — без разметки, — но адрес в нём
          // остаётся живой ссылкой: её кликают, а не переписывают руками.
          <span key={index}>
            {linkify(token.value).map((part, partIndex) =>
              part.href ? (
                <a
                  key={partIndex}
                  href={part.href}
                  className={s.link}
                  // Как и в ответе агента: наружу, в системный браузер, иначе
                  // сам вебвью панели уехал бы на этот адрес.
                  onClick={(event) => {
                    event.preventDefault()
                    onOpenLink(part.href ?? '')
                  }}
                >
                  {part.text}
                </a>
              ) : (
                <span key={partIndex}>{part.text}</span>
              ),
            )}
          </span>
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
            {/* Значка типа вложения нет намеренно — см. renderChipNode в Composer:
                плашка здесь та же, что и в поле ввода, и выглядеть должна так же. */}
            {chipLabel(token.chip)}
          </span>
        ),
      )}
    </div>
  </div>
)
