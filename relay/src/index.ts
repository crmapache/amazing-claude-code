import { readConfig, RELAY_VERSION } from './config.js'
import { createRelay } from './server.js'

/**
 * Starting the relay. Everything it does lives in server.ts; this file only decides that it should
 * begin, so that a test can raise a relay of its own without one starting on import.
 */

const config = readConfig()

const log = (line: string): void => {
  if (config.logLevel === 'silent') return
  // Only ever this shape: what happened, the first four bytes of an address, a size, a time. Never a
  // body - not even in an error path, which is exactly where "attach the bytes for diagnosis" gets
  // written.
  process.stdout.write(`${new Date().toISOString()} ${line}\n`)
}

const port = await createRelay(config, log).listen(config.port)

log(`relay ${RELAY_VERSION} listening on ${port}`)
