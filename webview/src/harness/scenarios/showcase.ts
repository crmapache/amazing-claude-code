import { agent, bash, checkpoint, inHours, scenario, shell, subagentText, textReply, think, toolResult, toolUse, turnResult, user, wait, SESSION } from '../events'
import type { Scenario, ScenarioStep } from '../types'
import { statisticsFigures } from './statistics'

/**
 * The scenarios the marketplace screenshots are taken from.
 *
 * They differ from the rest in one thing only: every one of them is a single checkpoint that leaves the
 * panel in a finished, photogenic state - a frame rather than a story. The harness's shot mode (see
 * harness.tsx, `?shot=<id>`) plays exactly one of them, hides its own furniture and hands the whole
 * window to the panel.
 *
 * One invented project runs through all of them - nimbus-checkout, a payment sheet on a branch with a
 * pull request behind it - so the frames read as one working day rather than as a dozen unrelated demos.
 */

const ROOT = '/Users/dev/work/nimbus-checkout'

/** The project's files, for the "@" hint in the input field. */
const FILES = [
  'package.json',
  'README.md',
  'apps/web/src/checkout/PaymentSheet.tsx',
  'apps/web/src/checkout/paymentMethods.ts',
  'apps/web/src/checkout/applePay.ts',
  'apps/web/src/checkout/useCheckoutSession.ts',
  'apps/web/src/checkout/summary/OrderSummary.tsx',
  'apps/web/src/components/Button.tsx',
  'apps/web/src/components/Sheet.tsx',
  'apps/api/src/payments/session.ts',
  'apps/api/src/payments/webhooks.ts',
  'apps/api/src/payments/providers/stripe.ts',
  'apps/api/src/payments/providers/adyen.ts',
  'packages/tokens/colors.ts',
  'packages/tokens/spacing.ts',
  'e2e/checkout.spec.ts',
  'e2e/apple-pay.spec.ts',
  'docs/payments.md',
  'docs/adr/0014-payment-registry.md',
]

const COMMANDS = [
  'clear',
  'compact',
  'context',
  'cost',
  'effort',
  'fork',
  'login',
  'logout',
  'model',
  'resume',
  'usage',
  'design-review',
  'e2e-flow',
  'migrate-provider',
  'release-notes',
  'security-review',
]

const COMMAND_HINTS: Record<string, { description: string; argumentHint: string }> = {
  clear: { description: 'Start this conversation over', argumentHint: '' },
  compact: { description: 'Fold the conversation up and carry on with a summary', argumentHint: '' },
  context: { description: 'How much of the context window is taken', argumentHint: '' },
  cost: { description: 'What this conversation has cost so far', argumentHint: '' },
  effort: { description: 'How hard the model thinks before answering', argumentHint: '[low|medium|high]' },
  fork: { description: 'Branch the conversation off into a new tab', argumentHint: '' },
  model: { description: 'Which model answers in this tab', argumentHint: '[model]' },
  resume: { description: 'Open one of this project’s past conversations', argumentHint: '' },
  usage: { description: 'Subscription windows and their reset times', argumentHint: '' },
  'design-review': { description: 'Check a screen against the design tokens', argumentHint: '[component]' },
  'e2e-flow': { description: 'Write a Playwright flow for a checkout path', argumentHint: '[path]' },
  'migrate-provider': { description: 'Move a payment provider onto the registry', argumentHint: '[provider]' },
  'release-notes': { description: 'Draft the notes for the next release', argumentHint: '[since-tag]' },
  'security-review': { description: 'Review the branch for security holes', argumentHint: '' },
}

/**
 * The tab strip: a conversation, a fork of it, and a second thread beside them.
 *
 * Three and no more, on purpose. A fourth wraps the strip onto a second row at the width these frames
 * are taken at, and a picture of the listing has no business spending two rows on tabs.
 */
const SESSIONS: ScenarioStep = shell({
  type: 'sessions',
  sessions: [
    {
      id: SESSION,
      title: 'Apple Pay in the checkout sheet',
      titleSource: 'llm',
      kind: 'main',
      groupId: 'g-checkout',
      depth: 0,
      status: 'running',
      awaitsYou: false,
    },
    {
      id: 's-fork-validation',
      title: 'Merchant validation endpoint',
      titleSource: 'llm',
      kind: 'branch',
      parentId: SESSION,
      groupId: 'g-checkout',
      depth: 1,
      status: 'idle',
      awaitsYou: true,
      quote: 'the merchant session has to be signed on the server',
    },
    {
      id: 's-webhooks',
      title: 'Refund webhooks retry storm',
      titleSource: 'llm',
      kind: 'main',
      groupId: 'g-webhooks',
      depth: 0,
      status: 'idle',
      awaitsYou: false,
    },
  ],
})

