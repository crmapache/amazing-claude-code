import { linkify } from '../../feed/markdown'
import s from '../feed.module.css'

interface LinkedTextProps {
  text: string
  /** Открыть адрес в системном браузере, а не внутри вебвью панели. */
  onOpenLink: (url: string) => void
}

/**
 * Текст ровно такой, каким пришёл, но с живыми адресами внутри.
 *
 * Для мест, где разметку разбирать нельзя: в сообщении человека звёздочки и
 * решётки значат сами себя, а ошибка — это строка от процесса, а не markdown.
 * Адрес при этом обязан оставаться адресом: по ссылке на статус сервиса из
 * «API Error … check https://status.claude.com» кликают, а не переписывают её
 * руками в браузер.
 */
export const LinkedText = ({ text, onOpenLink }: LinkedTextProps) => (
  <>
    {linkify(text).map((part, index) =>
      part.href ? (
        <a
          key={index}
          href={part.href}
          className={s.link}
          // Наружу, в системный браузер: обычная навигация увела бы на этот
          // адрес сам вебвью панели, вместе с интерфейсом.
          onClick={(event) => {
            event.preventDefault()
            onOpenLink(part.href ?? '')
          }}
        >
          {part.text}
        </a>
      ) : (
        <span key={index}>{part.text}</span>
      ),
    )}
  </>
)
