import { generateKeys } from './push/push.js'

/**
 * A one-off: makes the VAPID pair a deployment needs to send notifications.
 *
 * Run it once per relay and keep the output in that relay's environment. The pair identifies the
 * sender to Apple's and Google's push services and to nobody else - it says nothing about the people
 * using the relay, and it is not what encrypts a notification's text (the IDE does that, with a key
 * this server never sees).
 *
 *   node dist/keys.js
 */

const keys = generateKeys()

process.stdout.write(
  [
    'Add these to the relay\'s environment:',
    '',
    `VAPID_PUBLIC_KEY=${keys.publicKey}`,
    `VAPID_PRIVATE_KEY=${keys.privateKey}`,
    'VAPID_SUBJECT=mailto:you@example.com',
    '',
    'Keep the private one private: with it, somebody else can send notifications that look like yours.',
    '',
  ].join('\n'),
)