/** Signed in, the project open, a branch with a pull request, and a subscription half spent. */
export const showcaseBootstrap: ScenarioStep[] = [
  shell({ type: 'auth', installed: true, loggedIn: true, email: 'dev@nimbus.dev', plan: 'Max' }),
  shell({
    type: 'init',
    projectName: 'nimbus-checkout',
    workingDirectory: ROOT,
    gitBranch: 'feature/apple-pay-sheet',
    pluginVersion: '0.8.3',
    preferences: { model: 'opus', effort: 'high', mode: 'acceptEdits' },
  }),
  shell({
    type: 'project',
    gitBranch: 'feature/apple-pay-sheet',
    pullRequest: '482',
    pullRequestUrl: 'https://github.com/nimbus/checkout/pull/482',
  }),
  shell({
    type: 'models',
    models: [
      { value: 'default', label: 'Default (recommended)', description: 'Use the model this session starts with.', resolved: 'claude-sonnet-5' },
      { value: 'opus', label: 'Opus', description: 'Opus 5 · Best for everyday, complex tasks', resolved: 'claude-opus-5' },
      { value: 'opus[1m]', label: 'Opus (1M context)', description: 'Opus 5 with 1M context · For long sessions with large codebases', resolved: 'claude-opus-5[1m]' },
      { value: 'sonnet', label: 'Sonnet', description: 'Sonnet 5 · Efficient for routine tasks', resolved: 'claude-sonnet-5' },
      { value: 'haiku', label: 'Haiku', description: 'Haiku 4.5 · Fastest for quick answers', resolved: 'claude-haiku-4-5' },
    ],
  }),
  shell({ type: 'modeAvailability', bypassPermissions: true }),
  shell({
    type: 'usage',
    session: { percent: 38, resets: inHours(2 + 11 / 60) },
    week: { percent: 57, resets: inHours(3 * 24 + 6) },
    todayTokens: '312.8M',
    contextWindow: 200_000,
  }),
  shell({ type: 'context', sessionId: SESSION, used: 96_400, max: 200_000 }),
  shell({ type: 'files', files: FILES }),
  shell({ type: 'commands', commands: COMMANDS }),
  shell({ type: 'commandHints', hints: COMMAND_HINTS }),
  SESSIONS,
]

/**
 * The exchange that stands above every frame.
 *
 * A panel photographed with two lines in it looks like a panel nobody works in, and the feed is where
 * this plugin lives - so each frame opens on a conversation already under way, and whatever the frame is
 * about arrives underneath.
 */
const PRELUDE: ScenarioStep[] = [
  user('Before we touch anything: if the registry ends up empty, does the sheet still fall back to the card form?'),
  toolUse('Read', { file_path: `${ROOT}/apps/web/src/checkout/PaymentSheet.tsx` }, 'pre-read'),
  toolResult(
    'pre-read',
    [
      ' 41\t  const methods = useAvailableMethods()',
      ' 42\t',
      ' 43\t  if (methods.length === 0) return <CardForm session={session} />',
      ' 44\t',
      ' 45\t  return (',
      ' 46\t    <Sheet title={session.merchant.displayName}>',
      ' 47\t      {methods.map((method) => (',
      ' 48\t        <MethodRow key={method.id} method={method} />',
      ' 49\t      ))}',
      ' 50\t    </Sheet>',
      ' 51\t  )',
    ].join('\n'),
  ),
  toolUse('Grep', { pattern: 'useAvailableMethods', path: 'apps/web/src', output_mode: 'content' }, 'pre-grep'),
  toolResult(
    'pre-grep',
    [
      'apps/web/src/checkout/useAvailableMethods.ts:8:export const useAvailableMethods = () =>',
      'apps/web/src/checkout/useAvailableMethods.ts:9:  METHODS.filter((method) => method.available())',
      'apps/web/src/checkout/PaymentSheet.tsx:41:  const methods = useAvailableMethods()',
    ].join('\n'),
  ),
  ...textReply(
    'Yes - `PaymentSheet.tsx:43` returns the card form outright when nothing in the registry says it is available, so an empty registry is a card-only sheet rather than an empty one. Worth knowing before we add a method that hides itself on most browsers.',
  ),
  turnResult(11_600),
]

/** The work every frame of the main thread stands on: the question, the plan behind it, the task list. */
const TASK_LIST = [
  { content: 'Read the payment-method registry and the sheet', status: 'completed' },
  { content: 'Add the Apple Pay method to the registry', status: 'completed' },
  { content: 'Sign the merchant session on the API side', status: 'completed' },
  { content: 'Keep the card form for browsers without the API', status: 'in_progress' },
  { content: 'Cover the new path with an e2e test', status: 'pending' },
]

const OPENING = 'Add Apple Pay to the checkout sheet. Reuse the payment-method registry rather than a branch of its own, and keep the card form for browsers without the API.'

