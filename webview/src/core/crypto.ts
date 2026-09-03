/**
 * The phone's half of the sealed channel.
 *
 * Everything here mirrors the plugin's side (see Pairing.kt, Sealing.kt, Hkdf.kt) and has to agree
 * with it exactly - the same curve, the same labels, the same order of inputs. A key derivation that
 * disagrees by one byte produces two sides that both believe they are encrypting correctly and can
 * read nothing of each other.
 *
 * All of it is the platform's own: `crypto.subtle` has had P-256, HKDF and AES-GCM for years. Only the
 * plugin's side has anything hand-written, and only because JDK 21 lacks HKDF.
 *
 * Private keys are generated as non-extractable wherever they can be. It is not a formality: it means
 * there is no call that returns their bytes, so no bug and no injected script can copy them out - only
 * use them where they sit.
 */

const CURVE = 'P-256'

const KEY_BYTES = 32

const NONCE_PREFIX_BYTES = 4

export interface SessionKeys {
  /** What the agent seals with, and what this device therefore reads with. */
  fromAgent: CryptoKey
  toAgent: CryptoKey
  noncePrefixFromAgent: Uint8Array
  noncePrefixToAgent: Uint8Array
  /** Long-lived, for reconnecting later without another QR code. Never used to encrypt anything. */
  auth: Uint8Array
}

export const generateKeyPair = async (extractable = false): Promise<CryptoKeyPair> =>
  crypto.subtle.generateKey({ name: 'ECDH', namedCurve: CURVE }, extractable, ['deriveBits'])

export const exportPublic = async (key: CryptoKey): Promise<string> =>
  base64(new Uint8Array(await crypto.subtle.exportKey('spki', key)))

export const importPublic = async (text: string): Promise<CryptoKey> =>
  crypto.subtle.importKey('spki', unbase64(text) as BufferSource, { name: 'ECDH', namedCurve: CURVE }, true, [])

/**
 * The shared secret two parties reach from their own private key and the other's public one.
 *
 * Never used as a key directly: it goes through HKDF first, which is what gives each direction a key
 * of its own. One key in both directions is how a message sent to you gets replayed back at you and
 * accepted as your own.
 */
export const agree = async (privateKey: CryptoKey, publicKey: CryptoKey): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256))

const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: string, bytes: number): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits'])

  const derived = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: new TextEncoder().encode(info) },
    key,
    bytes * 8,
  )

  return new Uint8Array(derived)
}

const sha256 = async (text: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))

const importAes = (raw: Uint8Array): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])

/**
 * The keys for a freshly paired connection.
 *
 * The inputs and their order mirror Pairing.derive on the plugin's side exactly. The QR secret is one
 * of them, which is what stops a relay that somehow held both private keys from deriving these: it
 * never saw the code.
 */
export const deriveSession = async (
  staticSecret: Uint8Array,
  ephemeralSecret: Uint8Array,
  qrSecret: Uint8Array,
  agentId: string,
  deviceId: string,
  agentEphemeralPub: string,
  deviceEphemeralPub: string,
): Promise<SessionKeys> => {
  const ikm = concat(staticSecret, ephemeralSecret, qrSecret)
  const salt = await sha256(`${agentId}|${deviceId}|${agentEphemeralPub}|${deviceEphemeralPub}`)

  return {
    fromAgent: await importAes(await hkdf(salt, ikm, 'acc/v1/agent-to-device', KEY_BYTES)),
    toAgent: await importAes(await hkdf(salt, ikm, 'acc/v1/device-to-agent', KEY_BYTES)),
    noncePrefixFromAgent: await hkdf(salt, ikm, 'acc/v1/nonce-a2d', NONCE_PREFIX_BYTES),
    noncePrefixToAgent: await hkdf(salt, ikm, 'acc/v1/nonce-d2a', NONCE_PREFIX_BYTES),
    // From the static halves alone, so it survives this connection and can prove who the parties are
    // on the next one - which is what saves a person from scanning a code again.
    auth: await hkdf(new Uint8Array(0), staticSecret, 'acc/v1/auth', KEY_BYTES),
  }
}

/**
 * The long-lived key, worked out again rather than kept.
 *
 * It is what proves this device on every reconnect, so a copy of it is a copy of the device - and a
 * copy left in the database is one any script on this page could read and take away, which is exactly
 * the class of theft the unextractable static key exists to remove. The static key is the only thing
 * needed to arrive at it again, and the browser will use that key without ever handing back its bytes.
 *
 * Byte for byte what pairing derived, and it has to stay that way: the agent holds the same value in
 * its keychain and never derives it again. The empty salt, the label and the length are the whole of
 * the agreement - change any of them and every paired phone goes quietly dead.
 */
export const longLivedAuth = async (staticPrivate: CryptoKey, agentStaticPublic: string): Promise<Uint8Array> =>
  hkdf(new Uint8Array(0), await agree(staticPrivate, await importPublic(agentStaticPublic)), 'acc/v1/auth', KEY_BYTES)

