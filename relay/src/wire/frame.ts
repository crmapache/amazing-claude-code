/**
 * The envelope, and the only part of a message this server can read.
 *
 * It is binary and fixed: a header of exactly 42 bytes, then a body the relay never looks inside. That
 * is deliberate. "The relay cannot read your code" is a claim, and a claim is worth what the code
 * behind it is worth - so there is no code here that could read it. Nothing parses the body, nothing
 * decodes it, nothing logs it. Routing is done by two opaque addresses read at fixed offsets.
 *
 * The same header carries a plaintext body today and a sealed one from phase 3 onwards. The relay does
 * not change between the two: it never knew the difference.
 */

export const HEADER_BYTES = 42

export const WIRE_VERSION = 1

export const FrameType = {
  /** An envelope between two paired parties. The body means nothing here. */
  SEALED: 0x01,
  /**
   * The relay's own word to one side - and the only thing it ever says. It says one thing: "there was
   * a break, resynchronise". A separate type so that it can never be mistaken for content: a receiver
   * treats it as advice and never as something an agent said.
   */
  CONTROL: 0x02,
  /**
   * "Wake this device": the agent could not reach it over a socket, so the relay should hand this to a
   * push service instead. The body is sealed exactly as any other - the relay passes it on without
   * reading it, and the push service cannot read it either.
   */
  PUSH: 0x03,
} as const

export type FrameTypeValue = (typeof FrameType)[keyof typeof FrameType]

export interface Frame {
  version: number
  type: FrameTypeValue
  /** 16 opaque bytes. Who this address belongs to is not something the relay can know. */
  to: Buffer
  from: Buffer
  /** The sender's counter for this direction - it becomes part of the nonce in phase 3. */
  counter: bigint
  body: Buffer
}

export class FrameError extends Error {}

export const parse = (raw: Buffer, maxBytes: number): Frame => {
  if (raw.length < HEADER_BYTES) throw new FrameError('frame shorter than its header')
  if (raw.length > maxBytes) throw new FrameError('frame over the size limit')

  const version = raw.readUInt8(0)
  if (version !== WIRE_VERSION) throw new FrameError(`unknown wire version ${version}`)

  const type = raw.readUInt8(1)
  if (type !== FrameType.SEALED && type !== FrameType.CONTROL && type !== FrameType.PUSH) {
    throw new FrameError(`unknown frame type ${type}`)
  }

  return {
    version,
    type,
    to: raw.subarray(2, 18),
    from: raw.subarray(18, 34),
    counter: raw.readBigUInt64BE(34),
    body: raw.subarray(HEADER_BYTES),
  }
}

export const build = (frame: Omit<Frame, 'version'>): Buffer => {
  if (frame.to.length !== 16 || frame.from.length !== 16) {
    throw new FrameError('an address is exactly 16 bytes')
  }

  const header = Buffer.alloc(HEADER_BYTES)
  header.writeUInt8(WIRE_VERSION, 0)
  header.writeUInt8(frame.type, 1)
  frame.to.copy(header, 2)
  frame.from.copy(header, 18)
  header.writeBigUInt64BE(frame.counter, 34)

  return Buffer.concat([header, frame.body])
}

/**
 * An address as it travels in a URL: 16 bytes as 22 characters of base64url.
 *
 * Addresses are the one thing the relay does keep in memory, so it is worth being plain about what
 * they are: 16 random bytes with nothing derived from a person, a machine or a project in them. They
 * are stable, though, which means this server could link one agent's sessions over time - and that is
 * said out loud in the privacy notes rather than left to be discovered.
 */
export const decodeAddress = (text: string): Buffer => {
  const bytes = Buffer.from(text, 'base64url')
  if (bytes.length !== 16) throw new FrameError('an address is exactly 16 bytes')
  return bytes
}

export const encodeAddress = (address: Buffer): string => address.toString('base64url')

/** The first four bytes, for a log line. Never the whole address, and never the body. */
export const addressHint = (address: Buffer): string => address.subarray(0, 4).toString('hex')

/**
 * The one message the relay composes by itself: "the buffer overflowed or expired, ask for the tail
 * again". It carries no body, because it has nothing to say beyond its own type.
 */
export const controlFrame = (to: Buffer, from: Buffer): Buffer =>
  build({ type: FrameType.CONTROL, to, from, counter: 0n, body: Buffer.alloc(0) })