/** The tool calls the main thread is built from - one group in the feed. */
const WORK: ScenarioStep[] = [
  toolUse('Read', { file_path: `${ROOT}/apps/web/src/checkout/paymentMethods.ts` }, 'w-read-1'),
  toolResult(
    'w-read-1',
    [
      "  1\timport type { PaymentMethod } from './types'",
      '  2\t',
      '  3\texport const METHODS: PaymentMethod[] = [',
      "  4\t  { id: 'card', label: 'Card', icon: 'card', available: () => true },",
      "  5\t  { id: 'paypal', label: 'PayPal', icon: 'paypal', available: () => true },",
      '  6\t]',
    ].join('\n'),
  ),
  toolUse('Grep', { pattern: 'METHODS\\.', path: 'apps/web/src', output_mode: 'files_with_matches' }, 'w-grep'),
  toolResult(
    'w-grep',
    [
      'apps/web/src/checkout/PaymentSheet.tsx',
      'apps/web/src/checkout/useCheckoutSession.ts',
      'apps/web/src/checkout/summary/OrderSummary.tsx',
      'e2e/checkout.spec.ts',
    ].join('\n'),
  ),
  toolUse(
    'Edit',
    {
      file_path: `${ROOT}/apps/web/src/checkout/paymentMethods.ts`,
      old_string:
        "export const METHODS: PaymentMethod[] = [\n  { id: 'card', label: 'Card', icon: 'card', available: () => true },\n  { id: 'paypal', label: 'PayPal', icon: 'paypal', available: () => true },\n]",
      new_string:
        "export const METHODS: PaymentMethod[] = [\n  {\n    id: 'apple-pay',\n    label: 'Apple Pay',\n    icon: 'apple',\n    available: () => canUseApplePay(),\n    session: createApplePaySession,\n  },\n  { id: 'card', label: 'Card', icon: 'card', available: () => true },\n  { id: 'paypal', label: 'PayPal', icon: 'paypal', available: () => true },\n]",
    },
    'w-edit-1',
  ),
  toolResult('w-edit-1', 'The file has been updated.'),
  toolUse(
    'Write',
    {
      file_path: `${ROOT}/apps/web/src/checkout/applePay.ts`,
      content: [
        "import { requestMerchantSession } from './api'",
        '',
        'const SUPPORTED_VERSION = 14',
        '',
        'export const canUseApplePay = (): boolean =>',
        "  typeof window !== 'undefined' &&",
        '  Boolean(window.ApplePaySession?.supportsVersion(SUPPORTED_VERSION)) &&',
        '  window.ApplePaySession.canMakePayments()',
        '',
        'export const createApplePaySession = async (total: Money) => {',
        '  const session = new window.ApplePaySession(SUPPORTED_VERSION, {',
        '    countryCode: total.country,',
        '    currencyCode: total.currency,',
        "    merchantCapabilities: ['supports3DS'],",
        "    supportedNetworks: ['visa', 'masterCard', 'amex'],",
        "    total: { label: 'Nimbus', amount: format(total) },",
        '  })',
        '',
        '  session.onvalidatemerchant = async (event) => {',
        '    const merchant = await requestMerchantSession(event.validationURL)',
        '    session.completeMerchantValidation(merchant)',
        '  }',
        '',
        '  return session',
        '}',
      ].join('\n'),
    },
    'w-write',
  ),
  toolResult('w-write', `File created successfully at: ${ROOT}/apps/web/src/checkout/applePay.ts`),
  toolUse(
    'Edit',
    {
      file_path: `${ROOT}/apps/api/src/payments/session.ts`,
      old_string:
        'export const startSession = async (cart: Cart) => {\n  const provider = providerFor(cart)\n  return provider.createIntent(cart)\n}',
      new_string:
        'export const startSession = async (cart: Cart) => {\n  const provider = providerFor(cart)\n  return provider.createIntent(cart)\n}\n\nexport const signMerchantSession = async (validationUrl: string) => {\n  assertAppleDomain(validationUrl)\n\n  const response = await fetch(validationUrl, {\n    method: "POST",\n    agent: appleMerchantAgent,\n    body: JSON.stringify({\n      merchantIdentifier: env.APPLE_MERCHANT_ID,\n      displayName: "Nimbus",\n      initiative: "web",\n      initiativeContext: env.PUBLIC_HOST,\n    }),\n  })\n\n  return response.json()\n}',
    },
    'w-edit-2',
  ),
  toolResult('w-edit-2', 'The file has been updated.'),
]


/**
 * The whole of a working turn - the backdrop for the frames whose subject is a screen over the feed
 * (remote access, MCP, plugins, sounds, history): behind a half-transparent screen an empty panel reads
 * as a panel with nothing in it.
 */
const CONVERSATION: ScenarioStep[] = [
  ...PRELUDE,
  user(OPENING),
  ...WORK,
  ...textReply(
    'Apple Pay goes through the registry now, ahead of the card and behind a check of its own. The card form is untouched: a browser without `ApplePaySession` never sees the new entry.',
  ),
  turnResult(74_000),
]

