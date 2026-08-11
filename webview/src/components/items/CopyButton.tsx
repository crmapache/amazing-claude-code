import { useEffect, useState } from 'react'

interface CopyButtonProps {
  /** Что уйдёт в буфер — уже готовый простой текст, без markdown-разметки. */
  text: string
  className: string
  title: string
}

/** Сколько подряд держим галочку после копирования, прежде чем вернуть иконку. */
const COPIED_FLASH_MS = 1500

/**
 * Кнопка «скопировать» — одна на все места, где копируют кусок ответа: сам
 * ответ целиком, блок кода внутри него. Галочка вместо иконки — единственный
 * ответ на нажатие, который здесь возможен: в буфер нельзя заглянуть.
 */
export const CopyButton = ({ text, className, title }: CopyButtonProps) => {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(false), COPIED_FLASH_MS)
    return () => clearTimeout(timeout)
  }, [copied])

  return (
    <button
      type="button"
      className={className}
      title={title}
      onClick={(event) => {
        // Блок кода лежит внутри карточки ответа, у которой свои обработчики
        // клика (выделение, меню) — нажатие на кнопку до них доходить не должно.
        event.stopPropagation()
        void copyToClipboard(text).then((ok) => {
          if (ok) setCopied(true)
        })
      }}
    >
      {copied ? '✓' : '⧉'}
    </button>
  )
}

/** Сколько ждём современный Clipboard API, прежде чем считать его недоступным. */
const CLIPBOARD_API_TIMEOUT_MS = 300

/**
 * navigator.clipboard в здешнем встроенном в IDE браузере (JCEF) есть не
 * всегда — и, что хуже обычного отказа, может не отклониться с ошибкой, а
 * зависнуть без ответа насовсем (проверено живьём: обычный await так и не
 * дожидается ни успеха, ни отказа). Кнопка при этом рапортовала об успехе
 * (галочка) сразу, не дожидаясь вообще ничего. document.execCommand уже
 * используется в панели для других операций и там работает стабильно, поэтому
 * он — честный запасной путь, если современный API недоступен, упал или молчит
 * дольше разумного. «Успех» теперь значит именно успех, а не просто вызов.
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  if (navigator.clipboard?.writeText) {
    // .catch сразу на самом промисе — иначе он, отказавшись позже, чем таймаут
    // уже выиграл гонку, всплывёт как uncaught (in promise) в консоли.
    const write = navigator.clipboard
      .writeText(text)
      .then(() => 'done' as const)
      .catch(() => 'failed' as const)
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), CLIPBOARD_API_TIMEOUT_MS))

    if ((await Promise.race([write, timeout])) === 'done') return true
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)
  return ok
}
