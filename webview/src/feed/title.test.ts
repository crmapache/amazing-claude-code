import { describe, expect, it } from 'vitest'
import { deriveSessionTitle } from './title'

describe('deriveSessionTitle', () => {
  it('склеивает короткую первую строку с продолжением', () => {
    expect(deriveSessionTitle('Давай\nсделаем красивый диалог с кнопками')).toBe(
      'Давай сделаем красивый диалог с кнопками',
    )
  })

  it('вырезает inline-тег картинки посреди фразы', () => {
    expect(deriveSessionTitle('смотри [Image #1] сюда, что не так')).toBe('смотри сюда, что не так')
  })

  it('пропускает строки с цитатой и упоминанием файла', () => {
    expect(deriveSessionTitle('> старый текст\n@src/App.tsx\nпочини вот это')).toBe('почини вот это')
  })

  it('если после зачистки ничего не осталось, берёт последнюю исходную строку', () => {
    expect(deriveSessionTitle('@src/App.tsx\n[Image #1]')).toBe('[Image #1]')
  })

  it('обрезает длинный текст по границе слова с многоточием', () => {
    const text = 'разбери пожалуйста эту очень длинную и подробную формулировку задачи целиком'
    const title = deriveSessionTitle(text, 40)

    expect(title.length).toBeLessThanOrEqual(41)
    expect(title.endsWith('…')).toBe(true)
    expect(text.startsWith(title.slice(0, -1))).toBe(true)
  })

  it('короткий текст не трогает', () => {
    expect(deriveSessionTitle('давай')).toBe('давай')
  })
})