export const scenariosShowcase: Scenario[] = [
  /* 1. The panel at work: the task list, a group of calls, a live answer being typed. */
  scenario('shot-turn', 'Shot: a turn in progress', 'showcase', [
    checkpoint('A turn in progress', [
      ...showcaseBootstrap,
      ...PRELUDE,
      user(OPENING),
      think(
        'The registry already decides which methods a sheet shows, so Apple Pay belongs in it rather than beside it. What cannot live in the browser is the merchant validation - that needs the certificate, so the API has to sign the session.',
      ),
      toolUse('TodoWrite', { todos: TASK_LIST }, 'w-todo'),
      toolResult('w-todo', 'Todos have been modified successfully.'),
      ...WORK,
      toolUse('Bash', { command: 'pnpm vitest run apps/web/src/checkout', description: 'Run the checkout unit tests' }, 'w-tests'),
      shell({ type: 'status', sessionId: SESSION, state: 'running' }),
    ]),
  ]),

  /* 2. The same work, finished: a diff to unfold, a test run, an answer with code in it. */
  scenario('shot-diff', 'Shot: the diff of an edit', 'showcase', [
    checkpoint('The finished turn', [
      ...showcaseBootstrap,
      ...PRELUDE,
      user(OPENING),
      ...WORK.slice(0, 4),
      // Text between the calls closes one group and opens the next: the edit and its diff end up at the
      // foot of the feed, which is where a frame can show them whole.
      ...textReply(
        'The registry is the only place that decides what a sheet offers, so the entry goes in there - ahead of the card, and hidden behind a check of its own.',
      ),
      ...WORK.slice(4),
      toolUse('Bash', { command: 'pnpm vitest run apps/web/src/checkout', description: 'Run the checkout unit tests' }, 'w-tests'),
      toolResult(
        'w-tests',
        [
          ' RUN  v3.2.4 /Users/dev/work/nimbus-checkout',
          '',
          ' ✓ apps/web/src/checkout/paymentMethods.test.ts (7 tests) 41ms',
          ' ✓ apps/web/src/checkout/applePay.test.ts (5 tests) 63ms',
          ' ✓ apps/web/src/checkout/PaymentSheet.test.tsx (11 tests) 388ms',
          '',
          ' Test Files  3 passed (3)',
          '      Tests  23 passed (23)',
          '   Duration  1.42s',
        ].join('\n'),
      ),
      ...textReply(
        'Three files and 23 tests green. The card form is untouched: a browser without `ApplePaySession` never sees the new entry, so the sheet looks to it exactly as it did yesterday.',
      ),
      turnResult(74_000),
    ]),
  ]),

  /* 3. A plan waiting for a person: the two buttons are the whole point of the frame. */
  scenario('shot-plan', 'Shot: a plan awaiting approval', 'showcase', [
    checkpoint('The plan card', [
      ...showcaseBootstrap,
      ...PRELUDE,
      user('Plan how we move the refund flow off the Stripe SDK and onto our own provider registry. Do not touch anything yet.'),
      think('Two call sites read the SDK directly, and the webhook handler trusts its signature check. The order matters here: the registry has to exist before either of them moves.'),
      toolUse(
        'ExitPlanMode',
        {
          plan: [
            '## Moving refunds onto the provider registry',
            '',
            'Adyen goes live in three weeks, and `refunds.ts` still talks to the Stripe SDK by name.',
            '',
            '### The steps',
            '',
            '1. **Give the registry a refund port** - `providers/types.ts` grows `refund(intentId, amount)`; Stripe implements it with the call that is already there.',
            '2. **Move the two call sites** - `refunds.ts:41` and `admin/orders.ts:118` ask the registry for a provider instead of importing the SDK.',
            '3. **Verify the webhook signature per provider** - today `webhooks.ts` checks a Stripe signature for every event, including the ones Adyen will send.',
            '4. **Keep the old path alive behind a flag** for one release, so a refund that fails in production can be compared against the previous behaviour.',
            '',
            '### What I would not do',
            '',
            '- Change the database schema. `provider_ref` is already a free-form string.',
            '',
            '### After the change',
            '',
            'Run `pnpm test apps/api/src/payments` plus the refund e2e flow against the Stripe test account.',
          ].join('\n'),
        },
        'p-plan',
      ),
    ]),
  ]),

  /* 4. A permission request - the one moment the turn stands still and waits for a human. */
  scenario('shot-permission', 'Shot: a permission request', 'showcase', [
    checkpoint('The permission card', [
      ...showcaseBootstrap,
      ...PRELUDE,
      user('The staging database is missing the apple_pay_enabled column - add the migration and run it against staging.'),
      toolUse(
        'Write',
        {
          file_path: `${ROOT}/apps/api/migrations/20260827_apple_pay_flag.sql`,
          content:
            'alter table merchants\n  add column apple_pay_enabled boolean not null default false;\n\ncreate index merchants_apple_pay_idx\n  on merchants (apple_pay_enabled)\n  where apple_pay_enabled;',
        },
        'perm-write',
      ),
      toolResult('perm-write', `File created successfully at: ${ROOT}/apps/api/migrations/20260827_apple_pay_flag.sql`),
      toolUse('Bash', { command: 'pnpm db:migrate --env staging', description: 'Apply the new migration to staging' }, 'perm-bash'),
      wait(200),
      shell({
        type: 'permission',
        id: 'perm-card',
        sessionId: SESSION,
        toolName: 'Bash',
        target: 'wants to run a command',
        command: 'pnpm db:migrate --env staging',
        mode: 'acceptEdits',
        reason:
          'The command writes to a database outside the project directory. "Accept edits" covers files in the working tree only, so a migration against staging is asked about every time.',
      }),
    ]),
  ]),

  /* 5. A question with options - answered by mouse or by the number keys. */
  scenario('shot-question', 'Shot: a question with options', 'showcase', [
    checkpoint('The question card', [
      ...showcaseBootstrap,
      ...PRELUDE,
      user('Before you write the merchant validation - ask me anything you are unsure about.'),
      toolUse(
        'AskUserQuestion',
        {
          questions: [
            {
              question: 'Where should the merchant session be signed?',
              header: 'Signing',
              multiSelect: false,
              options: [
                {
                  label: 'On our API',
                  description: 'apps/api holds the certificate already; the browser only forwards the validation URL.',
                },
                {
                  label: 'On the edge worker',
                  description: 'Lower latency for EU shoppers, but the certificate would have to be copied into the worker secrets.',
                },
                {
                  label: 'Through the payment provider',
                  description: 'Stripe can sign it for us. One dependency more, one certificate less to rotate.',
                },
              ],
            },
            {
              question: 'What should browsers without Apple Pay see?',
              header: 'Fallback',
              multiSelect: false,
              options: [
                { label: 'The card form, as today', description: 'The new entry never renders. Nothing changes for Firefox and Android.' },
                { label: 'A disabled Apple Pay row', description: 'Visible but greyed out, with a hint about Safari.' },
              ],
            },
          ],
        },
        'q-ask',
      ),
    ]),
  ]),

  /* 6. Several agents at once: three of them working, one stopped on a permission of its own. */
  scenario('shot-subagents', 'Shot: subagents in parallel', 'showcase', [
    checkpoint('Four agents at work', [
      ...showcaseBootstrap,
      ...PRELUDE,
      user('/security-review'),
      toolUse('Skill', { skill: 'security-review', args: 'branch' }, 'sa-skill'),
      toolResult('sa-skill', 'Launching skill: security-review'),
      agent({
        type: 'system',
        subtype: 'task_started',
        task_id: 'sa-a',
        tool_use_id: 'sa-in-a',
        subagent_type: 'general-purpose',
        description: 'Merchant validation and certificate handling',
        task_type: 'local_agent',
      }),
      agent({
        type: 'system',
        subtype: 'task_started',
        task_id: 'sa-b',
        tool_use_id: 'sa-in-b',
        subagent_type: 'general-purpose',
        description: 'Webhook signature verification',
        task_type: 'local_agent',
      }),
      agent({
        type: 'system',
        subtype: 'task_started',
        task_id: 'sa-c',
        tool_use_id: 'sa-in-c',
        subagent_type: 'general-purpose',
        description: 'Secrets and environment variables in the diff',
        task_type: 'local_agent',
      }),
      agent({
        type: 'system',
        subtype: 'task_started',
        task_id: 'sa-d',
        tool_use_id: 'sa-in-d',
        subagent_type: 'general-purpose',
        description: 'Client-side input handling in the sheet',
        task_type: 'local_agent',
      }),
      ...textReply('Four reviewers are on the branch - validation, webhooks, secrets and the sheet itself. I will collect what they find as it comes in.'),
      turnResult(9_400),
      subagentText('sa-in-a', 'Reading apps/api/src/payments/session.ts and the merchant agent it builds...'),
      subagentText('sa-in-b', 'Comparing the signature check against the Adyen fixtures in test/fixtures/webhooks...'),
      subagentText('sa-in-c', 'Walking the diff for anything that looks like a key: 3 candidates so far, all of them env lookups.'),
      subagentText('sa-in-d', 'The sheet renders the merchant name straight from the API answer - checking how it is escaped.'),
      agent({
        type: 'system',
        subtype: 'task_notification',
        task_id: 'sa-c',
        summary: 'No secrets in the diff: all three candidates read from env at runtime.',
      }),
      agent({
        type: 'system',
        subtype: 'task_notification',
        task_id: 'sa-b',
        summary: 'webhooks.ts checks a Stripe signature for every event - an Adyen one would be rejected before it is read.',
      }),
      ...textReply(
        [
          'Two of the four are back, and one of them found something that matters.',
          '',
          '**Webhook signatures** - `webhooks.ts:63` verifies every event against the Stripe secret, whoever sent it. That is correct today and wrong the moment Adyen goes live: their events would fail the check and be dropped as forgeries, silently.',
          '',
          '**Secrets in the diff** - clean. The three candidates are `env.APPLE_MERCHANT_ID`, `env.PUBLIC_HOST` and `env.APPLE_MERCHANT_CERT`, all read at runtime, none of them written down.',
          '',
          'The validation and sheet reviewers are still reading; I will add what they say to this.',
        ].join('\n'),
      ),
    ]),
  ]),

  /* 7. A fork: the branch a selected line grew into, and the tab strip that keeps them together. */
  scenario('shot-fork', 'Shot: a fork of the conversation', 'showcase', [
    checkpoint('The fork with its quote', [
      ...showcaseBootstrap,
      ...PRELUDE,
      shell({
        type: 'sessions',
        sessions: [
          { id: 's-main', title: 'Apple Pay in the checkout sheet', titleSource: 'llm', kind: 'main', groupId: 'g-checkout', depth: 0, status: 'running', awaitsYou: false },
          {
            id: SESSION,
            title: 'Merchant validation endpoint',
            titleSource: 'llm',
            kind: 'branch',
            parentId: 's-main',
            groupId: 'g-checkout',
            depth: 1,
            status: 'idle',
            awaitsYou: false,
            quote: 'the merchant session has to be signed on the server',
          },
          {
            id: 's-fork-fallback',
            title: 'Card fallback for Firefox',
            titleSource: 'llm',
            kind: 'branch',
            parentId: SESSION,
            groupId: 'g-checkout',
            depth: 2,
            status: 'running',
            awaitsYou: false,
            quote: 'browsers without the API keep the card form',
          },
        ],
      }),
      user('Take just this part: where exactly does the certificate live, and what happens to it on rotation?'),
      ...WORK.slice(0, 2),
      ...textReply(
        [
          'The certificate never reaches the panel or the browser - it lives in two places only:',
          '',
          '1. **`APPLE_MERCHANT_CERT` in the API’s secret store**, read once at boot into the HTTPS agent that signs merchant sessions.',
          '2. **The Apple developer account**, where it is issued and where it expires - 25 months from issue.',
          '',
          'On rotation the new certificate goes into the secret store first, the API is restarted, and only then is the old one revoked in the developer account. In that order a rotation costs no downtime: a session signed by the old certificate stays valid until it completes.',
          '',
          'What is missing today is the alarm. Nothing warns us before the expiry, and the symptom would be every Apple Pay sheet in production failing validation at once.',
        ].join('\n'),
      ),
      turnResult(21_000),
    ]),
  ]),

  /* 8. The composer: chips instead of typed paths, and a queue of what to say next. */
  scenario('shot-composer', 'Shot: the composer with a queue', 'showcase', [
    checkpoint('Chips, attachments and a queue', [
      ...showcaseBootstrap,
      ...PRELUDE,
      user('Walk the sheet through a slow 3G profile and tell me what the shopper actually sees while the merchant session is signed.'),
      ...WORK.slice(0, 2),
      toolUse('Bash', { command: 'pnpm exec playwright test e2e/apple-pay.spec.ts --project=slow-3g', description: 'Run the Apple Pay flow on a throttled profile' }, 'cq-run'),
      shell({ type: 'status', sessionId: SESSION, state: 'running' }),
      shell({
        type: 'queue',
        sessionId: SESSION,
        items: [
          { id: 'q1', text: 'Then compare the timings against the card path - same profile, same cart.', attach: '', images: 0 },
          { id: 'q2', text: 'If the wait is over 400ms, put a skeleton behind the sheet instead of the spinner.', attach: '2 refs', images: 0 },
          { id: 'q3', text: 'And draft the release note for this once the numbers are in.', attach: '1 ref', images: 1 },
        ],
      }),
      shell({ type: 'picked', kind: 'file', value: 'apps/web/src/checkout/PaymentSheet.tsx' }),
      shell({ type: 'picked', kind: 'dir', value: 'e2e' }),
      shell({ type: 'picked', kind: 'img', value: 'design/sheet-loading-state.png' }),
      shell({
        type: 'selection',
        path: 'apps/web/src/checkout/useCheckoutSession.ts',
        startLine: 48,
        startColumn: 3,
        endLine: 61,
        endColumn: 42,
        wholeLines: false,
      }),
    ]),
  ]),

  /* 9. Slash commands suggested in the field itself - the project's own among the built-in ones. */
  scenario('shot-commands', 'Shot: slash commands in the field', 'showcase', [
    checkpoint('The suggestion list', [
      ...showcaseBootstrap,
      ...PRELUDE,
      user('Where does the sheet get the merchant name it prints in the header?'),
      ...WORK.slice(0, 2),
      ...textReply(
        'From the checkout session: `useCheckoutSession()` carries the merchant the API answered with, and the sheet prints `session.merchant.displayName` without touching it further.',
      ),
      turnResult(6_800),
    ]),
  ]),

  /* 10. Bash mode: a command of one's own, run without spending a turn of the agent. */
  scenario('shot-bash', 'Shot: a shell command through "!"', 'showcase', [
    checkpoint('A command and its output', [
      ...showcaseBootstrap,
      ...PRELUDE,
      bash(
        'git log --oneline -6',
        [
          '9f3c1ad Apple Pay entry in the payment registry',
          'c81e740 Sign merchant sessions on the API',
          '4ba22c9 Keep the card form when ApplePaySession is missing',
          '77d0b31 Extract the sheet header into its own component',
          'e10ff58 Adyen: refund port on the provider interface',
          '2c4a99e chore: bump playwright to 1.58',
        ].join('\n'),
      ),
      bash(
        'pnpm exec tsc --noEmit',
        'apps/web/src/checkout/applePay.ts(11,34): error TS2304: Cannot find name ‘Money’.',
        { exitCode: 2, stderr: 'ELIFECYCLE  Command failed with exit code 2.' },
      ),
      user('The type is in checkout/types.ts - import it and run the check again.'),
      ...textReply('`Money` was never imported into `applePay.ts`. Added the import from `./types` and the check passes now: `tsc --noEmit` is clean across the workspace.'),
      turnResult(12_400),
    ]),
  ]),

  /* 11-12. The statistics tab and the achievements behind it - the figures come from the statistics scenario. */
  scenario('shot-stats', 'Shot: the statistics tab', 'showcase', [
    checkpoint('The tab', [...showcaseBootstrap, statisticsFigures, { kind: 'openStatistics' }]),
  ]),
  scenario('shot-achievements', 'Shot: the achievements screen', 'showcase', [
    checkpoint('The screen', [...showcaseBootstrap, statisticsFigures, { kind: 'openStatistics', view: 'achievements' }]),
  ]),

  /* 13. Remote access: the QR code a phone scans, and the devices already paired. */
  scenario('shot-remote', 'Shot: remote access from a phone', 'showcase', [
    checkpoint('The pairing screen', [
      ...showcaseBootstrap,
      ...CONVERSATION,
      shell({
        type: 'remoteState',
        state: 'connected',
        enabled: true,
        relay: 'wss://relay.mzpizote.com',
        agentId: 'a7f3c2e1',
        fingerprint: 'PLUM-RIVER-42',
        keysKept: true,
        devices: [
          { id: 'd1', label: 'iPhone 17 Pro', fingerprint: 'CEDAR-MOTH-19', pairedAt: Date.now() - 26 * 24 * 3600_000, lastSeenAt: Date.now() - 4 * 60_000 },
          { id: 'd2', label: 'Pixel 10', fingerprint: 'AMBER-KITE-77', pairedAt: Date.now() - 9 * 24 * 3600_000, lastSeenAt: Date.now() - 3 * 3600_000 },
        ],
        pairing: { url: 'https://relay.mzpizote.com/p#a7f3c2e1:kQ8xR2mV7nB4tL9cW1sD6fH3jP5yZ0aE', expiresAt: Date.now() + 106_000 },
      }),
      shell({ type: 'clients', count: 1, clients: [{ id: 'iPhone 17 Pro', local: false }] }),
    ]),
  ]),

  /* 14. MCP servers, as the CLI itself reports them. */
  scenario('shot-mcp', 'Shot: MCP servers', 'showcase', [
    checkpoint('The list', [
      ...showcaseBootstrap,
      ...CONVERSATION,
      shell({
        type: 'mcpServers',
        servers: [
          { name: 'stripe', status: 'connected', scope: 'project', transport: 'http', command: 'https://mcp.stripe.com', error: '' },
          { name: 'linear', status: 'connected', scope: 'user', transport: 'sse', command: 'https://mcp.linear.app/sse', error: '' },
          { name: 'postgres-staging', status: 'connected', scope: 'project', transport: 'stdio', command: 'npx -y @modelcontextprotocol/server-postgres', error: '' },
          { name: 'figma', status: 'needs-auth', scope: 'user', transport: 'http', command: 'https://mcp.figma.com', error: '' },
          { name: 'sentry', status: 'failed', scope: 'project', transport: 'stdio', command: 'npx -y @sentry/mcp-server', error: 'Connection closed before the handshake finished (exit code 1). Check SENTRY_AUTH_TOKEN.' },
          { name: 'playwright', status: 'connected', scope: 'local', transport: 'stdio', command: 'npx -y @playwright/mcp@latest --isolated', error: '' },
          { name: 'context7', status: 'disabled', scope: 'dynamic', transport: 'http', command: 'https://mcp.context7.com/mcp', error: '' },
        ],
      }),
    ]),
  ]),

  /* 15. Plugins: what is installed, and the catalogue the marketplaces offer. */
  scenario('shot-plugins', 'Shot: plugins and marketplaces', 'showcase', [
    checkpoint('The list', [
      ...showcaseBootstrap,
      ...CONVERSATION,
      shell({
        type: 'plugins',
        installed: [
          { id: 'payments-review@nimbus-internal', version: '2.4.0', scope: 'project', enabled: true },
          { id: 'design-tokens@nimbus-internal', version: '1.9.3', scope: 'project', enabled: true },
          { id: 'playwright-flows@community', version: '0.7.1', scope: 'user', enabled: true },
          { id: 'sql-migrations@community', version: '3.0.2', scope: 'user', enabled: false },
        ],
        available: [
          { id: 'openapi-guard@community', name: 'OpenAPI Guard', description: 'Checks a route against the published schema before it ships.', marketplace: 'community', installCount: 18_420 },
          { id: 'a11y-audit@community', name: 'Accessibility Audit', description: 'Walks a screen for contrast, focus order and labels.', marketplace: 'community', installCount: 12_907 },
          { id: 'terraform-plan@community', name: 'Terraform Plan Reader', description: 'Explains a plan diff in plain words before the apply.', marketplace: 'community', installCount: 8_318 },
          { id: 'changelog@nimbus-internal', name: 'Changelog Writer', description: 'Drafts release notes from the merged pull requests.', marketplace: 'nimbus-internal', installCount: 214 },
        ],
      }),
      shell({
        type: 'marketplaces',
        marketplaces: [
          { name: 'nimbus-internal', source: 'github:nimbus/claude-plugins' },
          { name: 'community', source: 'github:anthropics/claude-code-plugins' },
        ],
      }),
    ]),
  ]),

  /* 16. The sound alerts - seven moments worth being called for. */
  scenario('shot-sounds', 'Shot: sound alerts', 'showcase', [
    checkpoint('The screen', [
      ...showcaseBootstrap,
      ...CONVERSATION,
      shell({
        type: 'init',
        projectName: 'nimbus-checkout',
        workingDirectory: ROOT,
        gitBranch: 'feature/apple-pay-sheet',
        pluginVersion: '0.8.3',
        preferences: { model: 'opus', effort: 'high', mode: 'acceptEdits' },
        sounds: { muted: ['turnFinished'], volumes: { permission: 80, question: 65, rateLimit: 45 } },
      }),
    ]),
  ]),

  /* 17. The history of this project's conversations - kept by Claude Code itself. */
  scenario('shot-history', 'Shot: past conversations', 'showcase', [
    checkpoint('The list', [...showcaseBootstrap, ...CONVERSATION]),
  ]),
]

