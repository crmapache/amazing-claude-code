import { describe, expect, it } from 'vitest'
import {
  CLIPBOARD_ATTRIBUTE,
  clipboardHtml,
  clipboardTokens,
  composePrompt,
  imageAttachments,
  tokensText,
  trimTrailingSpace,
} from './tokens'
import type { UserToken } from './types'

const PNG = 'data:image/png;base64,iVBORw0KGgo='
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='

const text = (value: string): UserToken => ({ kind: 'text', value })
const image = (value: string, data = PNG): UserToken => ({ kind: 'chip', chip: { kind: 'img', value, data } })

describe('tokensText', () => {
  it('нумерует картинки по месту, а не по подписи, оставшейся от вставки', () => {
    const tokens = [image('Image #7'), text(' и '), image('Image #2')]
    expect(tokensText(tokens)).toBe('[Image #1] и [Image #2]')
  })

  it('продолжает нумерацию с того, сколько картинок уже ушло в сессии', () => {
    expect(tokensText([image('Image #1')], 3)).toBe('[Image #4]')
  })

  it('картинку без байтов отдаёт ссылкой на файл: в скобках агент её не прочитает', () => {
    const picked: UserToken = { kind: 'chip', chip: { kind: 'img', value: 'assets/logo.png' } }
    expect(tokensText([picked])).toBe('@assets/logo.png')
  })

  it('остальные вложения отдаёт так же, как их видит агент', () => {
    const tokens: UserToken[] = [
      { kind: 'chip', chip: { kind: 'cmd', value: 'model' } },
      text(' '),
      { kind: 'chip', chip: { kind: 'ref', value: 'src/App.tsx', range: 'L1-L4' } },
      text(' '),
      { kind: 'chip', chip: { kind: 'dir', value: 'src/feed/' } },
      text(' '),
      { kind: 'chip', chip: { kind: 'quote', value: 'ref1', text: 'кусок кода' } },
    ]
    expect(tokensText(tokens)).toBe('/model @src/App.tsx (L1-L4) @src/feed/ "кусок кода"')
  })
})

describe('trimTrailingSpace', () => {
  it('убирает перевод строки, на котором стоял курсор: в поле его было не видно', () => {
    expect(trimTrailingSpace([text('раз'), text('\n')])).toEqual([text('раз')])
  })

  it('снимает пустой хвост целиком, сколько бы токенов он ни занимал', () => {
    expect(trimTrailingSpace([text('раз'), text('\n'), text('\n  ')])).toEqual([text('раз')])
  })

  it('режет хвост внутри самого токена, не трогая переносы в середине', () => {
    expect(trimTrailingSpace([text('раз\nдва\n\n')])).toEqual([text('раз\nдва')])
  })

  it('вложение в конце оставляет как есть — оно видимое', () => {
    const tokens = [text('смотри '), image('Image #1')]
    expect(trimTrailingSpace(tokens)).toEqual(tokens)
  })

  it('сообщение из одних пробелов сходит на нет', () => {
    expect(trimTrailingSpace([text('  \n')])).toEqual([])
  })
})

describe('composePrompt', () => {
  it('поднимает цитаты отдельными строками над самим сообщением', () => {
    const draft = { tokens: [text('почини это')], quotes: [{ text: 'const a = 1' }] }
    expect(composePrompt(draft, 0)).toBe('> const a = 1\nпочини это')
  })

  it('нумерация в тексте совпадает с порядком байтов, которые уйдут рядом', () => {
    const tokens = [image('Image #1', PNG), text(' против '), image('Image #2', JPEG)]

    expect(composePrompt({ tokens, quotes: [] }, 0)).toBe('[Image #1] против [Image #2]')
    expect(imageAttachments(tokens).map((item) => item.mediaType)).toEqual(['image/png', 'image/jpeg'])
  })
})

describe('imageAttachments', () => {
  it('отдаёт тип и байты отдельно, без приставки data-url', () => {
    expect(imageAttachments([image('Image #1')])).toEqual([{ mediaType: 'image/png', data: 'iVBORw0KGgo=' }])
  })

  it('пропускает вложения без байтов', () => {
    const picked: UserToken = { kind: 'chip', chip: { kind: 'img', value: 'assets/logo.png' } }
    expect(imageAttachments([picked, text('привет')])).toEqual([])
  })
})

describe('буфер обмена', () => {
  const tokens = [text('смотри '), image('Image #1'), text(' сюда')]

  it('возвращает те же вложения вместе с байтами картинки', () => {
    expect(clipboardTokens(clipboardHtml(tokens))).toEqual(tokens)
  })

  it('переживает обёртку, которой браузер оборачивает вставку', () => {
    const wrapped = `<html><body><!--StartFragment-->${clipboardHtml(tokens)}<!--EndFragment--></body></html>`
    expect(clipboardTokens(wrapped)).toEqual(tokens)
  })

  it('рядом кладёт читаемый текст — тот же, что увидит агент', () => {
    expect(clipboardHtml(tokens)).toContain('смотри [Image #1] сюда')
  })

  it('не ломается на угловых скобках в тексте', () => {
    const html = clipboardHtml([text('a < b > c')])
    expect(html).toContain('a &lt; b &gt; c')
    expect(clipboardTokens(html)).toEqual([text('a < b > c')])
  })

  it('чужое содержимое буфера не признаёт своим', () => {
    expect(clipboardTokens('<b>просто разметка</b>')).toBeNull()
    expect(clipboardTokens('')).toBeNull()
  })

  it('на испорченной записи откатывается, а не подсовывает половину', () => {
    expect(clipboardTokens(`<span ${CLIPBOARD_ATTRIBUTE}="не json"></span>`)).toBeNull()
    expect(clipboardTokens(`<span ${CLIPBOARD_ATTRIBUTE}="${encodeURIComponent('[]')}"></span>`)).toBeNull()
    expect(
      clipboardTokens(`<span ${CLIPBOARD_ATTRIBUTE}="${encodeURIComponent(JSON.stringify([{ kind: 'wat' }]))}"></span>`),
    ).toBeNull()
  })

  it('картинку с неразборными байтами отвергает целиком: плашка обещала бы вложение', () => {
    const broken = [{ kind: 'chip', chip: { kind: 'img', value: 'Image #1', data: 'мусор' } }]
    expect(
      clipboardTokens(`<span ${CLIPBOARD_ATTRIBUTE}="${encodeURIComponent(JSON.stringify(broken))}"></span>`),
    ).toBeNull()
  })
})
