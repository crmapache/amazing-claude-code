/**
 * Подсказка "@" в поле ввода — файлы проекта, а не команды. Список приходит
 * от оболочки один раз и обновляется сам; здесь только фильтрация по набранному.
 */

const MAX_FILE_SUGGESTIONS = 40

/** Совпадения по имени файла идут первыми — так же, как и у слэш-команд. */
export const matchFiles = (files: string[], query: string, limit = MAX_FILE_SUGGESTIONS): string[] => {
  const needle = query.toLowerCase()
  if (!needle) return files.slice(0, limit)

  const starts: string[] = []
  const contains: string[] = []

  for (const file of files) {
    const path = file.toLowerCase()
    const name = path.replace(/\/$/, '').split('/').at(-1) ?? path

    if (name.startsWith(needle) || path.startsWith(needle)) starts.push(file)
    else if (path.includes(needle)) contains.push(file)
  }

  return [...starts, ...contains].slice(0, limit)
}
