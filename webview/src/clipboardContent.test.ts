import { describe, expect, it } from 'vitest'
import { EMPTY_CLIPBOARD, isEmptyClipboard, pickPasted, type ClipboardContent } from './clipboardContent'

const held = (over: Partial<ClipboardContent> = {}): ClipboardContent => ({
  ...EMPTY_CLIPBOARD,
  ...over,
})

/** A file without a browser to make one: nothing here looks inside it. */
const file = () => ({}) as File

describe('isEmptyClipboard', () => {
  it('is true for a clipboard holding nothing', () => {
    expect(isEmptyClipboard(EMPTY_CLIPBOARD)).toBe(true)
  })

  it('is false for anything at all, a file included', () => {
    expect(isEmptyClipboard(held({ text: 'a' }))).toBe(false)
    expect(isEmptyClipboard(held({ html: '<b>a</b>' }))).toBe(false)
    expect(isEmptyClipboard(held({ image: 'data:image/png;base64,AA==' }))).toBe(false)
    // A screenshot arrives as a file and often with no text beside it.
    expect(isEmptyClipboard(held({ files: [file()] }))).toBe(false)
  })
})

describe('pickPasted', () => {
  it('takes the system clipboard even when the browser has something of its own', () => {
    // The report this was fixed for: a copy made inside the panel stays in the browser's private
    // clipboard for good, and every later copy made outside never reaches the panel at all.
    const system = held({ text: 'copied in the editor' })
    const browser = held({ text: 'copied in the panel an hour ago' })

    expect(pickPasted(system, browser)).toBe(system)
  })

  it('takes the system clipboard when the browser has nothing', () => {
    const system = held({ text: 'copied in the editor' })

    expect(pickPasted(system, EMPTY_CLIPBOARD)).toBe(system)
  })

  it('falls back to the browser when the system clipboard said nothing', () => {
    // Either it is genuinely empty or it never answered - on X11 the two look the same from here.
    const browser = held({ text: 'copied in the panel', files: [file()] })

    expect(pickPasted(EMPTY_CLIPBOARD, browser)).toBe(browser)
  })

  it('leaves nothing to paste when both are empty', () => {
    expect(isEmptyClipboard(pickPasted(EMPTY_CLIPBOARD, EMPTY_CLIPBOARD))).toBe(true)
  })
})
