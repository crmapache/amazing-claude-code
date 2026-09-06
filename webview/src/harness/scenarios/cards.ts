import {
  agent,
  checkpoint,
  resolvePlan,
  scenario,
  shell,
  SESSION,
  subagentText,
  textReply,
  toolResult,
  toolUse,
  turnResult,
  user,
  wait,
} from '../events'
import type { Scenario } from '../types'
import type { WorkflowProgress } from '../../protocol'

/** What `/code-review` answers with in streaming mode - a line of preamble and a fenced json block. */
const REVIEW_REPORT = "I've completed the review. Here are the findings.\n\n```json\n[\n  {\n    \"file\": \"lib/providers/google-ads/sync/entity-daily-metrics.ts\",\n    \"line\": 66,\n    \"category\": \"correctness\",\n    \"verdict\": \"CONFIRMED\",\n    \"short_summary\": \"`metrics.phone_calls` is not selectable on `customer`\",\n    \"summary\": \"`metrics.phone_calls` is not selectable on the `customer` report, so every account-level request fails and no account-level action can be measured.\",\n    \"failure_scenario\": \"The SDK's field metadata lists `metrics.phone_calls` under `CampaignMetric` and `AdGroupMetric` but not under `CustomerMetric`. The account report therefore asks Google for a field it does not have, the query is rejected, every container lands in `unread`, and the only symptom is one line in the console.\"\n  },\n  {\n    \"file\": \"lib/analysis/action-impact/metric.ts\",\n    \"line\": 84,\n    \"category\": \"correctness\",\n    \"verdict\": \"PLAUSIBLE\",\n    \"summary\": \"An account that never populates `metrics.phone_calls` reads as a 0% change rather than as unmeasurable.\",\n    \"failure_scenario\": \"An advertiser without call reporting gets 0 on every day both before and after the change. Both bands collapse to zero, the comparison calls them touching, and the journal states \\u201cwe looked and nothing moved\\u201d about a phone number whose effect was never observable.\"\n  },\n  {\n    \"file\": \"supabase/migrations/20260825230000_call_rate_metric.sql\",\n    \"line\": 29,\n    \"category\": \"correctness\",\n    \"summary\": \"The migration drops the constraint by a name the declarative schema does not give it.\",\n    \"failure_scenario\": \"A database built from the declarative file carries the auto-generated name, so `drop constraint` without `if exists` aborts the whole run.\"\n  },\n  {\n    \"file\": \"lib/analysis/change-clustering/dispositions.ts\",\n    \"line\": 201,\n    \"category\": \"simplification\",\n    \"outcome\": \"fixed\",\n    \"summary\": \"The helper meant to end the copies of this expression left the third copy in place.\",\n    \"failure_scenario\": \"`index.ts:162` still reads the role out of the link name itself, character for character. Any change to how a role is read applies to two of the three call sites.\"\n  }\n]\n```"

/** A briefing of the kind people paste into the field instead of retyping - long, and multi-line. */
const BRIEF = [
  'You are moving the existing JetBrains plugin into a standalone desktop app on Electron for macOS.',
  'Read the README first. Then save this whole text into docs/desktop/PLAN.md and work through it stage',
  'by stage.',
  '',
  'Work to the end without handing control back to me. Do not ask questions: at a fork, choose yourself',
  'and write the choice down with your reasoning in docs/desktop/DECISIONS.md. Do not stop to ask',
  '"shall I go on" - simply go on with the next stage.',
  '',
  'WHY THIS IS NOT A REWRITE: the interface already knows nothing about the IDE. webview/ receives the',
  "agent's events untouched through window.__accSend / window.__accReceive, and webview/src/protocol.ts",
  'is the single source of truth. The mobile build already runs this very interface in an ordinary',
  'browser. That is, only the host changes.',
  '',
  'STACK: Electron + electron-vite + TypeScript. Vitest for the unit tests, Playwright _electron for the',
  'smoke test, electron-builder for the build, node-pty for the terminal.',
  '',
  'STAGE A. The skeleton: a window, the panel inside it, the bridge in the preload.',
  'STAGE B. Launching the CLI out of the main process, the stream parsed line by line.',
  'STAGE C. The project: opening a folder, the recent list, the working directory.',
  'STAGE D. The editor: reading a file, watching the disk, writing back.',
  'STAGE E. The build and signing.',
].join('\n')

/** The same thing a hundred times over: a log people paste whole, past what the feed will draw. */
const HUGE_LOG = Array.from(
  { length: 900 },
  (_, at) =>
    `2026-08-29T15:0${at % 10}:12.418Z  worker#${(at % 8) + 1}  GET /api/checkout/summary 200 in ${18 + (at % 40)}ms  cache=${at % 3 === 0 ? 'miss' : 'hit'}`,
).join('\n')

/**
 * One agent's line in a workflow's report. A helper because the CLI resends the whole fleet on every
 * change - the checkpoints below differ from one another by a field or two in a list of nine.
 */
const wfAgent = (
  index: number,
  label: string,
  over: Partial<Extract<WorkflowProgress, { type: 'workflow_agent' }>> = {},
): WorkflowProgress => ({
  type: 'workflow_agent',
  index,
  label,
  phaseIndex: 1,
  model: 'claude-opus-5',
  state: 'start',
  // The name its own transcript is filed under - what an unfolded line is read by (see WorkflowRun and
  // WorkflowAgents.kt). The CLI mints a hex string of its own; here the number will do.
  agentId: `a${index}fbb0c1de2f3a4b5c`,
  // Both cut to 400 characters, exactly as the CLI cuts them (measured on recorded runs). They are what
  // an unfolded line shows where the transcript cannot be read, so a fleet without them would leave that
  // half of the card untried.
  promptPreview: WF_PROMPT_PREVIEW,
  ...(over.state === 'done' ? { resultPreview: WF_RESULT_PREVIEW } : {}),
  ...over,
})

/** The errand as the report carries it: the first 400 characters and a mark that it goes on. */
const WF_PROMPT_PREVIEW = `${[
  '## Code-review finder',
  '',
  '## Review scope',
  'Diff command: git diff main...HEAD',
  'Changed files (12): src/checkout/totals.ts, src/checkout/summary.tsx, src/checkout/cart.ts, src/checkout/env.ts, src/checkout/guard.ts, src/api/orders.ts',
  '',
  'Report every finding as an object with file, line, summary and a failure scenario. Say nothing about style.',
].join('\n').slice(0, 400)}…`

/** And the answer - which for an agent with a schema is the opening of its JSON, and nothing more. */
const WF_RESULT_PREVIEW = `${JSON.stringify({
  findings: [
    {
      file: 'src/checkout/totals.ts',
      line: 41,
      summary: 'A discount larger than the subtotal makes the total negative.',
      failure_scenario: 'Cart of 900, a 1000-off coupon: the total comes out at -100 and the charge is created for it.',
    },
  ],
}).slice(0, 400)}…`