/** Past conversations, answered by the harness when the history screen asks for them (see player.ts). */
export const SHOWCASE_HISTORY = [
  { id: 'h-1', title: 'Apple Pay in the checkout sheet', updatedAt: Date.now() - 12 * 60_000, messages: 64, titleSource: 'llm' as const },
  { id: 'h-2', title: 'Refund webhooks retry storm', updatedAt: Date.now() - 3 * 3600_000, messages: 41, titleSource: 'llm' as const },
  { id: 'h-3', title: 'Design tokens for the summary card', updatedAt: Date.now() - 27 * 3600_000, messages: 18, titleSource: 'llm' as const },
  { id: 'h-4', title: 'Why the Adyen sandbox rejects our 3DS challenge', updatedAt: Date.now() - 2 * 24 * 3600_000, messages: 96, titleSource: 'llm' as const },
  { id: 'h-5', title: 'Split the checkout bundle - 180KB off the first paint', updatedAt: Date.now() - 3 * 24 * 3600_000, messages: 52, titleSource: 'llm' as const },
  { id: 'h-6', title: 'Postgres deadlock on concurrent refunds', updatedAt: Date.now() - 5 * 24 * 3600_000, messages: 73, titleSource: 'llm' as const },
  { id: 'h-7', title: 'Move the e2e suite onto the sharded runner', updatedAt: Date.now() - 6 * 24 * 3600_000, messages: 29, titleSource: 'llm' as const },
  { id: 'h-8', title: 'ADR: one registry for every payment provider', updatedAt: Date.now() - 9 * 24 * 3600_000, messages: 110, titleSource: 'llm' as const },
  { id: 'h-9', title: 'Idempotency keys on the intent endpoint', updatedAt: Date.now() - 11 * 24 * 3600_000, messages: 47, titleSource: 'llm' as const },
  { id: 'h-10', title: 'The sheet flickers on iOS when the keyboard opens', updatedAt: Date.now() - 14 * 24 * 3600_000, messages: 35, titleSource: 'heuristic' as const },
]
