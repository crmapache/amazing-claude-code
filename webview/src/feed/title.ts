/**
 * Мгновенное название вкладки из первого сообщения — эвристика-заглушка,
 * пока не пришёл настоящий заголовок от LLM (см. sessionTitle в protocol.ts),
 * и запасной вариант, если тот вызов не удался. Та же логика, что и в
 * ClaudeHistory.kt на стороне плагина (для заголовков в панели истории) —
 * держать их синхронно не обязательно дословно, но результат должен быть
 * узнаваемо тем же самым для одного и того же сообщения.
 */

import { withoutShellText } from './bash'

const IMAGE_PLACEHOLDER = /\[Image #\d+]/g
const MULTIPLE_SPACES = / {2,}/g

const stripImageTags = (line: string): string => line.replace(IMAGE_PLACEHOLDER, ' ').replace(MULTIPLE_SPACES, ' ').trim()

const isAttachmentLine = (line: string): boolean => line.startsWith('@') || line.startsWith('> ')

const truncateAtWord = (text: string, max: number): string => {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`
}

/**
 * Склеивает содержательные строки первого сообщения в одну — короткая первая
 * строка («Давай») не должна становиться всем названием вкладки, если суть
 * вопроса написана строкой ниже. Вложения (`@путь`, цитата, `[Image #N]` даже
 * посреди фразы) и вывод команд bash-режима из названия вырезаются как шум.
 */
export const deriveSessionTitle = (text: string, max = 60): string => {
  const rawLines = withoutShellText(text)
    .split('\n')
    .filter((line) => line.trim().length > 0)
  const meaningful = rawLines.map(stripImageTags).filter((line) => line.length > 0 && !isAttachmentLine(line))

  const joined = (meaningful.length > 0 ? meaningful : rawLines.slice(-1)).join(' ').trim()

  return truncateAtWord(joined, max)
}
