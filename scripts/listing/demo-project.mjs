/**
 * The project the listing's IDE frames are taken in.
 *
 * The panel in those frames plays the harness's showcase (webview/src/harness/scenarios/showcase.ts):
 * one invented project, nimbus-checkout, with Apple Pay being added to its checkout sheet. The IDE around
 * the panel is a real one, so its project tree and its editor have to show that same project - otherwise
 * the panel talks about paymentMethods.ts while the editor shows something else entirely. This writes the
 * project out: the files the conversation reads and edits, in the state the conversation leaves them, on a
 * branch whose work is not committed yet, so the tree marks the edited files the way a real afternoon does.
 *
 *   node scripts/listing/demo-project.mjs [where]      # ~/work/nimbus-checkout by default
 *
 * It lives outside this repository on purpose: Claude Code reads every CLAUDE.md from the working
 * directory up to the root, and a demo conversation run inside this tree would read this project's notes.
 * Running it again wipes the folder and writes it anew.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const ROOT = process.argv[2] ?? join(homedir(), 'work', 'nimbus-checkout')

/** The repository as it stood on main, before the branch. */
const BASE = {
  '.gitignore': ['node_modules', 'dist', '.env', '.env.*', '!.env.example', 'playwright-report', 'test-results', '.idea/', ''].join('\n'),

  'CLAUDE.md': `# nimbus-checkout

The checkout of the Nimbus store: the payment sheet (apps/web), the payments API (apps/api) and the
design tokens they share (packages/tokens).

- Always answer in English.
- Payment methods are entries of one registry (apps/web/src/checkout/paymentMethods.ts) - a new method is
  a new entry, never a branch in the sheet. See docs/adr/0014-payment-registry.md.
- Anything that needs a merchant certificate is done by the API, never in the browser.
- \`pnpm test\` runs the unit tests, \`pnpm e2e\` the Playwright flows against the local stack.
`,

  // The project's own scenarios: they travel with the repository, so the phone and the hub list them.
  '.claude/scenarios/pre-merge-check.json': `{
  "version": 1,
  "id": "pre-merge-check",
  "name": "Pre-merge check",
  "createdAt": 1791300000000,
  "updatedAt": 1791300000000,
  "inputs": [],
  "head": {
    "briefing": "A quick look at the Apple Pay branch before it is merged: what it adds, what a shopper could trip over, and a release note. Nothing but the release note is written; no code is changed.",
    "model": "haiku",
    "effort": "low",
    "permissionMode": "acceptEdits",
    "onQuestion": "head",
    "retries": 1,
    "onGiveUp": "stop"
  },
  "stages": [
    {
      "id": "st-read",
      "title": "Read the branch",
      "repeat": 1,
      "untilDone": false,
      "cards": [
        {
          "id": "c-diff",
          "title": "Collect the diff",
          "prompt": "Read apps/web/src/checkout/paymentMethods.ts, apps/web/src/checkout/applePay.ts and apps/api/src/payments/session.ts in the current repository. Do not edit anything. Reply with three short lines: what each file now does for Apple Pay.",
          "slots": [],
          "dod": "Three lines, one per file named.",
          "after": "",
          "model": "haiku",
          "effort": "",
          "permissionMode": ""
        }
      ]
    },
    {
      "id": "st-review",
      "title": "Review",
      "repeat": 1,
      "untilDone": false,
      "cards": [
        {
          "id": "c-review",
          "title": "Review the Apple Pay entry",
          "prompt": "Review apps/web/src/checkout/applePay.ts and apps/web/src/checkout/paymentMethods.ts for problems a shopper would notice. Do not edit files. Reply with at most three findings, each naming a file and a line, or say there are none.",
          "slots": [],
          "dod": "At most three findings, each with a file and a line - or a plain none.",
          "after": "",
          "model": "haiku",
          "effort": "",
          "permissionMode": ""
        }
      ]
    },
    {
      "id": "st-note",
      "title": "Write it down",
      "repeat": 1,
      "untilDone": false,
      "cards": [
        {
          "id": "c-note",
          "title": "Release note",
          "prompt": "Write a release note for the Apple Pay sheet into docs/release-notes.md in the current repository (create the file if it is missing): two sentences a shopper would understand. Reply with the path you wrote.",
          "slots": [],
          "dod": "docs/release-notes.md is named in the reply.",
          "after": "",
          "model": "haiku",
          "effort": "",
          "permissionMode": ""
        }
      ]
    }
  ]
}\n`,

  '.claude/scenarios/review-and-fix.json': `{
  "version": 1,
  "id": "review-and-fix",
  "name": "Review and fix",
  "createdAt": 1791200000000,
  "updatedAt": 1791200000000,
  "inputs": [
    {
      "id": "i-branch",
      "name": "branch",
      "label": "Branch",
      "placeholder": "feature/apple-pay-sheet",
      "required": true
    }
  ],
  "head": {
    "briefing": "Review the branch and fix what the review finds, round after round, until a review comes back clean or three rounds are spent. Never push, never open a pull request.",
    "model": "sonnet",
    "effort": "medium",
    "permissionMode": "acceptEdits",
    "onQuestion": "head",
    "retries": 2,
    "onGiveUp": "stop"
  },
  "stages": [
    {
      "id": "st-read",
      "title": "Read the branch",
      "repeat": 1,
      "untilDone": false,
      "cards": [
        {
          "id": "c-diff",
          "title": "Collect the diff",
          "prompt": "Read the diff of {{branch}} against main in the current repository and write down what it touches. Do not edit anything. Reply with the list of changed files and one line about each.",
          "slots": [],
          "dod": "Every changed file is listed.",
          "after": "",
          "model": "",
          "effort": "",
          "permissionMode": ""
        }
      ]
    },
    {
      "id": "st-loop",
      "title": "Review, then fix",
      "repeat": 3,
      "untilDone": true,
      "cards": [
        {
          "id": "c-review",
          "title": "Review it",
          "prompt": "Review the changes on {{branch}} and write every finding to [[findings]], one per line with a file and a line. Do not fix anything yourself.",
          "slots": [
            {
              "id": "s-findings",
              "name": "findings",
              "description": "Where to write the findings - a path in the run folder"
            }
          ],
          "dod": "A file of findings exists, and every finding names a file and a line.",
          "after": "",
          "model": "",
          "effort": "",
          "permissionMode": ""
        },
        {
          "id": "c-fix",
          "title": "Fix what it found",
          "prompt": "Fix the findings written in [[findings]]. Leave the ones you disagree with and say why. Run the project's unit tests when you are done and report the result.",
          "slots": [
            {
              "id": "s-findings2",
              "name": "findings",
              "description": "The same file of findings the review wrote"
            }
          ],
          "dod": "Every finding is fixed or answered, and the tests were run.",
          "after": "Another pass only if this one fixed something - a clean review ends the loop.",
          "model": "",
          "effort": "",
          "permissionMode": ""
        }
      ]
    }
  ]
}\n`,

  '.claude/scenarios/night-patrol.json': `{
  "version": 1,
  "id": "night-patrol",
  "name": "Night patrol",
  "createdAt": 1791100000000,
  "updatedAt": 1791100000000,
  "inputs": [
    {
      "id": "i-ticket",
      "name": "ticket",
      "label": "Ticket",
      "placeholder": "NIM-482",
      "required": true
    }
  ],
  "head": {
    "briefing": "Take a bug ticket overnight: reproduce it with a failing test, fix it, and prove the fix. Stop and wait for a person before anything touches the database.",
    "model": "sonnet",
    "effort": "high",
    "permissionMode": "acceptEdits",
    "onQuestion": "stop",
    "retries": 2,
    "onGiveUp": "stop"
  },
  "stages": [
    {
      "id": "st-repro",
      "title": "Reproduce",
      "repeat": 1,
      "untilDone": false,
      "cards": [
        {
          "id": "c-read",
          "title": "Read the ticket",
          "prompt": "Read the ticket {{ticket}} in docs/tickets and restate the bug in two sentences: what the shopper does and what goes wrong.",
          "slots": [],
          "dod": "The bug is restated.",
          "after": "",
          "model": "",
          "effort": "",
          "permissionMode": ""
        },
        {
          "id": "c-test",
          "title": "Write a failing test",
          "prompt": "Write a unit test that fails because of the bug described here: [[bug]]. Do not fix the code. Reply with the test's path and its failure.",
          "slots": [
            {
              "id": "s-bug",
              "name": "bug",
              "description": "The bug as the previous card restated it"
            }
          ],
          "dod": "A test exists and fails for the stated reason.",
          "after": "",
          "model": "",
          "effort": "",
          "permissionMode": ""
        }
      ]
    },
    {
      "id": "st-fix",
      "title": "Fix",
      "repeat": 2,
      "untilDone": true,
      "cards": [
        {
          "id": "c-fix",
          "title": "Fix it",
          "prompt": "Make the failing test pass without weakening it. Reply with what you changed and the test result.",
          "slots": [],
          "dod": "The test passes.",
          "after": "",
          "model": "",
          "effort": "",
          "permissionMode": ""
        }
      ]
    },
    {
      "id": "st-prove",
      "title": "Prove it",
      "repeat": 1,
      "untilDone": false,
      "cards": [
        {
          "id": "c-suite",
          "title": "Run the whole suite",
          "prompt": "Run the project's unit tests and its type check. Do not change code. Reply with both results.",
          "slots": [],
          "dod": "Both results are reported.",
          "after": "",
          "model": "",
          "effort": "",
          "permissionMode": ""
        }
      ]
    }
  ]
}\n`,

  'README.md': `# nimbus-checkout

The checkout of the Nimbus store.

| Package | What it is |
| --- | --- |
| \`apps/web\` | The payment sheet and the order summary |
| \`apps/api\` | Payment sessions, provider adapters, webhooks |
| \`packages/tokens\` | Colours and spacing shared by both |

\`\`\`sh
pnpm install
pnpm dev        # web on :4310, api on :4311
pnpm test
pnpm e2e
\`\`\`
`,

  'package.json': `${JSON.stringify(
    {
      name: 'nimbus-checkout',
      private: true,
      scripts: {
        dev: 'pnpm -r --parallel dev',
        test: 'vitest run',
        e2e: 'playwright test',
        'db:migrate': 'node apps/api/scripts/migrate.mjs',
      },
      devDependencies: {
        '@playwright/test': '^1.48.0',
        '@types/applepayjs': '^14.0.9',
        '@types/node': '^22.9.0',
        '@types/react': '^18.3.12',
        typescript: '^5.6.3',
        vitest: '^2.1.4',
      },
    },
    null,
    2,
  )}\n`,

  // pnpm 11 refuses to finish an install with a build script it was not told about (esbuild, via vitest).
  'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'packages/*'\nallowBuilds:\n  esbuild: false\n",

  'tsconfig.json': `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        jsx: 'react-jsx',
        lib: ['ES2022', 'DOM'],
        types: ['node', 'applepayjs'],
        skipLibCheck: true,
      },
    },
    null,
    2,
  )}\n`,

  'apps/web/package.json': `${JSON.stringify(
    { name: '@nimbus/web', private: true, scripts: { dev: 'vite --port 4310' }, dependencies: { react: '^18.3.1' } },
    null,
    2,
  )}\n`,

  'apps/web/src/checkout/types.ts': `import type { Money } from '../money'

export type PaymentMethodId = 'apple-pay' | 'card' | 'paypal'

export interface CheckoutSession {
  id: string
  merchant: { displayName: string }
  total: Money
  lines: { id: string; title: string; quantity: number; total: Money }[]
}

export interface PaymentMethod {
  id: PaymentMethodId
  label: string
  icon: string
  /** Whether this browser, for this shopper, can pay this way at all. */
  available: () => boolean
  /** Methods that run a sheet of their own (Apple Pay) start it here. */
  session?: (total: Money) => Promise<unknown>
}
`,

  'apps/web/src/checkout/paymentMethods.ts': `import type { PaymentMethod } from './types'

