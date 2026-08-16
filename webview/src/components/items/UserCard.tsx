import { memo } from 'react'
import { linkify } from '../../feed/markdown'
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
          <TextToken key={index} value={token.value} echo={token.echo === true} onOpenLink={onOpenLink} />
        ) : // Вставка, за которой в сообщении уже ничего нет, занимает строку
        // целиком: место всё равно свободно, а по семи словам в узкой плашке не
        // вспомнить, что именно отправил.
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
 * Текст показываем ровно как набрали — без разметки и без своих переносов:
 * строки сохраняет сам .userBody (white-space: pre-wrap). Адрес в тексте
 * остаётся живой ссылкой: её кликают, а не переписывают руками.
 *
 * Приглушаем только то, что подставила сама панель, — повтор вопроса агента
 * рядом с выбранным ответом (см. UserToken.echo). Набранное человеком не
 * тускнеет никогда, чем бы оно ни заканчивалось: раньше повтор угадывался по
 * вопросительному знаку в конце строки, и в блёклое уезжал обычный вопрос
 * агенту («сам замержил?») — то есть выглядело неважным ровно то, что и было
 * всем сообщением.
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
    {linkify(value).map((part, partIndex) =>
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
)

/**
 * Плашка вложения в отправленном сообщении.
 *
 * Отдельным memo-компонентом ради свёрнутой вставки: её подпись и подсказка
 * считаются из самого текста, а лента перерисовывается на каждом кусочке
 * печатающегося ответа. Плашка при этом не меняется вовсе — и пересчитывать её
 * по сто раз в секунду не за чем.
 */
const ChipView = memo(({ chip }: { chip: Chip }) => (
  <span className={`${s.chip} ${CHIP_CLASS[chip.kind]}`} title={chipTitle(chip)}>
    {/* Значка типа вложения нет намеренно — см. renderChipNode в Composer:
        плашка здесь та же, что и в поле ввода, и выглядеть должна так же. */}
    {chipLabel(chip)}
  </span>
))

/**
 * Та же плашка вставки, но во всю ширину — и с началом текста в несколько
 * строк вместо семи слов. Считается из текста вставки, как и обычная, поэтому
 * тоже memo: лента перерисовывается на каждом кусочке печатающегося ответа, а
 * отправленная вставка не меняется никогда.
 */
const PasteBlock = memo(({ chip }: { chip: Chip }) => {
  const text = chip.text ?? ''
  const lines = pasteLineCount(text)

  return (
    <span className={`${s.chip} ${s.chipPaste} ${s.chipPasteBlock}`} title={chipTitle(chip)}>
      <span className={s.chipPasteCount}>
        {lines} {lines === 1 ? 'line' : 'lines'} pasted
      </span>
      <span className={s.chipPasteText}>{pasteBlockPreview(text)}</span>
    </span>
  )
})
