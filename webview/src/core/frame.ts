/**
 * The envelope, as the phone builds and reads it.
 *
 * The third copy of one format - the relay has one (relay/src/wire/frame.ts) and the plugin has one
 * (Frame.kt) - and all three are obliged to agree byte for byte. They are small and they never change
 * without all three changing, which is why they are copies rather than a shared package: a package
 * shared across a JVM plugin, a Node server and a browser bundle costs more to keep than these forty
 * lines do.
 */

export const HEADER_BYTES = 42

export const WIRE_VERSION = 1

export const FRAME_SEALED = 0x01

/** The relay's own word, and the only one it says: "there was a break, ask again". Never content. */
export const FRAME_CONTROL = 0x02

/** "Wake this device" - the agent asking the relay to deliver this through a push service. */
export const FRAME_PUSH = 0x03

export const ADDRESS_BYTES = 16

export interface Envelope {
  version: number
  type: number
  to: Uint8Array
  from: Uint8Array
  counter: bigint
  body: Uint8Array
}

export const buildFrame = (
  type: number,
  to: Uint8Array,
  from: Uint8Array,
  counter: bigint,
  body: Uint8Array,
): Uint8Array => {
  if (to.length !== ADDRESS_BYTES || from.length !== ADDRESS_BYTES) {
    throw new Error('an address is exactly 16 bytes')
  }

  const frame = new Uint8Array(HEADER_BYTES + body.length)
  const view = new DataView(frame.buffer)

  view.setUint8(0, WIRE_VERSION)
  view.setUint8(1, type)
  frame.set(to, 2)
  frame.set(from, 18)
  view.setBigUint64(34, counter, false)
  frame.set(body, HEADER_BYTES)

  return frame
}

export const parseFrame = (raw: Uint8Array): Envelope => {
  if (raw.length < HEADER_BYTES) throw new Error('frame shorter than its header')

  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  const version = view.getUint8(0)
  if (version !== WIRE_VERSION) throw new Error(`unknown wire version ${version}`)

  return {
    version,
    type: view.getUint8(1),
    to: raw.slice(2, 18),
    from: raw.slice(18, 34),
    counter: view.getBigUint64(34, false),
    body: raw.slice(HEADER_BYTES),
  }
}

/**
 * The header alone, which is what the tag covers.
 *
 * Sealing over it is what stops a relay taking a frame meant for one device and handing it to another:
 * the addresses are part of what was authenticated, so a changed one breaks the tag.
 */
export const headerOf = (type: number, to: Uint8Array, from: Uint8Array, counter: bigint): Uint8Array =>
  buildFrame(type, to, from, counter, new Uint8Array(0))