export const METHODS: PaymentMethod[] = [
  { id: 'card', label: 'Card', icon: 'card', available: () => true },
  { id: 'paypal', label: 'PayPal', icon: 'paypal', available: () => true },
]
`,

  'apps/web/src/checkout/useAvailableMethods.ts': `import { useMemo } from 'react'
import { METHODS } from './paymentMethods'

/**
 * The methods this shopper can actually use, in the registry's order. An empty list is a card-only sheet,
 * not an empty one - see PaymentSheet.
 */
export const useAvailableMethods = () =>
  useMemo(() => METHODS.filter((method) => method.available()), [])
`,

  'apps/web/src/checkout/PaymentSheet.tsx': `import { Sheet } from '../components/Sheet'
import { CardForm } from './CardForm'
import { MethodRow } from './MethodRow'
import { OrderSummary } from './summary/OrderSummary'
import type { CheckoutSession } from './types'
import { useAvailableMethods } from './useAvailableMethods'
import { useCheckoutSession } from './useCheckoutSession'

interface Props {
  cartId: string
}

export const PaymentSheet = ({ cartId }: Props) => {
  const session = useCheckoutSession(cartId)

  if (session.status === 'loading') return <Sheet.Skeleton />
  if (session.status === 'failed') return <Sheet.Error retry={session.retry} />

  return <MethodPicker session={session.value} />
}

