import { checkpoint, scenario, textReply, think, toolResult, toolUse, turnResult, user, wait } from '../events'
import type { Scenario } from '../types'

export const scenariosCombined: Scenario[] = [
  scenario('everything-at-once', 'Everything at once', 'combined', [
    checkpoint('The user asks to work through the analytics and draw up a plan', [
      user('Work through the analytics module, draw up a plan of work and fix the broken test'),
      wait(500),
    ]),
    checkpoint('A thought: a survey of the module structure', [think('I will start with a survey of the module structure.'), wait(300)]),
    checkpoint('Bash: find lib/analysis', [
      toolUse('Bash', { command: 'find lib/analysis -maxdepth 1 -type f' }, 'e18-1'),
      wait(700),
    ]),
    checkpoint('-> the result', [
      toolResult('e18-1', 'lib/analysis/impression-share.ts\nlib/analysis/elasticity.ts\nlib/analysis/stability.ts'),
      wait(300),
    ]),
    checkpoint('Read: elasticity.ts', [
      toolUse('Read', { file_path: '/Users/you/demo-project/lib/analysis/elasticity.ts' }, 'e18-2'),
      wait(650),
    ]),
    checkpoint('-> the result', [
      toolResult('e18-2', '1\texport const computeElasticity = (a: number, b: number) => a / b\n'),
      wait(250),
    ]),
    checkpoint('Grep: TODO', [toolUse('Grep', { pattern: 'TODO', path: 'lib/analysis' }, 'e18-3'), wait(600)]),
    checkpoint('-> the result', [toolResult('e18-3', 'lib/analysis/stability.ts:41:// TODO: handle NaN'), wait(250)]),
    checkpoint('Bash: vitest run lib/analysis', [
      toolUse('Bash', { command: 'pnpm vitest run lib/analysis' }, 'e18-4'),
      wait(900),
    ]),
    checkpoint('-> the test failed', [
      toolResult('e18-4', ' FAIL  lib/analysis/stability.test.ts\n  ✗ handles empty input', true),
      wait(1100),
    ]),
    checkpoint('Edit: stability.ts', [
      toolUse(
        'Edit',
        {
          file_path: '/Users/you/demo-project/lib/analysis/stability.ts',
          old_string: '// TODO: handle NaN',
          new_string: 'if (Number.isNaN(value)) return 0',
        },
        'e18-5',
      ),
      wait(600),
    ]),
    checkpoint('-> the result', [toolResult('e18-5', 'The file has been updated.'), wait(250)]),
    checkpoint('Bash: vitest run once more', [
      toolUse('Bash', { command: 'pnpm vitest run lib/analysis' }, 'e18-6'),
      wait(800),
    ]),
    checkpoint('-> the test is fixed', [toolResult('e18-6', ' PASS  lib/analysis/stability.test.ts'), wait(400)]),
    checkpoint('A thought: a plan is still to be drawn up', [
      think('The test is fixed, a plan for the rest is still to be drawn up.'),
      wait(300),
    ]),
    checkpoint('TodoWrite: the plan of work', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Survey the analytics module', status: 'completed' },
            { content: 'Fix the failing stability.ts test', status: 'completed' },
            { content: 'Work through the remaining TODOs', status: 'pending' },
          ],
        },
        'e18-todo',
      ),
      wait(500),
    ]),
    checkpoint('-> the result', [toolResult('e18-todo', 'Todos have been modified successfully.'), wait(500)]),
    checkpoint('The finished answer', [
      ...textReply('Looked over lib/analysis, fixed the failing NaN test in stability.ts and drew up a plan for the remaining TODOs.'),
      turnResult(9200),
    ]),
  ]),
]
