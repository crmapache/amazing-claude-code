import { checkpoint, scenario, think, thinkReply, toolResult, toolUse, textReply, turnResult, user, wait } from '../events'
import type { Scenario } from '../types'

export const scenariosGrouping: Scenario[] = [
  scenario('single-tool', 'A single call', 'grouping', [
    checkpoint('The user asked about package.json', [user('What is in package.json?'), wait(400)]),
    checkpoint('Read: package.json', [
      toolUse('Read', { file_path: '/Users/you/demo-project/package.json' }, 'g1-read'),
      wait(900),
    ]),
    checkpoint('-> the result', [
      toolResult('g1-read', '1\t{\n2\t  "name": "demo-project",\n3\t  "version": "1.0.0"\n4\t}\n'),
      wait(300),
    ]),
    checkpoint('The finished answer', [
      ...textReply('package.json holds an ordinary manifest: the package name demo-project and version 1.0.0.'),
      turnResult(1800),
    ]),
  ]),

  scenario('tool-burst', 'A burst of calls in a row', 'grouping', [
    checkpoint('The user asked about authentication', [
      user('Work out how authentication is built in this project'),
      wait(400),
    ]),
    checkpoint('Bash: grep authenticate', [
      toolUse('Bash', { command: 'grep -rn "authenticate" src --include=*.ts' }, 'g2-1'),
      wait(700),
    ]),
    checkpoint('-> the result', [
      toolResult('g2-1', 'src/auth/login.ts:12:export const authenticate = async (token: string) => {'),
      wait(250),
    ]),
    checkpoint('Read: login.ts', [
      toolUse('Read', { file_path: '/Users/you/demo-project/src/auth/login.ts' }, 'g2-2'),
      wait(650),
    ]),
    checkpoint('-> the result', [
      toolResult('g2-2', '1\texport const authenticate = async (token: string) => {\n2\t  ...\n3\t}\n'),
      wait(250),
    ]),
    checkpoint('Grep: Session', [toolUse('Grep', { pattern: 'Session', path: 'src/auth' }, 'g2-3'), wait(500)]),
    checkpoint('-> the result', [
      toolResult('g2-3', 'src/auth/session.ts:4:export interface Session {'),
      wait(250),
    ]),
    checkpoint('Read: session.ts', [
      toolUse('Read', { file_path: '/Users/you/demo-project/src/auth/session.ts' }, 'g2-4'),
      wait(600),
    ]),
    checkpoint('-> the result', [
      toolResult('g2-4', '1\texport interface Session {\n2\t  token: string\n3\t}\n'),
      wait(250),
    ]),
    checkpoint('Bash: grep -l Session', [
      toolUse('Bash', { command: 'grep -rln "Session" src --include=*.ts' }, 'g2-5'),
      wait(550),
    ]),
    checkpoint('-> the result', [
      toolResult('g2-5', 'src/auth/session.ts\nsrc/auth/login.ts\nsrc/middleware/guard.ts'),
      wait(250),
    ]),
    checkpoint('Read: guard.ts', [
      toolUse('Read', { file_path: '/Users/you/demo-project/src/middleware/guard.ts' }, 'g2-6'),
      wait(700),
    ]),
    checkpoint('-> the result', [toolResult('g2-6', '1\timport { Session } from "../auth/session"\n'), wait(300)]),
    checkpoint('The finished answer', [
      ...textReply(
        'Authentication is built around authenticate() in login.ts, which creates a Session and is checked in the guard.ts middleware.',
      ),
      turnResult(8000),
    ]),
  ]),

  scenario('no-break-across-gap', 'Does not break between inner steps', 'grouping', [
    checkpoint('The user asks to check the tests', [
      user('Check the tests and fix anything that is red'),
      wait(400),
    ]),
    checkpoint('Bash: vitest run', [toolUse('Bash', { command: 'pnpm vitest run' }, 'g3-1'), wait(900)]),
    checkpoint('-> the test failed', [
      toolResult('g3-1', ' FAIL  src/utils/date.test.ts\n  ✗ formats correctly', true),
      // A longer pause - as though between a turn's inner steps, without a single text block between the
      // calls. The group must not break apart because of it.
      wait(1200),
    ]),
    checkpoint('Read: date.ts', [
      toolUse('Read', { file_path: '/Users/you/demo-project/src/utils/date.ts' }, 'g3-2'),
      wait(700),
    ]),
    checkpoint('-> the result', [
      toolResult('g3-2', '1\texport const formatDate = (d: Date) => d.toString()\n'),
      wait(1000),
    ]),
    checkpoint('Edit: date.ts', [
      toolUse(
        'Edit',
        {
          file_path: '/Users/you/demo-project/src/utils/date.ts',
          old_string: 'd.toString()',
          new_string: 'd.toISOString()',
        },
        'g3-3',
      ),
      wait(600),
    ]),
    checkpoint('-> the result', [toolResult('g3-3', 'The file has been updated.'), wait(1200)]),
    checkpoint('Bash: vitest run once more', [
      toolUse('Bash', { command: 'pnpm vitest run' }, 'g3-4'),
      wait(900),
    ]),
    checkpoint('-> the test is fixed', [toolResult('g3-4', ' PASS  src/utils/date.test.ts'), wait(300)]),
    checkpoint('The finished answer', [
      ...textReply('The test failed because of toString() instead of the ISO format - fixed it, the tests are green again.'),
      turnResult(9000),
    ]),
  ]),

  /**
   * The thoughts of one piece of a turn pile into one card: the last one stands on the outside, the counter
   * on the right says how many there are in all, and a click opens them all. The calls between them stay
   * one group meanwhile - a thought does not wedge into it.
   */
  scenario('thinking-mixed-in', 'Thoughts between calls - one card', 'grouping', [
    checkpoint('The user asked about index.ts', [
      user('Explain briefly what src/index.ts does'),
      wait(400),
    ]),
    // Streamed in pieces, like a genuine thought - one can see the line grow and get clipped with an
    // ellipsis until the finished thinking block arrives.
    checkpoint('A thought: look at the file (a live stream)', [
      ...thinkReply('I should look at the file itself first, to understand where the application entry point begins at all.'),
      wait(300),
    ]),
    checkpoint('Read: index.ts', [
      toolUse('Read', { file_path: '/Users/you/demo-project/src/index.ts' }, 'g4-1'),
      wait(700),
    ]),
    checkpoint('-> the result', [
      toolResult('g4-1', '1\timport { start } from "./server"\n2\tstart()\n'),
      wait(500),
    ]),
    // A thought AFTER the call has resolved, without text between them, is appended to the same card above
    // rather than starting a new one: on the outside the line changes and a counter appears on the right.
    // Streamed live too: it types right in the card above rather than as a separate line below that would
    // then jump into the card.
    checkpoint('A second thought - it types into the same card', [
      ...thinkReply('The file is very short, that is enough for an answer.'),
      wait(500),
    ]),
    checkpoint('One more call - the group did not break apart', [
      toolUse('Grep', { pattern: 'start' }, 'g4-2'),
      wait(700),
    ]),
    checkpoint('-> the result', [toolResult('g4-2', 'src/server.ts:12:export const start = () => {'), wait(400)]),
    checkpoint('A third thought - the counter reads 3', [
      think('There is indeed only one start, there is nothing more to search for.'),
      wait(500),
    ]),
    checkpoint('The finished answer', [
      ...textReply(
        'src/index.ts simply imports start() from server.ts and calls it at once - that is the application entry point.',
      ),
      turnResult(2600),
    ]),
  ]),

  scenario('text-breaks-group', 'Text between calls - two groups', 'grouping', [
    checkpoint('The user asks to look at two files', [
      user('Look at package.json first, then the README'),
      wait(400),
    ]),
    checkpoint('Read: package.json', [
      toolUse('Read', { file_path: '/Users/you/demo-project/package.json' }, 'g5-1'),
      wait(700),
    ]),
    checkpoint('-> the result', [toolResult('g5-1', '1\t{ "name": "demo-project" }\n'), wait(300)]),
    checkpoint('Text between calls - it breaks the group', [
      ...textReply('Found package.json, now I will glance at the README.'),
      wait(400),
    ]),
    checkpoint('Read: README.md', [
      toolUse('Read', { file_path: '/Users/you/demo-project/README.md' }, 'g5-2'),
      wait(700),
    ]),
    checkpoint('-> the result', [toolResult('g5-2', '1\t# Demo project\n'), wait(300)]),
    checkpoint('The finished answer', [
      ...textReply('And the README holds only the heading "Demo project", nothing else.'),
      turnResult(3400),
    ]),
  ]),
]
