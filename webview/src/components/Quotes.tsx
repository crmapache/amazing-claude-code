import s from './composer.module.css'
import { useT } from '../i18n'

export interface Quote {
  id: string
  text: string
}

interface QuotesProps {
  items: Quote[]
  onRemove: (id: string) => void
}

/** Pieces of output selected with the mouse: they will travel along with the next message. */
export const Quotes = ({ items, onRemove }: QuotesProps) => {
  const t = useT()
  if (items.length === 0) return null

  return (
    <div className={s.quotes}>
      {items.map((quote, index) => (
        <div key={quote.id} className={s.quote}>
          <span className={s.quoteLabel}>REF {index + 1}</span>
          <span className={s.quoteText}>
            “{quote.text.length > 120 ? `${quote.text.slice(0, 120)}…` : quote.text}”
          </span>
          <span className={s.quoteSrc}>{t.feed.fromOutput}</span>
          <button type="button" className={s.iconButton} onClick={() => onRemove(quote.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
