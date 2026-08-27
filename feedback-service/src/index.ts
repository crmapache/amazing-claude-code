import { readConfig, readTelegramKeys, SERVICE_VERSION } from './config.js'
import { createService } from './server.js'

/**
 * Starting the service. Everything it does lives in server.ts; this file only decides that it should
 * begin, so that a test can raise one of its own without one starting on import.
 */

const config = readConfig()

const log = (line: string): void => {
  if (config.logLevel === 'silent') return
  // Only ever this shape: what happened, a hint of an address, a size, a time. Never a body - and least
  // of all in an error path, which is exactly where "attach the message for diagnosis" gets written.
  process.stdout.write(`${new Date().toISOString()} ${line}\n`)
}

const port = await createService(config, log).listen(config.port)

if (!readTelegramKeys()) {
  log('no TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID: feedback will be refused rather than forwarded')
}

if (!config.key) log('no FEEDBACK_KEY set: every caller will be answered')

if (config.trustedProxies === 0) {
  // Worth saying out loud rather than leaving to be discovered: behind a proxy this makes the per-address
  // ceiling meaningless, because every request arrives from the proxy's own address.
  log('FEEDBACK_TRUSTED_PROXIES is 0: x-forwarded-for is ignored and senders are told apart by socket')
}

log(`feedback service ${SERVICE_VERSION} listening on ${port}`)