const MethodPicker = ({ session }: { session: CheckoutSession }) => {
  const methods = useAvailableMethods()

  if (methods.length === 0) return <CardForm session={session} />

  return (
    <Sheet title={session.merchant.displayName}>
      {methods.map((method) => (
        <MethodRow key={method.id} method={method} />
      ))}
      <OrderSummary total={session.total} lines={session.lines} />
    </Sheet>
  )
}
`,

  'apps/web/src/checkout/MethodRow.tsx': `import { Button } from '../components/Button'
import type { PaymentMethod } from './types'

export const MethodRow = ({ method }: { method: PaymentMethod }) => (
  <Button variant="row" icon={method.icon}>
    {method.label}
  </Button>
)
`,

  'apps/web/src/checkout/CardForm.tsx': `import { Sheet } from '../components/Sheet'
import type { CheckoutSession } from './types'

/** The card form on its own: what a sheet shows when nothing else in the registry is available. */
export const CardForm = ({ session }: { session: CheckoutSession }) => (
  <Sheet title={session.merchant.displayName}>
    <form method="post" action="/api/payments/card">
      <input name="number" autoComplete="cc-number" inputMode="numeric" />
      <input name="expiry" autoComplete="cc-exp" />
      <input name="cvc" autoComplete="cc-csc" inputMode="numeric" />
    </form>
  </Sheet>
)
`,

  'apps/web/src/checkout/api.ts': `const API = '/api'