/** Reconnecting: fresh ephemeral keys, vouched for by the long-lived one. No QR code. */
export const resumeSession = async (
  auth: Uint8Array,
  ephemeralSecret: Uint8Array,
  agentId: string,
  deviceId: string,
  agentEphemeralPub: string,
  deviceEphemeralPub: string,
): Promise<SessionKeys> => {
  const salt = await sha256(`${agentId}|${deviceId}|${agentEphemeralPub}|${deviceEphemeralPub}`)
  const ikm = concat(ephemeralSecret, auth)

  return {
    fromAgent: await importAes(await hkdf(salt, ikm, 'acc/v1/agent-to-device', KEY_BYTES)),
    toAgent: await importAes(await hkdf(salt, ikm, 'acc/v1/device-to-agent', KEY_BYTES)),
    noncePrefixFromAgent: await hkdf(salt, ikm, 'acc/v1/nonce-a2d', NONCE_PREFIX_BYTES),
    noncePrefixToAgent: await hkdf(salt, ikm, 'acc/v1/nonce-d2a', NONCE_PREFIX_BYTES),
    auth,
  }
}

/**
 * Proving to the agent that this device saw the QR code.
 *
 * Both public keys are covered, which is the point of it: a relay that swapped one for its own would
 * have to produce this code without the secret, and it has never seen the secret.
 */
export const deviceProof = async (
  secret: Uint8Array,
  agentId: string,
  deviceStaticPub: string,
  deviceEphemeralPub: string,
  deviceId: string,
): Promise<Uint8Array> => mac(secret, ['acc-pair-v1', agentId, deviceStaticPub, deviceEphemeralPub, deviceId])

export const agentProof = async (
  secret: Uint8Array,
  agentId: string,
  deviceId: string,
  agentStaticPub: string,
  agentEphemeralPub: string,
): Promise<Uint8Array> => mac(secret, ['acc-pair-ack-v1', agentId, deviceId, agentStaticPub, agentEphemeralPub])

const mac = async (secret: Uint8Array, parts: string[]): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey(
    'raw',
    secret as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  // Each field followed by a zero byte, exactly as the plugin does it. Without the separator two
  // different sets of fields can run together into one input - the oldest way to make a signature mean
  // less than it looks.
  const encoder = new TextEncoder()
  const pieces = parts.flatMap((part) => [encoder.encode(part), new Uint8Array([0])])

  return new Uint8Array(await crypto.subtle.sign('HMAC', key, concat(...pieces) as BufferSource))
}

/** Twelve bytes: a per-direction prefix and the counter, exactly as the plugin builds it. */
const nonce = (prefix: Uint8Array, counter: bigint): Uint8Array => {
  const out = new Uint8Array(12)
  out.set(prefix, 0)

  const view = new DataView(out.buffer)
  view.setBigUint64(NONCE_PREFIX_BYTES, counter, false)

  return out
}

export const seal = async (
  key: CryptoKey,
  prefix: Uint8Array,
  counter: bigint,
  header: Uint8Array,
  body: Uint8Array,
): Promise<Uint8Array> =>
  new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce(prefix, counter) as BufferSource, additionalData: header as BufferSource, tagLength: 128 },
      key,
      body as BufferSource,
    ),
  )

/**
 * Open a sealed body, or answer null.
 *
 * Null is the whole of the error handling on purpose: a body that does not open came from a device
 * that has been revoked, or was altered on the way, and both are answered the same way - drop it and
 * say nothing back.
 */
export const unseal = async (
  key: CryptoKey,
  prefix: Uint8Array,
  counter: bigint,
  header: Uint8Array,
  sealed: Uint8Array,
): Promise<Uint8Array | null> => {
  try {
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce(prefix, counter) as BufferSource, additionalData: header as BufferSource, tagLength: 128 },
      key,
      sealed as BufferSource,
    )
    return new Uint8Array(opened)
  } catch {
    return null
  }
}

/**
 * A key's fingerprint, in the same four groups the IDE shows. Read off two screens by a person holding
 * a phone, so it has to be short and grouped rather than exact.
 */
export const fingerprint = async (publicKeySpki: string): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', unbase64(publicKeySpki) as BufferSource))

  return [...digest.slice(0, 8)]
    .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
    .join('')
    .replace(/(.{4})/g, '$1 ')
    .trim()
}

export const concat = (...parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)

  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }

  return out
}

/**
 * In pieces rather than in one call: spreading an array into arguments is a stack frame per byte, and
 * past somewhere around a hundred thousand of them the browser refuses outright. Everything encoded
 * here is small today - keys and addresses - which is precisely why the limit would be found by
 * whatever is encoded here tomorrow.
 */
export const base64 = (bytes: Uint8Array): string => {
  let text = ''
  for (let at = 0; at < bytes.length; at += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  }

  return btoa(text)
}

export const unbase64 = (text: string): Uint8Array =>
  Uint8Array.from(atob(text), (character) => character.charCodeAt(0))

export const base64url = (bytes: Uint8Array): string =>
  base64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')

export const unbase64url = (text: string): Uint8Array =>
  unbase64(text.replaceAll('-', '+').replaceAll('_', '/'))

/** Comparing secrets without letting the time taken say how nearly right a guess was. */
export const sameBytes = (first: Uint8Array, second: Uint8Array): boolean => {
  if (first.length !== second.length) return false

  let difference = 0
  for (let index = 0; index < first.length; index += 1) {
    difference |= (first[index] ?? 0) ^ (second[index] ?? 0)
  }

  return difference === 0
}
