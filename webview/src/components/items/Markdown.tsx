import { Reveal } from 'smooth-stream-text/react'
import { createElement } from 'react'
import type { Paragraph, TextPart } from '../../feed/types'
import s from '../feed.module.css'

/**
 * Разобранный markdown на экране — один и тот же для ответа агента и для плана.
 *
 * Раньше план рисовался своей упрощённой раскладкой «номер + строка», и его
 * разметка терялась целиком: жирный текст показывался звёздочками, вложенные
 * пункты становились равноправными шагами с новой нумерацией, а всё, что не
 * пункт списка (заголовки разделов, абзацы-пояснения), пропадало вовсе. Здесь
 * же и там, и там показывается одно и то же — то, что агент написал.
 *
 * `reveal` включает волну проявления по словам: она нужна печатающемуся ответу
 * и мешает готовому плану, который появляется разом.
 */
interface MarkdownProps {
  paragraphs: Paragraph[]
  reveal?: boolean
  onOpenLink: (url: string) => void
}

export const Markdown = ({ paragraphs, reveal = false, onOpenLink }: MarkdownProps) => (
  <>
    {paragraphs.map((paragraph, index) => (
      <ParagraphView key={index} paragraph={paragraph} reveal={reveal} onOpenLink={onOpenLink} />
    ))}
  </>
)

/** Отступ одного уровня вложенности списка. */
const INDENT_PX = 14

const ParagraphView = ({
  paragraph,
  reveal,
  onOpenLink,
}: {
  paragraph: Paragraph
  reveal: boolean
  onOpenLink: (url: string) => void
}) => {
  if (paragraph.codeBlock) {
    return (
      <Piece reveal={reveal} as="pre" className={s.codeBlock}>
        {paragraph.parts.map((part) => part.text).join('')}
      </Piece>
    )
  }

  const paraClass = [s.para, paragraph.bullet && s.paraBullet, paragraph.heading && s.paraHeading]
    .filter(Boolean)
    .join(' ')

  const depth = paragraph.depth ?? 0

  return (
    <div className={paraClass} style={depth > 0 ? { marginLeft: depth * INDENT_PX } : undefined}>
      {/* Нумерованный пункт остаётся нумерованным: свой номер у шага важнее
          единообразного тире, по нему на шаг и ссылаются. */}
      {paragraph.bullet ? <span className={s.bullet}>{paragraph.marker ?? '—'} </span> : null}
      {paragraph.parts.map((part, index) => (
        <PartView key={index} part={part} reveal={reveal} onOpenLink={onOpenLink} />
      ))}
    </div>
  )
}

/**
 * Кусок текста: с волной проявления или без. Без неё это обычный span/pre —
 * тот же класс, та же вёрстка, разница только в анимации появления.
 */
const Piece = ({
  reveal,
  as,
  className,
  children,
}: {
  reveal: boolean
  as?: 'pre' | 'span'
  className?: string
  children: string
}) =>
  reveal ? (
    <Reveal as={as} className={className}>
      {children}
    </Reveal>
  ) : (
    createElement(as ?? 'span', { className }, children)
  )

const PartView = ({
  part,
  reveal,
  onOpenLink,
}: {
  part: TextPart
  reveal: boolean
  onOpenLink: (url: string) => void
}) => {
  if (part.href) {
    const href = part.href
    return (
      <a
        href={href}
        // Ссылка в заголовке остаётся и ссылкой, и жирной: одно другого не
        // отменяет — по ней кликают, но это по-прежнему заголовок раздела.
        className={part.strong ? `${s.link} ${s.strong}` : s.link}
        // Открываем в системном браузере через хост-IDE: обычная навигация увела бы
        // сам вебвью панели на этот адрес вместо показа его снаружи.
        onClick={(event) => {
          event.preventDefault()
          onOpenLink(href)
        }}
      >
        <Piece reveal={reveal}>{part.text}</Piece>
      </a>
    )
  }

  if (part.code) return <Piece reveal={reveal} className={s.code}>{part.text}</Piece>
  if (part.mark) return <Piece reveal={reveal} className={s.mark}>{part.text}</Piece>
  if (part.strong) return <Piece reveal={reveal} className={s.strong}>{part.text}</Piece>
  return <Piece reveal={reveal}>{part.text}</Piece>
}
