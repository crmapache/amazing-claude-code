import { readConfig, SERVICE_VERSION } from './config.js'
import { createService } from './server.js'
import { Store } from './store.js'

/**
 * Starting the service. Everything it does lives in server.ts; this file only decides that it should
 * begin, so that a test can raise one of its own without one starting on import.
 */

const config = readConfig()

const log = (line: string): void => {
  if (config.logLevel === 'silent') return
  // What happened, a hint of who, a size, a time. Never a report's contents and never an address whole.
  process.stdout.write(`${new Date().toISOString()} ${line}\n`)
}

const store = new Store(config.database)

/** Old days go once at startup and then once a day - a service that runs for months still forgets. */
const prune = (): void => {
  try {
    store.prune(Date.now(), config.retentionDays)
  } catch (error) {
    log(`pruning failed: ${(error as Error).message}`)
  }
}
prune()
setInterval(prune, 24 * 60 * 60 * 1000).unref()

const port = await createService(config, store, log).listen(config.port)

if (!config.key) log('no USAGE_KEY set: every caller will be answered')
if (!config.adminPassword) log('no ADMIN_PASSWORD set: the dashboard is switched off')
if (config.trustedProxies === 0) {
  log('USAGE_TRUSTED_PROXIES is 0: x-forwarded-for is ignored and senders are told apart by socket')
}

const shutdown = (): void => {
  store.close()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

log(`usage service ${SERVICE_VERSION} listening on ${port}, keeping ${config.retentionDays} days in ${config.database}`)
