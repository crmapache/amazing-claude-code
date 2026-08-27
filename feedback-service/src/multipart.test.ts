import { describe, expect, it } from 'vitest'
import { boundaryOf, fieldOf, filesOf, parseMultipart } from './multipart.js'

/**
 * The parser, against the body the plugin actually sends and against the bodies it does not.
 *
 * The awkward cases here are not hypothetical: a file whose bytes happen to contain the boundary's text,
 * a filename with a quote in it, a body that stops halfway because the sender went away. Every one of
 * them is a way for a bug report to arrive as gibberish, or for a part of one request to end up read as
 * a header of another.
 */

const body = (boundary: string, parts: { headers: string; value: Buffer | string }[]): Buffer =>
  Buffer.concat([
    ...parts.flatMap((part) => [
      Buffer.from(`--${boundary}\r\n${part.headers}\r\n\r\n`),
      typeof part.value === 'string' ? Buffer.from(part.value) : part.value,
      Buffer.from('\r\n'),
    ]),
    Buffer.from(`--${boundary}--\r\n`),
  ])

describe('finding the boundary', () => {
  it('reads it bare or quoted', () => {
    expect(boundaryOf('multipart/form-data; boundary=abc123')).toBe('abc123')
    expect(boundaryOf('multipart/form-data; boundary="abc 123"')).toBe('abc 123')
  })

  it('answers nothing for anything that is not multipart', () => {
    expect(boundaryOf('application/json')).toBeNull()
    expect(boundaryOf(undefined)).toBeNull()
    expect(boundaryOf('multipart/form-data')).toBeNull()
  })
})

describe('reading the parts', () => {
  it('reads fields and files apart from each other', () => {
    const parts = parseMultipart(
      body('b', [
        { headers: 'Content-Disposition: form-data; name="kind"', value: 'bug' },
        { headers: 'Content-Disposition: form-data; name="text"', value: 'it hangs' },
        {
          headers: 'Content-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png',
          value: Buffer.from([0x89, 0x50]),
        },
      ]),
      'b',
    )

    expect(fieldOf(parts, 'kind')).toBe('bug')
    expect(fieldOf(parts, 'text')).toBe('it hangs')
    // A file is never a field, however it is named: otherwise the bytes of a screenshot could be read as
    // the message itself.
    expect(fieldOf(parts, 'file')).toBe('')
    expect(filesOf(parts, 'file')).toHaveLength(1)
    expect(filesOf(parts, 'file')[0]?.contentType).toBe('image/png')
  })

  it('keeps bytes exactly, including the ones that look like a boundary', () => {
    const sneaky = Buffer.from('some bytes --b and more, but not a real separator')
    const parts = parseMultipart(
      body('b', [{ headers: 'Content-Disposition: form-data; name="file"; filename="x.bin"', value: sneaky }]),
      'b',
    )

    expect(filesOf(parts, 'file')[0]?.bytes.equals(sneaky)).toBe(true)
  })

  it('holds nothing but text in a text field, however the bytes fall', () => {
    const parts = parseMultipart(
      body('b', [{ headers: 'Content-Disposition: form-data; name="text"', value: 'línea con acentos · 中文' }]),
      'b',
    )

    expect(fieldOf(parts, 'text')).toBe('línea con acentos · 中文')
  })

  it('reads nothing out of a body with the wrong boundary', () => {
    expect(parseMultipart(body('b', [{ headers: 'Content-Disposition: form-data; name="text"', value: 'x' }]), 'other'))
      .toHaveLength(0)
  })

  it('gives up where a body stops halfway rather than inventing the rest', () => {
    const cut = body('b', [
      { headers: 'Content-Disposition: form-data; name="text"', value: 'the whole message' },
      { headers: 'Content-Disposition: form-data; name="file"; filename="a"', value: 'half a fi' },
    ]).subarray(0, 130)

    const parts = parseMultipart(cut, 'b')

    // What came whole is read; what did not is not guessed at.
    expect(fieldOf(parts, 'text')).toBe('the whole message')
    expect(filesOf(parts, 'file')).toHaveLength(0)
  })

  it('ignores a part with no name at all', () => {
    const parts = parseMultipart(body('b', [{ headers: 'Content-Type: text/plain', value: 'orphan' }]), 'b')

    expect(parts).toHaveLength(0)
  })

  it('drops an empty file - a dialog cancelled leaves one behind', () => {
    const parts = parseMultipart(
      body('b', [{ headers: 'Content-Disposition: form-data; name="file"; filename=""', value: '' }]),
      'b',
    )

    expect(filesOf(parts, 'file')).toHaveLength(0)
  })
})

describe('a header written in another order', () => {
  it('reads the field name even when the file name comes first', () => {
    // The format allows either order, and "filename" ends with "name" - which used to be enough for the
    // file's name to be taken for the field's, and the whole report to be dropped in silence.
    const parts = parseMultipart(
      body('b', [
        { headers: 'Content-Disposition: form-data; filename="notes.txt"; name="files"', value: 'hello' },
        { headers: 'Content-Disposition: form-data; name="text"', value: 'it broke' },
      ]),
      'b',
    )

    expect(fieldOf(parts, 'text')).toBe('it broke')
    const files = filesOf(parts, 'files')
    expect(files).toHaveLength(1)
    expect(files[0]?.filename).toBe('notes.txt')
  })
})

