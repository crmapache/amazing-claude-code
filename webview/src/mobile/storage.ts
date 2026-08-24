/**
 * What this phone knows: which IDEs it is paired with, and the keys to them.
 *
 * IndexedDB rather than localStorage, and not for room. A service worker - which is what shows a
 * notification while the app is closed - cannot see localStorage at all, and from phase 5 onwards it
 * has to open a sealed push. So the keys have to live somewhere both halves can reach, and this is the
 * only such place.
 *
 * Private keys are stored as CryptoKey handles with extractable: false. The browser then keeps the
 * bytes somewhere no JavaScript can reach: they can be used and never copied. It costs nothing and it
 * takes a whole class of theft off the table.
 */

const DATABASE = 'acc-remote'

const AGENTS = 'agents'

const SETTINGS = 'settings'

export interface PairedAgent {
  /** The agent's address on the relay, which is also how this device names it. */
  agentId: string
  /** What to call it in a list - "WebStorm on max-mbp" rather than 22 characters of base64. */
  label: string
  relay: string
  /** The long-lived key from pairing. Proves who the parties are; never encrypts anything. */
  auth: Uint8Array
  /** This device's own long-lived pair, kept unextractable. */
  staticPrivate: CryptoKey
  staticPublic: string
  /** This device's address on the relay. */
  deviceId: string
  agentStaticPublic: string
  pairedAt: number
}

const open = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(AGENTS)) database.createObjectStore(AGENTS, { keyPath: 'agentId' })
      if (!database.objectStoreNames.contains(SETTINGS)) database.createObjectStore(SETTINGS)
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const run = async <T>(store: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const database = await open()

  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(store, mode)
    const request = work(transaction.objectStore(store))

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => database.close()
  })
}

export const listAgents = (): Promise<PairedAgent[]> =>
  run<PairedAgent[]>(AGENTS, 'readonly', (store) => store.getAll() as IDBRequest<PairedAgent[]>)

export const rememberAgent = async (agent: PairedAgent): Promise<void> => {
  await run(AGENTS, 'readwrite', (store) => store.put(agent))
}

/**
 * Forget an IDE.
 *
 * The mirror of revoking a device from the IDE's side, and it works the same way: with the keys gone
 * nothing from that agent opens, and nothing has to be told to anybody. It is also what this app does
 * when an agent stops recognising it - being revoked and not noticing would leave a person staring at
 * a list that never updates.
 */
export const forgetAgent = async (agentId: string): Promise<void> => {
  await run(AGENTS, 'readwrite', (store) => store.delete(agentId))
}

export const readSetting = <T>(key: string): Promise<T | undefined> =>
  run<T | undefined>(SETTINGS, 'readonly', (store) => store.get(key) as IDBRequest<T | undefined>)

export const writeSetting = async (key: string, value: unknown): Promise<void> => {
  await run(SETTINGS, 'readwrite', (store) => store.put(value, key))
}
