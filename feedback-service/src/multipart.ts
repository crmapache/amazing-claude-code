/**
 * Reading multipart/form-data, by hand.
 *
 * Written rather than installed for the same reason the relay has one dependency and no more: this
 * service exists to move a bug report to a chat, and a dependency tree for parsing one well-specified
 * body is a larger thing to keep an eye on than the parser. It reads what the plugin sends (see
 * FeedbackSender on its side) and refuses the rest instead of guessing - there is exactly one client.
 *
 * What it does not do is stream to disk. The bodies are bounded before they get here (see [readBody]),
 * so a part is a slice of one buffer, and slices in Node share that buffer rather than copying it.
 */

export interface Part {
  name: string
  filename?: string
  contentType?: string
  bytes: Buffer
}

/** The boundary out of a content-type header, or null when this is not a multipart body at all. */
export const boundaryOf = (contentType: string | undefined): string | null => {
  if (!contentType || !contentType.toLowerCase().includes('multipart/form-data')) return null

  // Quoted or bare, and never past a semicolon: a boundary with a quote in it is not one.
  const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType)
  const found = match?.[1] ?? match?.[2]

  return found && found.length > 0 ? found : null
}

export const parseMultipart = (body: Buffer, boundary: string): Part[] => {
  const parts: Part[] = []
  const separator = Buffer.from(`\r\n--${boundary}`)

  // The first separator has no CRLF before it, so one is put there: then every part in the body is
  // found the same way, and the loop needs no special case for the first.
  const framed = Buffer.concat([Buffer.from('\r\n'), body])

  let at = framed.indexOf(separator)
  if (at === -1) return parts

  while (at !== -1) {
    let cursor = at + separator.length

    // "--" straight after the boundary is the end of the body. Anything else should be a CRLF.
    if (framed.subarray(cursor, cursor + 2).toString('latin1') === '--') break
    if (framed.subarray(cursor, cursor + 2).toString('latin1') !== '\r\n') break
    cursor += 2

    const headersEnd = framed.indexOf('\r\n\r\n', cursor)
    if (headersEnd === -1) break

    const headers = framed.subarray(cursor, headersEnd).toString('utf8')
    const next = framed.indexOf(separator, headersEnd)
    if (next === -1) break

    const part = partOf(headers, framed.subarray(headersEnd + 4, next))
    if (part) parts.push(part)

    at = next
  }

  return parts
}

const partOf = (headers: string, bytes: Buffer): Part | null => {
  const disposition = headers
    .split('\r\n')
    .find((line) => line.toLowerCase().startsWith('content-disposition:'))

  if (!disposition) return null

  const name = valueOf(disposition, 'name')
  if (!name) return null

  const filename = valueOf(disposition, 'filename')
  const contentType = headers
    .split('\r\n')
    .find((line) => line.toLowerCase().startsWith('content-type:'))
    ?.slice('content-type:'.length)
    .trim()

  return {
    name,
    ...(filename ? { filename } : {}),
    ...(contentType ? { contentType } : {}),
    bytes,
  }
}

/**
 * One parameter of a header, by name: `name="report"` out of a content disposition.
 *
 * The name has to begin a parameter rather than merely appear somewhere, because "filename" ends with
 * "name": a client that writes the file's name before the field's - which the format allows, and which is
 * only luck on our side that ours does not - had its filename read as the field name. Nothing then
 * answered to the name the report is looked up by, and the request was dropped without a word to anyone.
 */
const valueOf = (header: string, key: string): string | undefined => {
  const match = new RegExp(`(?:^|[;\\s])${key}="([^"]*)"`, 'i').exec(header)
  return match?.[1]
}

/** A text field, as text. Absent and empty are the same thing to everything downstream. */
export const fieldOf = (parts: Part[], name: string): string =>
  parts.find((part) => part.name === name && part.filename === undefined)?.bytes.toString('utf8').trim() ?? ''

/** The parts that came as files, in the order they were sent. */
export const filesOf = (parts: Part[], name: string): Part[] =>
  parts.filter((part) => part.name === name && part.filename !== undefined && part.bytes.length > 0)
