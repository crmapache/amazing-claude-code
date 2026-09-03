import type { IncomingMessage } from 'node:http'

/**
 * Reading a request body without agreeing in advance to hold all of it.
 *
 * The naive shape - collect every chunk, then parse - hands whoever is calling the size of this
 * server's memory: nothing in HTTP says a body has to end, `content-length` is a claim rather than a
 * fact, and a chunked upload does not even make the claim. So the bytes are counted as they arrive and
 * the read is abandoned the moment they pass what the route could possibly want.
 *
 * Null means "there is nothing to parse": either the ceiling was passed - and then [onCeiling] has
 * already answered the caller - or the sender went away mid-sentence.
 */
export const readBody = (
  request: IncomingMessage,
  ceiling: number,
  onCeiling: () => void,
): Promise<Buffer | null> =>
  new Promise((resolve) => {
    let chunks: Buffer[] | null = []
    let size = 0

    request.on('data', (chunk: Buffer) => {
      // Past the ceiling the collected chunks are dropped rather than kept: holding what has already
      // been refused is the same mistake one step later.
      if (chunks === null) return

      size += chunk.length

      if (size > ceiling) {
        chunks = null
        resolve(null)
        onCeiling()
        return
      }

      chunks.push(chunk)
    })

    request.on('end', () => resolve(chunks === null ? null : Buffer.concat(chunks)))
    // A connection that dies mid-body is an ordinary end on a phone network, not an error to throw.
    request.on('error', () => resolve(null))
    request.on('aborted', () => resolve(null))
  })
