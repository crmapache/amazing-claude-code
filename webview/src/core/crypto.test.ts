import { describe, expect, it } from 'vitest'
import {
  agree,
  base64url,
  concat,
  deriveSession,
  deviceProof,
  exportPublic,
  fingerprint,
  generateKeyPair,
  importPublic,
  longLivedAuth,
  resumeSession,
  sameBytes,
  seal,
  unbase64url,
  unseal,
} from './crypto'
import { buildFrame, FRAME_SEALED, headerOf, HEADER_BYTES, parseFrame } from './frame'

/**
 * This half has to agree with the plugin's half exactly, and neither can be checked against the other
 * without running both. So each is checked against the same third thing instead: the standards.
 *
 * The plugin's HKDF is verified against RFC 5869's vectors (see HkdfTest.kt). The browser's HKDF is
 * the platform's own. Both being right about the same specification is what makes them right about
 * each other - which is the property that matters, and the one that would otherwise only be discovered
 * on a real phone.
 */

const address = (fill: number): Uint8Array => new Uint8Array(16).fill(fill)

const hex = (bytes: Uint8Array): string => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')

describe('the sealed channel, from the phone', () => {
  /**
   * Two ends, both sets of keys, exactly as a real pairing makes them - only both halves happen to be
   * in one test here.
   */
  const pairing = async () => {
    const qrSecret = crypto.getRandomValues(new Uint8Array(16))
    const agentStatic = await generateKeyPair(true)
    const deviceStatic = await generateKeyPair(true)
    const agentEphemeral = await generateKeyPair(true)
    const deviceEphemeral = await generateKeyPair(true)

    const agentEphemeralPub = await exportPublic(agentEphemeral.publicKey)
    const deviceEphemeralPub = await exportPublic(deviceEphemeral.publicKey)

    const onDevice = await deriveSession(
      await agree(deviceStatic.privateKey, agentStatic.publicKey),
      await agree(deviceEphemeral.privateKey, agentEphemeral.publicKey),
      qrSecret,
      'agent-1',
      'device-1',
      agentEphemeralPub,
      deviceEphemeralPub,
    )

    const onAgent = await deriveSession(
      await agree(agentStatic.privateKey, deviceStatic.publicKey),
      await agree(agentEphemeral.privateKey, deviceEphemeral.publicKey),
      qrSecret,
      'agent-1',
      'device-1',
      agentEphemeralPub,
      deviceEphemeralPub,
    )

    return { onDevice, onAgent, qrSecret, deviceStatic, agentStaticPub: await exportPublic(agentStatic.publicKey) }
  }

  it('both ends arrive at the same keys without either travelling', async () => {
    const { onDevice, onAgent } = await pairing()

    expect(hex(onDevice.auth)).toEqual(hex(onAgent.auth))
    expect(hex(onDevice.noncePrefixFromAgent)).toEqual(hex(onAgent.noncePrefixFromAgent))
  })

  it('what one end seals the other opens', async () => {
    const { onDevice, onAgent } = await pairing()
    const header = headerOf(FRAME_SEALED, address(1), address(2), 1n)
    const body = new TextEncoder().encode('the agent is waiting for a permission')

    const sealed = await seal(onAgent.fromAgent, onAgent.noncePrefixFromAgent, 1n, header, body)
    const opened = await unseal(onDevice.fromAgent, onDevice.noncePrefixFromAgent, 1n, header, sealed)

    expect(new TextDecoder().decode(opened!)).toEqual('the agent is waiting for a permission')
  })

  /** A key used in both directions is how a message sent to you is replayed back at you. */
  it('the two directions do not share a key', async () => {
    const { onDevice } = await pairing()
    const header = headerOf(FRAME_SEALED, address(1), address(2), 1n)

    const sealed = await seal(onDevice.toAgent, onDevice.noncePrefixToAgent, 1n, header, new Uint8Array([1, 2, 3]))

    expect(await unseal(onDevice.fromAgent, onDevice.noncePrefixFromAgent, 1n, header, sealed)).toBeNull()
  })

  it('a body altered on the way does not open', async () => {
    const { onDevice, onAgent } = await pairing()
    const header = headerOf(FRAME_SEALED, address(1), address(2), 1n)

    const sealed = await seal(onAgent.fromAgent, onAgent.noncePrefixFromAgent, 1n, header, new Uint8Array([9, 9]))
    sealed[0] ^= 1

    expect(await unseal(onDevice.fromAgent, onDevice.noncePrefixFromAgent, 1n, header, sealed)).toBeNull()
  })

  /** The header is covered, so a relay cannot re-address a frame to another device. */
  it('a frame re-addressed on the way does not open', async () => {
    const { onDevice, onAgent } = await pairing()
    const header = headerOf(FRAME_SEALED, address(1), address(2), 1n)
    const altered = headerOf(FRAME_SEALED, address(7), address(2), 1n)

    const sealed = await seal(onAgent.fromAgent, onAgent.noncePrefixFromAgent, 1n, header, new Uint8Array([1]))

    expect(await unseal(onDevice.fromAgent, onDevice.noncePrefixFromAgent, 1n, altered, sealed)).toBeNull()
  })

  it('a frame does not open under someone else\'s counter', async () => {
    const { onDevice, onAgent } = await pairing()
    const header = headerOf(FRAME_SEALED, address(1), address(2), 5n)

    const sealed = await seal(onAgent.fromAgent, onAgent.noncePrefixFromAgent, 5n, header, new Uint8Array([1]))

    expect(await unseal(onDevice.fromAgent, onDevice.noncePrefixFromAgent, 6n, header, sealed)).toBeNull()
  })

  /**
   * The claim the whole feature rests on: a relay that swaps a public key for its own reads everything
   * - unless the two ends then derive different keys, which is what the QR secret buys.
   */
  it('a relay that swapped a key cannot listen in', async () => {
    const qrSecret = crypto.getRandomValues(new Uint8Array(16))
    const agentStatic = await generateKeyPair(true)
    const deviceStatic = await generateKeyPair(true)
    const relayStatic = await generateKeyPair(true)
    const agentEphemeral = await generateKeyPair(true)
    const deviceEphemeral = await generateKeyPair(true)

    const agentPub = await exportPublic(agentEphemeral.publicKey)
    const devicePub = await exportPublic(deviceEphemeral.publicKey)

    const fooled = await deriveSession(
      await agree(deviceStatic.privateKey, relayStatic.publicKey),
      await agree(deviceEphemeral.privateKey, agentEphemeral.publicKey),
      qrSecret,
      'agent-1',
      'device-1',
      agentPub,
      devicePub,
    )

    const real = await deriveSession(
      await agree(agentStatic.privateKey, deviceStatic.publicKey),
      await agree(agentEphemeral.privateKey, deviceEphemeral.publicKey),
      qrSecret,
      'agent-1',
      'device-1',
      agentPub,
      devicePub,
    )

    expect(hex(fooled.auth)).not.toEqual(hex(real.auth))
  })

  it('a proof made without the code does not check out', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(16))
    const wrong = crypto.getRandomValues(new Uint8Array(16))

    const honest = await deviceProof(secret, 'agent-1', 'static', 'ephemeral', 'device-1')
    const forged = await deviceProof(wrong, 'agent-1', 'static', 'ephemeral', 'device-1')

    expect(sameBytes(honest, forged)).toBe(false)
  })

  /** Without separators two different sets of fields run together into one and the same input. */
  it('fields that run together are still told apart', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(16))

    const first = await deviceProof(secret, 'ab', 'cd', 'ef', 'gh')
    const second = await deviceProof(secret, 'a', 'bcd', 'ef', 'gh')

    expect(sameBytes(first, second)).toBe(false)
  })

  /**
   * The long-lived key is not kept anywhere on the phone - it is worked out again from the static key,
   * which the browser will use and never hand back. That only holds while the two ways of arriving at
   * it agree byte for byte: the agent keeps its copy in a keychain and never derives it a second time,
   * so a difference here is every paired phone going quietly dead.
   */
  it('the long-lived key can be worked out again instead of kept', async () => {
    const { onDevice, deviceStatic, agentStaticPub } = await pairing()

    const again = await longLivedAuth(deviceStatic.privateKey, agentStaticPub)

    expect(hex(again)).toEqual(hex(onDevice.auth))
  })

  it('reconnecting derives fresh keys from the long-lived one', async () => {
    const { onDevice, onAgent } = await pairing()
    const agentEphemeral = await generateKeyPair(true)
    const deviceEphemeral = await generateKeyPair(true)
    const agentPub = await exportPublic(agentEphemeral.publicKey)
    const devicePub = await exportPublic(deviceEphemeral.publicKey)

    const resumedDevice = await resumeSession(
      onDevice.auth,
      await agree(deviceEphemeral.privateKey, agentEphemeral.publicKey),
      'agent-1',
      'device-1',
      agentPub,
      devicePub,
    )
    const resumedAgent = await resumeSession(
      onAgent.auth,
      await agree(agentEphemeral.privateKey, deviceEphemeral.publicKey),
      'agent-1',
      'device-1',
      agentPub,
      devicePub,
    )

    expect(hex(resumedDevice.noncePrefixFromAgent)).toEqual(hex(resumedAgent.noncePrefixFromAgent))
    expect(hex(resumedDevice.noncePrefixFromAgent)).not.toEqual(hex(onDevice.noncePrefixFromAgent))
  })

  it('a public key survives the trip out and back', async () => {
    const pair = await generateKeyPair(true)
    const text = await exportPublic(pair.publicKey)

    expect(await exportPublic(await importPublic(text))).toEqual(text)
  })

  /** Shown on two screens and compared by eye, so: short, grouped, and the same on both. */
  it('a fingerprint is four groups of four', async () => {
    const pair = await generateKeyPair(true)

    const shown = await fingerprint(await exportPublic(pair.publicKey))

    expect(shown).toMatch(/^[0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4}$/)
  })

  it('an address survives the trip out and back', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16))

    expect(hex(unbase64url(base64url(bytes)))).toEqual(hex(bytes))
    expect(base64url(bytes)).toHaveLength(22)
  })
})