export const scenariosCards: Scenario[] = [
  /**
   * A paste is the one attachment with nowhere else to be read: a file chip stands for a file still on
   * disk, a paste stands for text that exists nowhere but in this message. So it opens in the feed - see
   * PasteView in UserCard.
   *
   * It arrives here as an echo rather than through `user(...)`: the harness's send carries plain text,
   * and chips are exactly what this scenario is about. The panel draws somebody else's message out of
   * these very tokens (see promptEcho), which is the path a message from a phone or a second panel takes.
   */
  scenario('paste', 'A paste inside a sent message', 'cards', [
    checkpoint('A long paste at the end of a message: the first lines of it, folded', [
      shell({
        type: 'promptEcho',
        sessionId: SESSION,
        tokens: [
          { kind: 'text', value: '/Users/you/demo-project - here is the plugin itself\n' },
          { kind: 'chip', chip: { kind: 'paste', value: 'pasted', text: BRIEF } },
        ],
      }),
      wait(400),
    ]),
    checkpoint('The agent takes it on', [
      ...textReply("I'll start by reading the README and understanding the existing plugin structure."),
      turnResult(8000),
    ]),
    checkpoint('A paste in the middle of a message stays an ordinary chip', [
      shell({
        type: 'promptEcho',
        sessionId: SESSION,
        tokens: [
          { kind: 'text', value: 'and take this into account too: ' },
          { kind: 'chip', chip: { kind: 'paste', value: 'pasted', text: BRIEF } },
          { kind: 'text', value: ' - stage E can wait until the rest of it works' },
        ],
      }),
      wait(400),
    ]),
    checkpoint('A log too long to be drawn whole - open it and the panel says how much is on screen', [
      shell({
        type: 'promptEcho',
        sessionId: SESSION,
        tokens: [
          { kind: 'text', value: 'the checkout is slow again, here is an hour of it\n' },
          { kind: 'chip', chip: { kind: 'paste', value: 'pasted', text: HUGE_LOG } },
        ],
      }),
      wait(400),
    ]),
  ]),


  scenario('todo-list', 'The task list', 'cards', [
    checkpoint('The user asks to break the work into steps', [
      user('Break the work on the login feature into steps and get started'),
      wait(400),
    ]),
    checkpoint('TodoWrite: the task list', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Add the login form', status: 'completed' },
            { content: 'Wire up the validation', status: 'in_progress' },
            { content: 'Write an e2e test', status: 'pending' },
          ],
        },
        'c6-todo',
      ),
      wait(500),
    ]),
    checkpoint('-> the result', [toolResult('c6-todo', 'Todos have been modified successfully.'), wait(500)]),
    checkpoint('TodoWrite: the list has grown - there is something to collapse', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Add the login form', status: 'completed' },
            { content: 'Wire up the validation', status: 'completed' },
            { content: 'Keep the token in an httpOnly cookie', status: 'in_progress' },
            { content: 'Update the authorisation middleware', status: 'pending' },
            { content: 'Write the login e2e test', status: 'pending' },
            { content: 'Write the logout e2e test', status: 'pending' },
            { content: 'Update the auth documentation', status: 'pending' },
          ],
        },
        'c6-todo-2',
      ),
      wait(500),
    ]),
    checkpoint('-> the result', [toolResult('c6-todo-2', 'Todos have been modified successfully.'), wait(500)]),

    checkpoint('Edit: session.ts - moves the token into an httpOnly cookie', [
      toolUse(
        'Edit',
        {
          file_path: '/Users/you/demo-project/src/auth/session.ts',
          old_string: "export const saveSession = (token: string) => {\n  localStorage.setItem('session', token)\n}",
          new_string:
            "export const saveSession = (token: string, res: Response) => {\n  res.cookie('session', token, { httpOnly: true, sameSite: 'strict' })\n}",
        },
        'c6-cookie',
      ),
      wait(700),
    ]),
    checkpoint('-> the result', [toolResult('c6-cookie', 'The file has been updated.'), wait(600)]),
    checkpoint('TodoWrite: the cookie is done, next the middleware', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Add the login form', status: 'completed' },
            { content: 'Wire up the validation', status: 'completed' },
            { content: 'Keep the token in an httpOnly cookie', status: 'completed' },
            { content: 'Update the authorisation middleware', status: 'in_progress' },
            { content: 'Write the login e2e test', status: 'pending' },
            { content: 'Write the logout e2e test', status: 'pending' },
            { content: 'Update the auth documentation', status: 'pending' },
          ],
        },
        'c6-todo-3',
      ),
      wait(500),
    ]),
    checkpoint('-> the result', [toolResult('c6-todo-3', 'Todos have been modified successfully.'), wait(500)]),

    checkpoint('Edit: guard.ts - checks the cookie instead of the header', [
      toolUse(
        'Edit',
        {
          file_path: '/Users/you/demo-project/src/middleware/guard.ts',
          old_string: 'const token = req.headers.authorization',
          new_string: 'const token = req.cookies.session',
        },
        'c6-guard',
      ),
      wait(650),
    ]),
    checkpoint('-> the result', [toolResult('c6-guard', 'The file has been updated.'), wait(600)]),
    checkpoint('TodoWrite: the middleware is done, next the login e2e test', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Add the login form', status: 'completed' },
            { content: 'Wire up the validation', status: 'completed' },
            { content: 'Keep the token in an httpOnly cookie', status: 'completed' },
            { content: 'Update the authorisation middleware', status: 'completed' },
            { content: 'Write the login e2e test', status: 'in_progress' },
            { content: 'Write the logout e2e test', status: 'pending' },
            { content: 'Update the auth documentation', status: 'pending' },
          ],
        },
        'c6-todo-4',
      ),
      wait(500),
    ]),
    checkpoint('-> the result', [toolResult('c6-todo-4', 'Todos have been modified successfully.'), wait(500)]),

    checkpoint('Write: the login e2e test', [
      toolUse(
        'Write',
        {
          file_path: '/Users/you/demo-project/e2e/login.e2e.ts',
          content:
            "test('logs in and sets session cookie', async ({ page }) => {\n  await page.goto('/login')\n  await page.fill('#email', 'demo@example.com')\n  await page.fill('#password', 'secret')\n  await page.click('button[type=submit]')\n  await expect(page).toHaveURL('/dashboard')\n})\n",
        },
        'c6-e2e-login',
      ),
      wait(750),
    ]),
    checkpoint('-> the result', [
      toolResult('c6-e2e-login', 'File created successfully at: /Users/you/demo-project/e2e/login.e2e.ts'),
      wait(600),
    ]),
    checkpoint('TodoWrite: the login e2e is done, next the logout e2e test', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Add the login form', status: 'completed' },
            { content: 'Wire up the validation', status: 'completed' },
            { content: 'Keep the token in an httpOnly cookie', status: 'completed' },
            { content: 'Update the authorisation middleware', status: 'completed' },
            { content: 'Write the login e2e test', status: 'completed' },
            { content: 'Write the logout e2e test', status: 'in_progress' },
            { content: 'Update the auth documentation', status: 'pending' },
          ],
        },
        'c6-todo-5',
      ),
      wait(500),
    ]),
    checkpoint('-> the result', [toolResult('c6-todo-5', 'Todos have been modified successfully.'), wait(500)]),

    checkpoint('Write: the logout e2e test', [
      toolUse(
        'Write',
        {
          file_path: '/Users/you/demo-project/e2e/logout.e2e.ts',
          content:
            "test('logs out and clears session cookie', async ({ page }) => {\n  await page.goto('/dashboard')\n  await page.click('#logout')\n  await expect(page).toHaveURL('/login')\n})\n",
        },
        'c6-e2e-logout',
      ),
      wait(750),
    ]),
    checkpoint('-> the result', [
      toolResult('c6-e2e-logout', 'File created successfully at: /Users/you/demo-project/e2e/logout.e2e.ts'),
      wait(600),
    ]),
    checkpoint('TodoWrite: the logout e2e is done, next the documentation', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Add the login form', status: 'completed' },
            { content: 'Wire up the validation', status: 'completed' },
            { content: 'Keep the token in an httpOnly cookie', status: 'completed' },
            { content: 'Update the authorisation middleware', status: 'completed' },
            { content: 'Write the login e2e test', status: 'completed' },
            { content: 'Write the logout e2e test', status: 'completed' },
            { content: 'Update the auth documentation', status: 'in_progress' },
          ],
        },
        'c6-todo-6',
      ),
      wait(500),
    ]),
    checkpoint('-> the result', [toolResult('c6-todo-6', 'Todos have been modified successfully.'), wait(500)]),

    checkpoint('Edit: README.md - describes the cookie session', [
      toolUse(
        'Edit',
        {
          file_path: '/Users/you/demo-project/README.md',
          old_string: '## Auth\n\nTODO',
          new_string:
            '## Auth\n\nThe session token is kept in an httpOnly cookie and checked in src/middleware/guard.ts.',
        },
        'c6-docs',
      ),
      wait(650),
    ]),
    checkpoint('-> the result', [toolResult('c6-docs', 'The file has been updated.'), wait(600)]),
    checkpoint('TodoWrite: all seven are done - the list has to disappear', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Add the login form', status: 'completed' },
            { content: 'Wire up the validation', status: 'completed' },
            { content: 'Keep the token in an httpOnly cookie', status: 'completed' },
            { content: 'Update the authorisation middleware', status: 'completed' },
            { content: 'Write the login e2e test', status: 'completed' },
            { content: 'Write the logout e2e test', status: 'completed' },
            { content: 'Update the auth documentation', status: 'completed' },
          ],
        },
        'c6-todo-7',
      ),
      wait(500),
    ]),
    checkpoint('-> the result', [toolResult('c6-todo-7', 'Todos have been modified successfully.'), wait(500)]),

    checkpoint('The finished answer', [
      ...textReply(
        'The login feature is done in full: the form, the validation, the token in an httpOnly cookie, the middleware checking the cookie, both e2e tests (login and logout) written, the documentation updated - seven out of seven.',
      ),
      turnResult(26000),
    ]),
  ]),

  // The plan card is genuine and the clicks on both buttons are real (they send a genuine answer to the
  // agent) - but beyond the click itself the script does not play the backend's reaction out. So both forks -
  // "approved" and "asked to rework" - are separate scenarios: choosing one of them in the list on the left
  // is that very choice of a button, only played out whole and in advance rather than cut off mid-word.
  scenario('plan-approve-run', 'A plan: approved - it runs', 'cards', [
    checkpoint('The user asks to plan moving the config', [
      user('Plan how to move the config into a separate module'),
      wait(500),
    ]),
    checkpoint('ExitPlanMode: a 3-step plan - awaiting a decision', [
      toolUse(
        'ExitPlanMode',
        {
          plan:
            '## What we are doing\n' +
            '\n' +
            '1. Move the environment variables into `config/env.ts` - **before** editing the call sites\n' +
            '   - collect every use of `process.env` first\n' +
            '   - then replace them in one batch rather than one at a time\n' +
            '2. Replace the direct uses of process.env with an import from config\n' +
            '3. Add validation of the required variables at startup\n' +
            '\n' +
            'After that we run the tests in full: the move touches the application startup.',
        },
        'c7-plan',
      ),
      wait(500),
    ]),
    // The turn stands still at this place: the agent waits for an answer to the ExitPlanMode call itself, so
    // there is no turn outcome here. "Approve & run" answers it with "the plan is approved" - it carries on
    // within the same turn, without a new message from the user, while the shell then switches the
    // conversation into bypass: otherwise every next step of the same plan would run into a permission
    // again. resolvePlan imitates the click - the plan card disappears from the feed.
    checkpoint('A click on "Approve & run" - the plan runs without questions', [
      resolvePlan('c7-plan', 'approve'),
      shell({ type: 'mode', sessionId: SESSION, mode: 'bypassPermissions', applied: true }),
      wait(400),
    ]),
    // An approved plan turns into a task list - the same panel above the input field as in "The task list"
    // scenario, by exactly the same route.
    checkpoint('TodoWrite: the plan became a task list', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Move the environment variables into config/env.ts', status: 'in_progress' },
            { content: 'Replace the direct uses of process.env with an import from config', status: 'pending' },
            { content: 'Add validation of the required variables at startup', status: 'pending' },
          ],
        },
        'c7-todo',
      ),
      wait(500),
    ]),
    checkpoint('-> the result', [toolResult('c7-todo', 'Todos have been modified successfully.'), wait(500)]),
    checkpoint('Write: config/env.ts', [
      toolUse(
        'Write',
        {
          file_path: '/Users/you/demo-project/config/env.ts',
          content:
            'export const env = {\n  apiUrl: process.env.API_URL,\n  dbUrl: process.env.DATABASE_URL,\n  authSecret: process.env.AUTH_SECRET,\n}\n',
        },
        'c7-env',
      ),
      wait(700),
    ]),
    checkpoint('-> the result', [
      toolResult('c7-env', 'File created successfully at: /Users/you/demo-project/config/env.ts'),
      wait(500),
    ]),
    checkpoint('TodoWrite: step 1 is done, next the config import', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Move the environment variables into config/env.ts', status: 'completed' },
            { content: 'Replace the direct uses of process.env with an import from config', status: 'in_progress' },
            { content: 'Add validation of the required variables at startup', status: 'pending' },
          ],
        },
        'c7-todo-2',
      ),
      wait(500),
    ]),
    checkpoint('-> the result', [toolResult('c7-todo-2', 'Todos have been modified successfully.'), wait(500)]),
    checkpoint('Edit: bootstrap.ts - imports the config', [
      toolUse(
        'Edit',
        {
          file_path: '/Users/you/demo-project/src/server/bootstrap.ts',
          old_string: 'const dbUrl = process.env.DATABASE_URL',
          new_string: "import { env } from '../../config/env'\n\nconst dbUrl = env.dbUrl",
        },
        'c7-bootstrap',
      ),
      wait(650),
    ]),
    checkpoint('-> the result', [toolResult('c7-bootstrap', 'The file has been updated.'), wait(500)]),
    checkpoint('TodoWrite: step 2 is done, next the validation', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Move the environment variables into config/env.ts', status: 'completed' },
            { content: 'Replace the direct uses of process.env with an import from config', status: 'completed' },
            { content: 'Add validation of the required variables at startup', status: 'in_progress' },
          ],
        },
        'c7-todo-3',
      ),
      wait(500),
    ]),
    checkpoint('-> the result', [toolResult('c7-todo-3', 'Todos have been modified successfully.'), wait(500)]),
    checkpoint('Edit: env.ts - validation of the required variables', [
      toolUse(
        'Edit',
        {
          file_path: '/Users/you/demo-project/config/env.ts',
          old_string: 'export const env = {\n  apiUrl: process.env.API_URL,\n  dbUrl: process.env.DATABASE_URL,\n  authSecret: process.env.AUTH_SECRET,\n}',
          new_string:
            'export const env = {\n  apiUrl: process.env.API_URL,\n  dbUrl: process.env.DATABASE_URL,\n  authSecret: process.env.AUTH_SECRET,\n}\n\nfor (const [key, value] of Object.entries(env)) {\n  if (!value) throw new Error(`Missing required env var: ${key}`)\n}',
        },
        'c7-validate',
      ),
      wait(650),
    ]),
    checkpoint('-> the result', [toolResult('c7-validate', 'The file has been updated.'), wait(500)]),
    checkpoint('TodoWrite: all three are done - the list has to disappear', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Move the environment variables into config/env.ts', status: 'completed' },
            { content: 'Replace the direct uses of process.env with an import from config', status: 'completed' },
            { content: 'Add validation of the required variables at startup', status: 'completed' },
          ],
        },
        'c7-todo-4',
      ),
      wait(500),
    ]),
    checkpoint('-> the result', [toolResult('c7-todo-4', 'Todos have been modified successfully.'), wait(500)]),
    checkpoint('The finished answer', [
      ...textReply(
        'Moved the environment variables into config/env.ts, replaced the direct use in bootstrap.ts with an import from the config and added validation of the required variables at startup - all three steps of the plan are done.',
      ),
      turnResult(18000),
    ]),
  ]),

  /**
   * The same withdrawal, but over a plan. A plan that nobody decided about does not leave the feed: its
   * text is still worth reading, and losing it because the turn was stopped would be the person's loss.
   * It merely stops offering buttons and says so - see PlanCard.withdrawn.
   */
  scenario('plan-withdrawn', 'A plan the agent takes back', 'cards', [
    checkpoint('The user asks to plan moving the config', [
      user('Plan how to move the config into a separate module'),
      wait(500),
    ]),
    checkpoint('ExitPlanMode: a 3-step plan - awaiting a decision', [
      toolUse(
        'ExitPlanMode',
        {
          plan:
            '## What we are doing\n' +
            '\n' +
            '1. Move the environment variables into `config/env.ts`\n' +
            '2. Replace the direct uses of process.env with an import from config\n' +
            '3. Add validation of the required variables at startup\n',
        },
        'c7c-plan',
      ),
      wait(500),
    ]),
    checkpoint('Stop pressed - the plan stays, its buttons do not', [
      shell({ type: 'planResolved', sessionId: SESSION, id: 'c7c-plan', decision: 'withdrawn' }),
      wait(300),
      turnResult(1600),
    ]),
  ]),

  scenario('plan-keep-planning', 'A plan: asked to rework it', 'cards', [
    checkpoint('The user asks to plan moving the config', [
      user('Plan how to move the config into a separate module'),
      wait(500),
    ]),
    checkpoint('ExitPlanMode: a 3-step plan - awaiting a decision', [
      toolUse(
        'ExitPlanMode',
        {
          plan:
            '## What we are doing\n' +
            '\n' +
            '1. Move the environment variables into `config/env.ts` - **before** editing the call sites\n' +
            '   - collect every use of `process.env` first\n' +
            '   - then replace them in one batch rather than one at a time\n' +
            '2. Replace the direct uses of process.env with an import from config\n' +
            '3. Add validation of the required variables at startup\n' +
            '\n' +
            'After that we run the tests in full: the move touches the application startup.',
        },
        'c7b-plan',
      ),
      wait(500),
    ]),
    // "Keep planning" answers the agent with a refusal plus an explanation: the plan is not run, the mode
    // stays planning, and the agent itself carries on within the same turn in ordinary text, as in a live
    // chat, rather than falling silent awaiting a new message. resolvePlan imitates the click itself - the
    // plan card disappears from the feed.
    checkpoint('A click on "Keep planning" - the plan goes back for rework, the mode stays', [
      resolvePlan('c7b-plan', 'keepPlanning'),
      wait(400),
    ]),
    checkpoint('The finished answer: a clarifying question, without running anything', [
      ...textReply(
        'All right, I am not running it. To clarify: should the validation of the required variables be an explicit throw at startup, or go straight through a ready parser such as zod?',
      ),
      turnResult(1400),
    ]),
  ]),

  scenario('ask-question', 'A question with options', 'cards', [
    checkpoint('The user wants to add a dark theme', [user('I want to add a dark theme'), wait(500)]),
    checkpoint('AskUserQuestion: how to choose the default theme', [
      toolUse(
        'AskUserQuestion',
        {
          questions: [
            {
              question: 'How do we choose the default theme?',
              header: 'Theme',
              multiSelect: false,
              options: [
                { label: 'By the system setting', description: 'We look at prefers-color-scheme' },
                { label: 'Always light', description: 'We ignore the system setting' },
              ],
            },
          ],
        },
        'c8-ask',
      ),
      wait(500),
    ]),
    checkpoint('-> the user answer', [
      toolResult('c8-ask', 'Answered: By the system setting'),
      wait(400),
    ]),
    checkpoint('The finished answer', [
      ...textReply('Understood, I will take the system setting as the source of the default theme.'),
      turnResult(1600),
    ]),
  ]),

  // Six questions in one call is an ordinary thing when configuring something many-sided. It checks the
  // grid layout over 5 options, the multiSelect with its check boxes, and that the panel does not push the
  // input field off the screen but scrolls itself, leaving the head and the send button in place.
  scenario('ask-question-multi', 'A question: 6 questions at once', 'cards', [
    checkpoint('The user asks to finish configuring the dark theme', [
      user('Finish configuring the details of the dark theme'),
      wait(500),
    ]),
    checkpoint('AskUserQuestion: six questions at once', [
      toolUse(
        'AskUserQuestion',
        {
          questions: [
            {
              question: 'Which accent colour should we use?',
              header: 'Accent',
              multiSelect: false,
              options: [
                { label: 'Purple', description: 'As it is now, --acc-accent' },
                { label: 'Blue', description: 'A classic of dark themes' },
                { label: 'Turquoise', description: 'Matching the branch and question colours' },
                { label: 'Orange', description: 'Warm, stands out on dark' },
                { label: 'Pink', description: 'Unusual but readable' },
              ],
            },
            {
              question: 'Which surfaces should go dark straight away?',
              header: 'Area',
              multiSelect: true,
              options: [
                { label: 'The feed', description: 'The main stream of messages' },
                { label: 'The input panel', description: 'The composer and the dock cards' },
                { label: 'The side lists', description: 'Checkpoints, scenarios' },
              ],
            },
            {
              question: 'The shape of the elements?',
              header: 'Shape',
              multiSelect: false,
              options: [
                { label: 'Rounded', description: 'As it is now, --acc-r-*' },
                { label: 'Square corners', description: 'Stricter, more technical' },
              ],
            },
            {
              question: 'The density of the interface?',
              header: 'Density',
              multiSelect: false,
              options: [
                { label: 'Compact', description: 'As it is now' },
                { label: 'Roomy', description: 'More air between the lines' },
              ],
            },
            {
              question: 'The font for code and commands?',
              header: 'Font',
              multiSelect: false,
              options: [
                { label: 'The system mono', description: 'As it is now, --acc-mono' },
                { label: 'JetBrains Mono', description: 'A little wider, with ligatures' },
              ],
            },
            {
              question: 'Switch the shimmer and pulse animations on?',
              header: 'Animations',
              multiSelect: false,
              options: [
                { label: 'Yes', description: 'The status shimmer, the RUNNING pulse' },
                { label: 'No', description: 'Static, for weaker machines' },
              ],
            },
          ],
        },
        'c8b-ask',
      ),
      wait(500),
    ]),
    checkpoint('-> the user answer', [
      toolResult(
        'c8b-ask',
        'Answered: Turquoise; The feed, The input panel; Rounded; Compact; The system mono; Yes',
      ),
      wait(400),
    ]),
    checkpoint('The finished answer', [
      ...textReply(
        'Noted all six: a turquoise accent, we paint the feed and the input panel, rounded corners, compact, the system mono, and we keep the animations.',
      ),
      turnResult(2200),
    ]),
  ]),

  // It ends here on purpose: the scenario goes no further, and the panel will not move on after your click
  // on the permission card - that is a genuine button of a genuine interface rather than part of the script.
  scenario('permission-waiting', 'Waiting for a permission', 'cards', [
    checkpoint('The user asks to delete a file', [
      user('Delete the unused file src/legacy/old-auth.ts'),
      wait(500),
    ]),
    checkpoint('Bash: rm - awaiting a permission', [
      toolUse('Bash', { command: 'rm src/legacy/old-auth.ts' }, 'c9-rm'),
      wait(400),
      shell({
        type: 'permission',
        id: 'c9-perm',
        sessionId: SESSION,
        toolName: 'Bash',
        target: 'rm src/legacy/old-auth.ts',
        command: 'rm src/legacy/old-auth.ts',
        mode: 'default',
      }),
    ]),
  ]),

  // The very question that arrives in "Bypass" too: a dangerous deletion the CLI lets through in no mode
  // and no rule switches it off - hence the reason under the card, and no "Always allow" here at all.
  scenario('permission-dangerous', 'A permission against the mode', 'cards', [
    checkpoint('The user asks to clean the build out', [
      user('Clean the build directory out before the release'),
      wait(500),
    ]),
    checkpoint('Bash: an rm with a wildcard - asked about even in Bypass', [
      toolUse('Bash', { command: 'cd build && rm -rf ./*' }, 'c9b-rm'),
      wait(400),
      shell({
        type: 'permission',
        id: 'c9b-perm',
        sessionId: SESSION,
        toolName: 'Bash',
        target: 'wants to run a command',
        command: 'cd build && rm -rf ./*',
        mode: 'bypassPermissions',
        reason:
          "Dangerous rm operation detected: 'build/*'. This command changes directories before the " +
          'removal, so the relative glob target cannot be statically resolved. This requires explicit ' +
          'approval and cannot be auto-allowed by permission rules.',
        rememberable: false,
      }),
    ]),
  ]),

  /**
   * Stop pressed over a card that is waiting for a decision. The agent takes the question back itself
   * (see PermissionChannel.Incoming.Withdrawn on the IDE's side), and the panel has to take the card off
   * the screen: left there, its buttons answer nobody, while the status line and the phone's list go on
   * promising a decision that no longer exists.
   */
  scenario('permission-withdrawn', 'A permission the agent takes back', 'cards', [
    checkpoint('The user asks to delete a file', [
      user('Delete the unused file src/legacy/old-auth.ts'),
      wait(500),
    ]),
    checkpoint('Bash: rm - awaiting a permission', [
      toolUse('Bash', { command: 'rm src/legacy/old-auth.ts' }, 'c9c-rm'),
      wait(400),
      shell({
        type: 'permission',
        id: 'c9c-perm',
        sessionId: SESSION,
        toolName: 'Bash',
        target: 'rm src/legacy/old-auth.ts',
        command: 'rm src/legacy/old-auth.ts',
        mode: 'default',
      }),
    ]),
    // Exactly what a live CLI sends on Stop: the question is cancelled, the call comes back rejected, and
    // the turn ends. The card must be gone from above the input field - and the feed says why.
    checkpoint('Stop pressed - the question is taken back, the card goes', [
      shell({ type: 'permissionResolved', sessionId: SESSION, id: 'c9c-perm', decision: 'withdrawn' }),
      toolResult(
        'c9c-rm',
        'The user doesn\'t want to proceed with this tool use. The tool use was rejected.',
        true,
      ),
      wait(300),
      turnResult(2100),
    ]),
  ]),

  scenario('subagent-task', 'A subagent call', 'cards', [
    checkpoint('The user asks to find where the environment variables are read', [
      user('Find every place where we read environment variables'),
      wait(500),
    ]),
    // The CLI reports one and the same launch twice: as a call block in the agent's answer and as a system
    // event with a task_id of its own. Both are here - the chip in the header has to stay a single one.
    checkpoint('Task: launching the Explore subagent', [
      toolUse(
        'Task',
        {
          subagent_type: 'Explore',
          description: 'Find where the environment variables are read',
          prompt:
            'Find every place in this repository where an environment variable is read.\n\nGo through src/ and report the file and the line for each one, together with the name of the variable. Include indirect reads through a config helper. Do not change any files - the answer is the whole of the job.',
        },
        'c10-task',
      ),
      agent({
        type: 'system',
        subtype: 'task_started',
        task_id: 'c10-task-id',
        tool_use_id: 'c10-task',
        subagent_type: 'Explore',
        description: 'Find where the environment variables are read',
        task_type: 'local_agent',
      }),
      wait(1200),
    ]),
    checkpoint('The subagent: looking at config and server', [
      subagentText('c10-task', 'Looking at src/config and src/server...'),
      wait(1500),
    ]),
    checkpoint('-> the subagent result', [
      toolResult('c10-task', 'process.env is read in src/config/env.ts (5 places) and src/server/bootstrap.ts (1 place).'),
      wait(500),
    ]),
    checkpoint('The finished answer', [
      ...textReply('The subagent found six places - almost all of them are already in config/env.ts, one strayed into bootstrap.ts.'),
      turnResult(4800),
    ]),
  ]),

  /**
   * The Task tool with run_in_background: the agent ends its own turn right after the launch, without
   * waiting for the subagent - that one brings the work to an end after the main stream's streamStatus has
   * fallen silent. Without a separate branch in streamStatus for "the turn ended but a pending task is
   * still there", the status line would disappear for good until the very task_notification.
   */
  scenario('subagent-outlives-turn', 'A background subagent: the turn ended, it still works', 'cards', [
    checkpoint('The user asks to find and count the TODOs across the whole repository', [
      user('Find every TODO across the whole repository and count them - this may take a while, do not wait, do it in the background'),
      wait(500),
    ]),
    checkpoint('Task: launching a background subagent', [
      toolUse(
        'Task',
        { subagent_type: 'Explore', description: 'Find and count the TODOs', run_in_background: true },
        'c10b-task',
      ),
      agent({
        type: 'system',
        subtype: 'task_started',
        task_id: 'c10b-task-id',
        tool_use_id: 'c10b-task',
        subagent_type: 'Explore',
        description: 'Find and count the TODOs',
        task_type: 'local_agent',
      }),
      wait(800),
    ]),
    checkpoint('The agent ends its own turn at once, without waiting for the subagent', [
      ...textReply('Started the TODO search as a background agent - I will report as soon as it is ready.'),
      turnResult(2200),
    ]),
    checkpoint('The subagent works on after the answer - the status line shows it', [
      subagentText('c10b-task', 'Walking the src/ and test/ directories...'),
      wait(1500),
    ]),
    checkpoint('-> the subagent result, arriving after the answer', [
      toolResult('c10b-task', 'Found 14 TODOs in 9 files, most of them in src/legacy/.'),
      agent({
        type: 'system',
        subtype: 'task_notification',
        task_id: 'c10b-task-id',
        summary: 'Found 14 TODOs in 9 files.',
      }),
      wait(500),
    ]),
    /**
     * Handed the reminder that the background agent has finished, the model sometimes prints the whole
     * reminder back as its own answer - the report inside it and an invented wrapper of closing tags, and
     * only then the sentence it meant to say. Seen live it reads as a broken panel, so the feed shows the
     * sentence alone: neither the wall while the answer streams nor a card with it when it is finished
     * (see spokenAnswer in feed/build.ts).
     */
    checkpoint('The model prints the reminder back at itself - the feed shows only the sentence', [
      ...textReply(
        [
          '<system-reminder>',
          'Background agent c10b-task-id completed. Do NOT read the output file directly - the result is included below.',
          '',
          'Result:',
          '',
          'Found 14 TODOs in 9 files. Most of them sit in src/legacy/, and the oldest goes back to the first commit.',
          '</parameter>',
          '</invoke>',
          '</function_results>Fourteen TODOs in nine files - almost all of them in src/legacy/.',
        ].join('\n'),
      ),
      turnResult(1800),
    ]),
  ]),

  /**
   * How this arrives from a live CLI (checked on 2.1.235 with a skill using `context: fork`): the skill
   * raises the subagents itself, and in the main stream there is neither a tool call about them nor its
   * result - only system events about the launch. The skill ends its own turn at once, having reported the
   * launch, while the agents work on and send their outcomes after it, each through a notification of its
   * own.
   *
   * The point of the scenario is the third checkpoint: the chips of all three agents have to stay in the
   * header after the turn has ended. The end of a turn used to close them as unfinished work, and a dozen
   * working agents disappeared from the header at exactly the moment they had to be watched.
   */
  scenario('background-subagent', 'Subagents from a skill: the turn ended, they work on', 'cards', [
    checkpoint('The user runs /code-review', [user('/code-review'), wait(500)]),
    checkpoint('The skill launch: the head names the skill itself', [
      toolUse('Skill', { skill: 'code-review', args: 'ultra' }, 'c11-skill'),
      wait(400),
      toolResult('c11-skill', 'Launching skill: code-review'),
      wait(600),
    ]),
    checkpoint('The skill raised three subagents itself - there is no call in the stream', [
      agent({
        type: 'system',
        subtype: 'task_started',
        task_id: 'c11-bg-a',
        tool_use_id: 'c11-inner-a',
        subagent_type: 'general-purpose',
        description: 'Angle A - line-by-line diff scan',
        task_type: 'local_agent',
      }),
      agent({
        type: 'system',
        subtype: 'task_started',
        task_id: 'c11-bg-b',
        tool_use_id: 'c11-inner-b',
        subagent_type: 'general-purpose',
        description: 'Angle B - removed-behavior auditor',
        task_type: 'local_agent',
      }),
      agent({
        type: 'system',
        subtype: 'task_started',
        task_id: 'c11-bg-c',
        tool_use_id: 'c11-inner-c',
        subagent_type: 'general-purpose',
        description: 'Angle C - cross-file tracer',
        task_type: 'local_agent',
      }),
      wait(1200),
    ]),
    checkpoint('The turn ended on the launch report - the chips have to stay', [
      ...textReply('Started the review across three angles and I am waiting for the notifications - I will collect the outcome as soon as they all finish.'),
      turnResult(5900),
      wait(2000),
    ]),
    checkpoint('The agents work on: the progress goes into their cards', [
      agent({
        type: 'system',
        subtype: 'task_progress',
        task_id: 'c11-bg-a',
        description: 'Angle A - line-by-line diff scan',
        last_tool_name: 'Read',
      }),
      agent({
        type: 'system',
        subtype: 'task_progress',
        task_id: 'c11-bg-b',
        description: 'Angle B - removed-behavior auditor',
        last_tool_name: 'Grep',
      }),
      wait(2000),
    ]),
    checkpoint('-> the first agent outcome', [
      agent({
        type: 'system',
        subtype: 'task_notification',
        task_id: 'c11-bg-a',
        summary: 'Found 2 remarks: an unused import and a missing null check.',
      }),
      ...textReply('One of the three has finished (the "line-by-line" angle), I am waiting for the rest.'),
      turnResult(1500),
      wait(1500),
    ]),
    checkpoint('-> the outcomes of the other two', [
      agent({
        type: 'system',
        subtype: 'task_notification',
        task_id: 'c11-bg-b',
        summary: 'No removed behaviour was lost anywhere.',
      }),
      agent({
        type: 'system',
        subtype: 'task_notification',
        task_id: 'c11-bg-c',
        summary: 'The cross-cutting edits are in place across all three layers.',
      }),
      wait(500),
    ]),
    checkpoint('The finished answer', [
      ...textReply('All three angles have run - of the findings only the null check is worth looking at.'),
      turnResult(2300),
    ]),
  ]),

  /**
   * A background command arrives through the same events as a subagent but is not an agent: the chip in the
   * header is the only place where it is visible that the process is still alive, and the outcome is
   * appended to its own card in the feed.
   */
  scenario('background-command', 'A background command', 'cards', [
    checkpoint('The user asks to bring the dev server up', [user('Bring the dev server up'), wait(500)]),
    checkpoint('A background Bash: a chip in the header', [
      toolUse('Bash', { command: 'yarn dev', description: 'Start the dev server', run_in_background: true }, 'c11b-dev'),
      agent({
        type: 'system',
        subtype: 'task_started',
        task_id: 'c11b-task',
        tool_use_id: 'c11b-dev',
        description: 'Start the dev server',
        task_type: 'local_bash',
      }),
      toolResult('c11b-dev', 'Command running in background with ID: c11b-task'),
      wait(2000),
    ]),
    checkpoint('The agent answer while the server runs', [
      ...textReply('The server is up and listening on http://localhost:5173 - the chip in the header counts how long it has been running.'),
      turnResult(3200),
      wait(3000),
    ]),
    checkpoint('The server crashed - the chip leaves, the card reddens', [
      agent({
        type: 'system',
        subtype: 'task_notification',
        task_id: 'c11b-task',
        tool_use_id: 'c11b-dev',
        status: 'failed',
        summary: 'Background command "Start the dev server" failed with exit code 1',
      }),
      wait(500),
    ]),
  ]),

  /**
   * An ordinary long command reports itself down the same channel - and must give neither a chip nor an
   * agent card: it is entirely visible as a card in the feed.
   */
  scenario('long-command', 'A long command without the background', 'cards', [
    checkpoint('The user asks to run the types', [user('Run the types'), wait(500)]),
    checkpoint('Bash: a long typecheck', [
      toolUse('Bash', { command: 'yarn typecheck', description: 'Update the metrics test and typecheck' }, 'c11c-tc'),
      agent({
        type: 'system',
        subtype: 'task_started',
        task_id: 'c11c-task',
        tool_use_id: 'c11c-tc',
        description: 'Update the metrics test and typecheck',
        task_type: 'local_bash',
      }),
      wait(2500),
    ]),
    checkpoint('-> the command result', [
      agent({
        type: 'system',
        subtype: 'task_notification',
        task_id: 'c11c-task',
        tool_use_id: 'c11c-tc',
        status: 'completed',
        summary: 'Update the metrics test and typecheck',
      }),
      toolResult('c11c-tc', 'No errors found.'),
      wait(400),
    ]),
    checkpoint('The finished answer', [...textReply('The types are clean.'), turnResult(2600)]),
  ]),

  scenario('multiple-agents', 'Several agents in parallel', 'cards', [
    checkpoint('The user asks for a parallel review', [
      user('Run a review of the front end and the back end in parallel'),
      wait(500),
    ]),
    checkpoint('Task x2: the front end and the back end at once', [
      agent({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'c12-a',
              name: 'Task',
              input: {
                subagent_type: 'react-architecture',
                description: 'A review of the front end',
                prompt:
                  'Review the front end of this change: the components under webview/src/components and the hooks beside them. Report anything that re-renders needlessly or duplicates what the design system already has.',
              },
            },
            {
              type: 'tool_use',
              id: 'c12-b',
              name: 'Task',
              input: {
                subagent_type: 'nest-architecture',
                description: 'A review of the back end',
                prompt:
                  'Review the back end of this change: the controllers, the use-cases and the repositories it touches. Report anything that reaches across a layer it should not.',
              },
            },
          ],
        },
      }),
      // The CLI reports every launch through a system event with a task_id of its own too - the very one the
      // task is later asked to be stopped by.
      agent({
        type: 'system',
        subtype: 'task_started',
        task_id: 'c12-a-id',
        tool_use_id: 'c12-a',
        subagent_type: 'react-architecture',
        description: 'A review of the front end',
        task_type: 'local_agent',
      }),
      agent({
        type: 'system',
        subtype: 'task_started',
        task_id: 'c12-b-id',
        tool_use_id: 'c12-b',
        subagent_type: 'nest-architecture',
        description: 'A review of the back end',
        task_type: 'local_agent',
      }),
      wait(1500),
    ]),
    checkpoint('The front-end agent: looking at the components', [subagentText('c12-a', 'Looking at the components...'), wait(1200)]),
    checkpoint('The back-end agent: looking at the controllers', [subagentText('c12-b', 'Looking at the controllers...'), wait(1800)]),
    checkpoint('-> the front-end result', [toolResult('c12-a', 'The front end is fine, a couple of small findings.'), wait(1200)]),
    checkpoint('-> the back-end result', [toolResult('c12-b', 'The back end is clean too, no remarks.'), wait(500)]),
    checkpoint('The finished answer', [
      ...textReply('Both reviews have finished - a couple of small things on the front end, the back end is clean.'),
      turnResult(8500),
    ]),
    checkpoint('The next message - the finished batch disappears from the dropdown', [
      user('Excellent, now update the README with the findings'),
      wait(400),
    ]),
  ]),

  // It ends on a permission on purpose, as permission-waiting does: the decision is taken by a genuine
  // button of a genuine interface rather than by the scenario.
  scenario('multiple-agents-permission', 'Several agents: one awaits a permission', 'cards', [
    checkpoint('The user asks for a parallel review', [
      user('Run a review of the front end and the back end in parallel'),
      wait(500),
    ]),
    checkpoint('Task x2: the front end and the back end at once', [
      agent({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'c13-a',
              name: 'Task',
              input: { subagent_type: 'react-architecture', description: 'A review of the front end' },
            },
            {
              type: 'tool_use',
              id: 'c13-b',
              name: 'Task',
              input: { subagent_type: 'nest-architecture', description: 'A review of the back end' },
            },
          ],
        },
      }),
      wait(1500),
    ]),
    checkpoint('The front-end agent: looking at the components', [subagentText('c13-a', 'Looking at the components...'), wait(1200)]),
    checkpoint('The back-end agent: it wants to run the tests - awaiting a permission', [
      shell({
        type: 'permission',
        id: 'c13-perm',
        sessionId: SESSION,
        agentId: 'c13-b',
        toolName: 'Bash',
        target: 'wants to run a command',
        command: 'npm test',
        mode: 'default',
      }),
    ]),
  ]),

  /**
   * A Workflow call - one task with a fleet of agents behind it.
   *
   * Those agents reach the panel by no other route: not one of their events carries the mark of a
   * subagent, and their conversations are written straight to disk (checked against CLI 2.1.247 by
   * recording a real run). All the panel is given is the report below, which the CLI resends whole on
   * every change - so the checkpoints here are snapshots of it, exactly as they arrive.
   */
  scenario('workflow', 'A workflow: a fleet of agents at once', 'cards', [
    checkpoint('The agent starts a workflow - one call, nine agents behind it', [
      toolUse('Workflow', { description: 'Review the checkout across four dimensions' }, 'c14-wf'),
      agent({
        type: 'system',
        subtype: 'task_started',
        task_id: 'c14-wf-id',
        tool_use_id: 'c14-wf',
        description: 'Review the checkout across four dimensions',
        task_type: 'local_workflow',
      }),
      // The call is answered at once and in these words (CLI 2.1.257): a confirmation of the launch, not
      // the outcome - the fleet runs on as a background task, and the card must not close here.
      toolResult(
        'c14-wf',
        'Workflow launched in background. Task ID: c14-wf-id\nSummary: Review the checkout across four dimensions',
      ),
      wait(700),
    ]),
    checkpoint('The first phase: four review agents, two of them still queued', [
      agent({
        type: 'system',
        subtype: 'task_progress',
        task_id: 'c14-wf-id',
        description: 'Review: bugs',
        workflow_progress: [
          { type: 'workflow_phase', index: 1, title: 'Review' },
          wfAgent(1, 'review:bugs', { state: 'start', startedAt: Date.now() - 6200 }),
          wfAgent(2, 'review:perf', { state: 'start', startedAt: Date.now() - 5100 }),
          wfAgent(3, 'review:security', {}),
          wfAgent(4, 'review:tests', {}),
        ],
      }),
      wait(1500),
    ]),
    checkpoint('Two are done, one failed, and the script itself reports the count', [
      // Between two reports the CLI keeps sending bare progress events, and for a workflow the name in
      // them is the label of whichever agent moved last. They are here so that the card is watched under
      // the same traffic it gets live: nothing of these may reach its log - hundreds of them used to
      // stand above the report and push it off the screen.
      agent({ type: 'system', subtype: 'task_progress', task_id: 'c14-wf-id', last_tool_name: 'review:bugs' }),
      agent({ type: 'system', subtype: 'task_progress', task_id: 'c14-wf-id', last_tool_name: 'review:security' }),
      agent({
        type: 'system',
        subtype: 'task_progress',
        task_id: 'c14-wf-id',
        description: 'Review: security',
        workflow_progress: [
          { type: 'workflow_phase', index: 1, title: 'Review' },
          wfAgent(1, 'review:bugs', { state: 'done', durationMs: 18400, tokens: 42100, toolCalls: 11 }),
          wfAgent(2, 'review:perf', { state: 'done', durationMs: 12900, tokens: 26300, toolCalls: 7 }),
          wfAgent(3, 'review:security', { state: 'start', startedAt: Date.now() - 4300 }),
          wfAgent(4, 'review:tests', { state: 'error', error: 'the agent returned nothing', attempt: 2 }),
          { type: 'workflow_log', message: '3 dimensions covered, 9 findings so far' },
        ],
      }),
      wait(1500),
    ]),
    checkpoint('The second phase verifies what the first one found', [
      agent({
        type: 'system',
        subtype: 'task_progress',
        task_id: 'c14-wf-id',
        description: 'Verify: finding 3',
        workflow_progress: [
          { type: 'workflow_phase', index: 1, title: 'Review' },
          { type: 'workflow_phase', index: 2, title: 'Verify' },
          wfAgent(1, 'review:bugs', { state: 'done', durationMs: 18400, tokens: 42100, toolCalls: 11 }),
          wfAgent(2, 'review:perf', { state: 'done', durationMs: 12900, tokens: 26300, toolCalls: 7 }),
          wfAgent(3, 'review:security', { state: 'done', durationMs: 21050, tokens: 51800, toolCalls: 14 }),
          wfAgent(4, 'review:tests', { state: 'error', error: 'the agent returned nothing', attempt: 2 }),
          wfAgent(5, 'verify:totals.ts:41', { state: 'done', durationMs: 6100, tokens: 9400, toolCalls: 3, phaseIndex: 2 }),
          wfAgent(6, 'verify:summary.tsx:66', { state: 'start', startedAt: Date.now() - 2400, phaseIndex: 2 }),
          wfAgent(7, 'verify:env.ts:12', { state: 'done', durationMs: 800, cached: true, phaseIndex: 2 }),
          wfAgent(8, 'verify:guard.ts:19', { phaseIndex: 2 }),
          wfAgent(9, 'verify:cart.ts:88', { state: 'error', skipped: true, phaseIndex: 2 }),
          { type: 'workflow_log', message: '3 dimensions covered, 9 findings so far' },
          { type: 'workflow_log', message: '5 findings confirmed, 4 refuted' },
        ],
      }),
      wait(1500),
    ]),
    checkpoint('The workflow ends and the agent reports back', [
      agent({
        type: 'system',
        subtype: 'task_notification',
        task_id: 'c14-wf-id',
        tool_use_id: 'c14-wf',
        status: 'completed',
        summary: 'Dynamic workflow "Review the checkout across four dimensions" completed',
      }),
      ...textReply('Five findings survived the verification pass - the worst of them is in the totals, where a discount can go negative.'),
      turnResult(184000),
    ]),
    /**
     * A second fleet, and the account switched while it works.
     *
     * The turn is over by then - a workflow runs as a background task, and the answer above is written
     * long before the fleet finishes - so nothing here is an interrupted turn: the process is simply
     * replaced under a tab that is saying nothing, and everything it was holding goes with it. Before
     * this the panel said nothing at all, and the card counted up for the rest of the day against a CLI
     * that no longer existed (see processReplaced in protocol.ts).
     */
    checkpoint('A second fleet goes out', [
      toolUse('Workflow', { description: 'Verify the fixes across the same four dimensions' }, 'c14-wf2'),
      agent({
        type: 'system',
        subtype: 'task_started',
        task_id: 'c14-wf2-id',
        tool_use_id: 'c14-wf2',
        description: 'Verify the fixes across the same four dimensions',
        task_type: 'local_workflow',
      }),
      toolResult(
        'c14-wf2',
        'Workflow launched in background. Task ID: c14-wf2-id\nSummary: Verify the fixes across the same four dimensions',
      ),
      agent({
        type: 'system',
        subtype: 'task_progress',
        task_id: 'c14-wf2-id',
        description: 'Verify: totals',
        workflow_progress: [
          { type: 'workflow_phase', index: 1, title: 'Verify' },
          wfAgent(1, 'verify:totals', { state: 'start', startedAt: Date.now() - 3100 }),
          wfAgent(2, 'verify:summary', { state: 'start', startedAt: Date.now() - 1400 }),
          wfAgent(3, 'verify:cart', {}),
        ],
      }),
      turnResult(9000),
      wait(1500),
    ]),
    checkpoint('The account is switched under it, and the fleet does not survive it', [
      shell({ type: 'processReplaced', sessionId: SESSION }),
      wait(1200),
    ]),
  ]),

  scenario('code-review', 'The findings of a code review', 'cards', [
    checkpoint('The user runs the review command', [user('/code-review'), wait(600)]),
    /**
     * `/code-review` is run by the CLI itself rather than by the model, and its whole outcome arrives as
     * one ordinary answer with the findings as raw JSON inside it - which is why there is no streaming
     * here: nothing types this text out, it simply appears whole (see readReview).
     */
    checkpoint('The review answers with its findings', [
      agent({ type: 'assistant', message: { content: [{ type: 'text', text: REVIEW_REPORT }] } }),
      turnResult(659000),
    ]),
  ]),
]