export const startCheckout = async (cartId: string) => {
  const response = await fetch(\`\${API}/payments/session\`, {
    method: 'POST',
    body: JSON.stringify({ cartId }),
  })
  if (!response.ok) throw new Error(\`checkout session: \${response.status}\`)
  return response.json()
}
`,

  'apps/web/src/checkout/useCheckoutSession.ts': `import { useCallback, useEffect, useState } from 'react'
import { startCheckout } from './api'
import type { CheckoutSession } from './types'

type State =
  | { status: 'loading' }
  | { status: 'failed'; retry: () => void }
  | { status: 'ready'; value: CheckoutSession }

export const useCheckoutSession = (cartId: string): State => {
  const [state, setState] = useState<State>({ status: 'loading' })

  const load = useCallback(() => {
    setState({ status: 'loading' })
    startCheckout(cartId)
      .then((value) => setState({ status: 'ready', value }))
      .catch(() => setState({ status: 'failed', retry: load }))
  }, [cartId])

  useEffect(() => load(), [load])

  return state
}
`,

  'apps/web/src/checkout/summary/OrderSummary.tsx': `import type { Money } from '../../money'
import { formatMoney } from '../../money'

interface Line {
  id: string
  title: string
  quantity: number
  total: Money
}

export const OrderSummary = ({ total, lines }: { total: Money; lines: Line[] }) => (
  <dl className="order-summary">
    {lines.map((line) => (
      <div key={line.id} className="order-summary__line">
        <dt>
          {line.quantity} × {line.title}
        </dt>
        <dd>{formatMoney(line.total)}</dd>
      </div>
    ))}
    <div className="order-summary__total">
      <dt>Total</dt>
      <dd>{formatMoney(total)}</dd>
    </div>
  </dl>
)
`,

  'apps/web/src/money.ts': `export interface Money {
  amount: number
  currency: string
  country: string
}

export const formatMoney = ({ amount, currency }: Money) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount / 100)
`,

  'apps/web/src/components/Button.tsx': `import type { ReactNode } from 'react'

interface Props {
  variant?: 'primary' | 'row'
  icon?: string
  children: ReactNode
  onClick?: () => void
}

export const Button = ({ variant = 'primary', icon, children, onClick }: Props) => (
  <button type="button" className={\`button button--\${variant}\`} onClick={onClick}>
    {icon && <span className={\`icon icon--\${icon}\`} aria-hidden />}
    {children}
  </button>
)
`,

  'apps/web/src/components/Sheet.tsx': `import type { ReactNode } from 'react'

export const Sheet = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="sheet" aria-label={title}>
    <header className="sheet__header">{title}</header>
    {children}
  </section>
)

Sheet.Skeleton = () => <section className="sheet sheet--loading" aria-busy />

Sheet.Error = ({ retry }: { retry: () => void }) => (
  <section className="sheet sheet--error">
    <p>The checkout could not be loaded.</p>
    <button onClick={retry}>Try again</button>
  </section>
)
`,

  'apps/api/package.json': `${JSON.stringify(
    { name: '@nimbus/api', private: true, scripts: { dev: 'tsx watch src/server.ts' }, dependencies: { stripe: '^17.3.0' } },
    null,
    2,
  )}\n`,

  'apps/api/src/env.ts': `const required = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(\`\${name} is not set\`)
  return value
}

export const env = {
  get APPLE_MERCHANT_ID() {
    return required('APPLE_MERCHANT_ID')
  },
  get APPLE_MERCHANT_CERT() {
    return required('APPLE_MERCHANT_CERT')
  },
  get APPLE_MERCHANT_KEY() {
    return required('APPLE_MERCHANT_KEY')
  },
  get PUBLIC_HOST() {
    return required('PUBLIC_HOST')
  },
}
`,

  'apps/api/src/payments/types.ts': `export interface Cart {
  id: string
  region: 'us' | 'eu'
  total: { amount: number; currency: string }
}
`,

  'apps/api/src/payments/session.ts': `import { providerFor } from './registry'
import type { Cart } from './types'

export const startSession = async (cart: Cart) => {
  const provider = providerFor(cart)
  return provider.createIntent(cart)
}
`,

  'apps/api/src/payments/registry.ts': `import { adyen } from './providers/adyen'
import { stripe } from './providers/stripe'
import type { Cart } from './types'

const PROVIDERS = { stripe, adyen }

/** EU carts go through Adyen since the 3DS2 migration; everything else stays on Stripe. */
export const providerFor = (cart: Cart) => (cart.region === 'eu' ? PROVIDERS.adyen : PROVIDERS.stripe)
`,

  'apps/api/src/payments/providers/stripe.ts': `import Stripe from 'stripe'
import type { Cart } from '../types'

const client = new Stripe(process.env.STRIPE_SECRET_KEY ?? '')

export const stripe = {
  createIntent: (cart: Cart) =>
    client.paymentIntents.create({
      amount: cart.total.amount,
      currency: cart.total.currency,
      metadata: { cartId: cart.id },
    }),
}
`,

  'apps/api/src/payments/providers/adyen.ts': `import type { Cart } from '../types'

const ADYEN_URL = 'https://checkout-test.adyen.com/v71'

export const adyen = {
  createIntent: async (cart: Cart) => {
    const response = await fetch(\`\${ADYEN_URL}/sessions\`, {
      method: 'POST',
      headers: { 'X-API-Key': process.env.ADYEN_API_KEY ?? '' },
      body: JSON.stringify({
        amount: { value: cart.total.amount, currency: cart.total.currency },
        reference: cart.id,
        merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT,
      }),
    })
    return response.json()
  },
}
`,

  'apps/api/src/payments/webhooks.ts': `import Stripe from 'stripe'
import { refunds } from '../queues'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '')
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ''

const RETRYABLE = new Set(['charge.refunded', 'charge.refund.updated'])

const queueRefund = async (event: Stripe.Event) => {
  // The refund job is idempotent on the event id: a provider that retries does not refund twice.
  await refunds.add(event.id, { type: event.type, object: event.data.object })
  return { received: true, queued: event.id }
}

/**
 * Every provider event comes through here. The signature is checked before the body is read - an event
 * that fails it is dropped as a forgery.
 */
export const handleWebhook = async (body: string, signature: string) => {
  const event = stripe.webhooks.constructEvent(body, signature, SECRET)

  if (RETRYABLE.has(event.type)) return queueRefund(event)

  return { received: true }
}
`,

  'apps/api/src/queues.ts': `const pending = new Map<string, unknown>()

/** A stand-in for the job queue: the real one is Redis-backed, this keeps the contract. */
export const refunds = {
  add: async (id: string, payload: unknown) => {
    if (!pending.has(id)) pending.set(id, payload)
  },
}
`,

  'apps/api/src/http.ts': `import type { Agent } from 'node:https'
import { request } from 'node:https'

/** A JSON POST over a given agent - how a client certificate reaches the other side. */
export const postJson = (url: string, body: unknown, agent: Agent) =>
  new Promise<unknown>((resolve, reject) => {
    const outgoing = request(url, { method: 'POST', agent, headers: { 'content-type': 'application/json' } }, (response) => {
      let text = ''
      response.on('data', (chunk) => (text += chunk))
      response.on('end', () => resolve(JSON.parse(text)))
    })
    outgoing.on('error', reject)
    outgoing.end(JSON.stringify(body))
  })
`,

  'apps/api/migrations/20260801_merchants.sql': `create table merchants (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  region text not null default 'us',
  created_at timestamptz not null default now()
);
`,

  'packages/tokens/colors.ts': `export const colors = {
  ink: '#14161c',
  paper: '#ffffff',
  accent: '#5b6cff',
  success: '#1f9d55',
  danger: '#d64545',
} as const
`,

  'packages/tokens/spacing.ts': `export const space = [0, 4, 8, 12, 16, 24, 32, 48] as const
`,

  'e2e/checkout.spec.ts': `import { expect, test } from '@playwright/test'

test('a card payment goes through', async ({ page }) => {
  await page.goto('/checkout/demo-cart')
  await page.getByRole('button', { name: 'Card' }).click()
  await page.getByLabel('Card number').fill('4242 4242 4242 4242')
  await page.getByRole('button', { name: 'Pay' }).click()
  await expect(page.getByText('Thank you')).toBeVisible()
})
`,

  'docs/payments.md': `# Payments

The sheet asks the registry which methods this shopper can use, and the API turns the chosen one into a
provider session. Webhooks from the providers settle the order.
`,

  'docs/adr/0014-payment-registry.md': `# ADR 0014: one registry for every payment method

**Status:** accepted

Every payment method is an entry in \`METHODS\`: an id, a label, an icon and an \`available()\` check. The
sheet renders whatever the registry says is available, and never branches on a method by name.

Consequence: a method that only some browsers support (Apple Pay, Google Pay) hides itself through its
own \`available()\`, and an empty registry falls back to the card form.
`,
}

/** The branch's work, written but not committed: what the conversation in the frames has just done. */
const BRANCH = {
  'apps/web/src/checkout/paymentMethods.ts': `import { canUseApplePay, createApplePaySession } from './applePay'
import type { PaymentMethod } from './types'

export const METHODS: PaymentMethod[] = [
  {
    id: 'apple-pay',
    label: 'Apple Pay',
    icon: 'apple',
    available: () => canUseApplePay(),
    session: createApplePaySession,
  },
  { id: 'card', label: 'Card', icon: 'card', available: () => true },
  { id: 'paypal', label: 'PayPal', icon: 'paypal', available: () => true },
]
`,

  'apps/web/src/checkout/applePay.ts': `import type { Money } from '../money'
import { formatMoney } from '../money'
import { requestMerchantSession } from './api'

const SUPPORTED_VERSION = 14

export const canUseApplePay = (): boolean => {
  const ApplePay = typeof window === 'undefined' ? undefined : window.ApplePaySession
  return Boolean(ApplePay?.supportsVersion(SUPPORTED_VERSION) && ApplePay.canMakePayments())
}

export const createApplePaySession = async (total: Money) => {
  const session = new ApplePaySession(SUPPORTED_VERSION, {
    countryCode: total.country,
    currencyCode: total.currency,
    merchantCapabilities: ['supports3DS'],
    supportedNetworks: ['visa', 'masterCard', 'amex'],
    total: { label: 'Nimbus', amount: formatMoney(total) },
  })

  session.onvalidatemerchant = async (event) => {
    const merchant = await requestMerchantSession(event.validationURL)
    session.completeMerchantValidation(merchant)
  }

  return session
}
`,

  'apps/web/src/checkout/api.ts': `const API = '/api'

export const startCheckout = async (cartId: string) => {
  const response = await fetch(\`\${API}/payments/session\`, {
    method: 'POST',
    body: JSON.stringify({ cartId }),
  })
  if (!response.ok) throw new Error(\`checkout session: \${response.status}\`)
  return response.json()
}

/** The merchant validation is signed by the API: the certificate never reaches the browser. */
export const requestMerchantSession = async (validationURL: string) => {
  const response = await fetch(\`\${API}/payments/apple-pay/merchant-session\`, {
    method: 'POST',
    body: JSON.stringify({ validationURL }),
  })
  if (!response.ok) throw new Error(\`merchant session: \${response.status}\`)
  return response.json()
}
`,

  'apps/web/src/global.d.ts': `/** Safari puts the class on window; everywhere else it is missing, which is the whole point of the check. */
interface Window {
  ApplePaySession?: typeof ApplePaySession
}
`,

  'apps/api/src/payments/session.ts': `import { env } from '../env'
import { postJson } from '../http'
import { appleMerchantAgent, assertAppleDomain } from './applePay'
import { providerFor } from './registry'
import type { Cart } from './types'

export const startSession = async (cart: Cart) => {
  const provider = providerFor(cart)
  return provider.createIntent(cart)
}

export const signMerchantSession = async (validationUrl: string) => {
  assertAppleDomain(validationUrl)

  return postJson(
    validationUrl,
    {
      merchantIdentifier: env.APPLE_MERCHANT_ID,
      displayName: 'Nimbus',
      initiative: 'web',
      initiativeContext: env.PUBLIC_HOST,
    },
    appleMerchantAgent,
  )
}
`,

  'apps/api/src/payments/applePay.ts': `import { Agent } from 'node:https'
import { env } from '../env'

/** Apple's validation endpoints all live under this domain; anything else is refused before a request. */
const APPLE_DOMAIN = /^https:\\/\\/apple-pay-gateway(-[a-z]+)?\\.apple\\.com\\//

export const assertAppleDomain = (url: string) => {
  if (!APPLE_DOMAIN.test(url)) throw new Error(\`not an Apple Pay validation URL: \${url}\`)
}

export const appleMerchantAgent = new Agent({
  cert: env.APPLE_MERCHANT_CERT,
  key: env.APPLE_MERCHANT_KEY,
})
`,

  'apps/api/migrations/20260827_apple_pay_flag.sql': `alter table merchants
  add column apple_pay_enabled boolean not null default false;

create index merchants_apple_pay_idx
  on merchants (apple_pay_enabled)
  where apple_pay_enabled;
`,

  'e2e/apple-pay.spec.ts': `import { expect, test } from '@playwright/test'

test.describe('Apple Pay', () => {
  test('a browser without the API sees the card form, as before', async ({ page }) => {
    await page.goto('/checkout/demo-cart')
    await expect(page.getByRole('button', { name: 'Apple Pay' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Card' })).toBeVisible()
  })

  test('Safari shows Apple Pay first', async ({ page }) => {
    await page.addInitScript(() => {
      Object.assign(window, { ApplePaySession: { supportsVersion: () => true, canMakePayments: () => true } })
    })
    await page.goto('/checkout/demo-cart')
    await expect(page.getByRole('button').first()).toHaveText('Apple Pay')
  })
})
`,
}

/**
 * The project's own .idea: a module over the whole folder, git as its VCS, and the id that names its
 * workspace file in the sandbox's config (see SANDBOX below).
 */
const PROJECT_ID = '3NimbusCheckoutListingShots'

const IDEA = {
  '.idea/modules.xml': `<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="ProjectModuleManager">
    <modules>
      <module fileurl="file://$PROJECT_DIR$/.idea/nimbus-checkout.iml" filepath="$PROJECT_DIR$/.idea/nimbus-checkout.iml" />
    </modules>
  </component>
</project>
`,
  '.idea/nimbus-checkout.iml': `<?xml version="1.0" encoding="UTF-8"?>
<module type="WEB_MODULE" version="4">
  <component name="NewModuleRootManager">
    <content url="file://$MODULE_DIR$">
      <excludeFolder url="file://$MODULE_DIR$/node_modules" />
      <excludeFolder url="file://$MODULE_DIR$/apps/web/node_modules" />
      <excludeFolder url="file://$MODULE_DIR$/apps/api/node_modules" />
    </content>
    <orderEntry type="inheritedJdk" />
    <orderEntry type="sourceFolder" forTests="false" />
  </component>
</module>
`,
  '.idea/vcs.xml': `<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="VcsDirectoryMappings">
    <mapping directory="$PROJECT_DIR$" vcs="Git" />
  </component>
</project>
`,
  '.idea/workspace.xml': `<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="ProjectId" id="${PROJECT_ID}" />
  <component name="ProjectViewState">
    <option name="hideEmptyMiddlePackages" value="true" />
    <option name="showExcludedFiles" value="false" />
    <option name="showLibraryContents" value="true" />
  </component>
</project>
`,
}

/**
 * The sandbox's side of the layout: which files are open, which folders of the tree are unfolded, and
 * how wide the tree and the panel stand. The IDE keeps this per project in its own config, under the
 * project's id, and reads it on opening - so the frames start from the same window every time instead of
 * from whatever the last run left. The sandbox must be closed while this is written: it saves its own
 * copy on the way out.
 */
const SANDBOX = new URL('../../.intellijPlatform/sandbox/amazing-claude-code/', import.meta.url).pathname

const OPEN_FILES = ['apps/web/src/checkout/applePay.ts', 'apps/api/src/payments/session.ts', 'apps/web/src/checkout/paymentMethods.ts']

const EXPANDED = ['', 'apps', 'apps/web', 'apps/web/src', 'apps/web/src/checkout']

const workspaceLayout = () => {
  const tabs = OPEN_FILES.map(
    (path, index) => `      <file${index === OPEN_FILES.length - 1 ? ' current-in-tab="true"' : ''}>
        <entry file="file://$PROJECT_DIR$/${path}">
          <provider editor-type-id="text-editor" selected="true">
            <state relative-caret-position="0">
              <caret line="0" column="0" selection-start-line="0" selection-start-column="0" selection-end-line="0" selection-end-column="0" />
            </state>
          </provider>
        </entry>
      </file>`,
  ).join('\n')

  const dirItem = (path) =>
    `<item name="dir{file://${ROOT}${path ? `/${path}` : ''}}" type="462c0819:PsiDirectoryNode" />`
  const expand = EXPANDED.map((_, depth) => {
    const items = EXPANDED.slice(0, depth + 1).map(dirItem).join('\n                ')
    return `            <path>
                <item name="nimbus-checkout" type="b2602c69:ProjectViewProjectNode" />
                ${items}
            </path>`
  }).join('\n')

  return `<project version="4">
  <component name="FileEditorManager">
    <leaf SIDE_TABS_SIZE_LIMIT_KEY="-1">
${tabs}
    </leaf>
  </component>
  <component name="ProjectView">
    <navigator currentView="ProjectPane" proportions="" version="1" />
    <panes>
      <pane id="ProjectPane">
        <subPane>
          <expand>
${expand}
          </expand>
          <select />
        </subPane>
      </pane>
    </panes>
  </component>
  <component name="ToolWindowManager">
    <layoutV2>
      <window_info active="true" content_ui="combo" id="Project" order="0" visible="true" weight="0.19" />
      <window_info id="Commit" order="1" weight="0.25" />
      <window_info id="Structure" order="2" side_tool="true" weight="0.25" />
      <window_info id="Bookmarks" order="3" side_tool="true" weight="0.25" />
      <window_info anchor="bottom" id="Version Control" order="0" />
      <window_info anchor="bottom" id="Problems" order="1" />
      <window_info anchor="bottom" id="Problems View" order="2" />
      <window_info anchor="bottom" id="Terminal" order="3" />
      <window_info anchor="bottom" id="Services" order="4" />
      <window_info anchor="right" content_ui="combo" id="Notifications" order="0" weight="0.25" />
      <window_info anchor="right" id="AIAssistant" order="1" weight="0.25" />
      <window_info anchor="right" id="Database" order="2" weight="0.25" />
      <window_info anchor="right" id="AmazingClaudeCode" order="6" visible="true" weight="0.44" />
      <unified_weights left="0.19" right="0.44" />
    </layoutV2>
    <recentWindows>
      <value>AmazingClaudeCode</value>
      <value>Project</value>
    </recentWindows>
  </component>
</project>
`
}

/**
 * Every sandbox IDE version gets the layout and trusts the folder, so no "Trust this project?" dialog
 * stands in the first frame. What changes the sandbox as a whole - its recent projects, the editor's tab
 * limit, a silenced balloon - is sandbox-stage.mjs's, which also puts it back.
 */
const prepareSandbox = () => {
  if (!existsSync(SANDBOX)) return
  const parent = dirname(ROOT)

  for (const version of readdirSync(SANDBOX)) {
    const config = join(SANDBOX, version, 'config')
    if (!existsSync(config)) continue

    mkdirSync(join(config, 'workspace'), { recursive: true })
    writeFileSync(join(config, 'workspace', `${PROJECT_ID}.xml`), workspaceLayout())

    const trusted = join(config, 'options', 'trusted-paths.xml')
    if (!existsSync(trusted)) continue
    const xml = readFileSync(trusted, 'utf8')
    const entry = `<option value="${parent}" />`
    if (xml.includes(entry)) continue
    writeFileSync(
      trusted,
      xml.replace(/(<option name="TRUSTED_PATHS">\s*<list>)/, `$1\n        ${entry}`),
    )
  }
}

const write = (files) => {
  for (const [path, content] of Object.entries(files)) {
    const target = join(ROOT, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
}

/** A made-up author, so the editor's inlay hints and the history name somebody from the story rather than whoever ran this. */
const git = (...args) =>
  execFileSync('git', ['-c', 'user.name=Alex Kim', '-c', 'user.email=alex@nimbus.example', '-c', 'commit.gpgsign=false', ...args], {
    cwd: ROOT,
    stdio: 'pipe',
  })

rmSync(ROOT, { recursive: true, force: true })
mkdirSync(ROOT, { recursive: true })

write(BASE)
// Installed for real: without node_modules every import in the editor is underlined in red, and the
// IDE asks to install them in a balloon over the panel.
execFileSync('pnpm', ['install', '--silent'], { cwd: ROOT, stdio: 'inherit' })
git('init', '-q', '-b', 'main')
git('add', '-A')
git('commit', '-q', '-m', 'Checkout sheet on the payment-method registry')

git('checkout', '-q', '-b', 'feature/apple-pay-sheet')
write(BRANCH)
// New files are added, not left untracked: the tree then shows them as new work (green) rather than as
// stray files (red), which is what an agent's fresh files look like once the IDE has picked them up.
git('add', '-N', '.')

write(IDEA)
prepareSandbox()

console.log(`nimbus-checkout written to ${ROOT} on feature/apple-pay-sheet`)