describe('the envelope', () => {
  it('comes back out exactly as it went in', () => {
    const frame = buildFrame(FRAME_SEALED, address(1), address(2), 42n, new Uint8Array([1, 2, 3]))
    const envelope = parseFrame(frame)

    expect(envelope.type).toEqual(FRAME_SEALED)
    expect(hex(envelope.to)).toEqual(hex(address(1)))
    expect(envelope.counter).toEqual(42n)
    expect(hex(envelope.body)).toEqual('010203')
  })

  it('has a header of exactly forty-two bytes', () => {
    expect(buildFrame(FRAME_SEALED, address(1), address(2), 0n, new Uint8Array(0))).toHaveLength(HEADER_BYTES)
  })

  /** The counter is part of a nonce, so the whole range has to survive the trip. */
  it('carries a counter near the top of its range', () => {
    const counter = 2n ** 63n + 7n
    const frame = buildFrame(FRAME_SEALED, address(1), address(2), counter, new Uint8Array(0))

    expect(parseFrame(frame).counter).toEqual(counter)
  })

  it('refuses an address that is not sixteen bytes', () => {
    expect(() => buildFrame(FRAME_SEALED, new Uint8Array(8), address(2), 0n, new Uint8Array(0))).toThrow()
  })

  it('concatenation keeps every byte in order', () => {
    expect(hex(concat(new Uint8Array([1]), new Uint8Array([2, 3]), new Uint8Array([4])))).toEqual('01020304')
  })
})
