import { checkpoint, scenario, textReply, think, toolResult, toolUse, turnResult, user, wait } from '../events'
import type { Scenario } from '../types'

export const scenariosCombined: Scenario[] = [
  scenario('everything-at-once', 'Всё сразу', 'combined', [
    checkpoint('Пользователь просит разобраться в аналитике и завести план', [
      user('Разберись в модуле аналитики, заведи план работ и почини сломанный тест'),
      wait(500),
    ]),
    checkpoint('Мысль: обзор структуры модуля', [think('Начну с обзора структуры модуля.'), wait(300)]),
    checkpoint('Bash: find lib/analysis', [
      toolUse('Bash', { command: 'find lib/analysis -maxdepth 1 -type f' }, 'e18-1'),
      wait(700),
    ]),
    checkpoint('→ результат', [
      toolResult('e18-1', 'lib/analysis/impression-share.ts\nlib/analysis/elasticity.ts\nlib/analysis/stability.ts'),
      wait(300),
    ]),
    checkpoint('Read: elasticity.ts', [
      toolUse('Read', { file_path: '/Users/you/demo-project/lib/analysis/elasticity.ts' }, 'e18-2'),
      wait(650),
    ]),
    checkpoint('→ результат', [
      toolResult('e18-2', '1\texport const computeElasticity = (a: number, b: number) => a / b\n'),
      wait(250),
    ]),
    checkpoint('Grep: TODO', [toolUse('Grep', { pattern: 'TODO', path: 'lib/analysis' }, 'e18-3'), wait(600)]),
    checkpoint('→ результат', [toolResult('e18-3', 'lib/analysis/stability.ts:41:// TODO: handle NaN'), wait(250)]),
    checkpoint('Bash: vitest run lib/analysis', [
      toolUse('Bash', { command: 'pnpm vitest run lib/analysis' }, 'e18-4'),
      wait(900),
    ]),
    checkpoint('→ тест упал', [
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
    checkpoint('→ результат', [toolResult('e18-5', 'The file has been updated.'), wait(250)]),
    checkpoint('Bash: vitest run ещё раз', [
      toolUse('Bash', { command: 'pnpm vitest run lib/analysis' }, 'e18-6'),
      wait(800),
    ]),
    checkpoint('→ тест починен', [toolResult('e18-6', ' PASS  lib/analysis/stability.test.ts'), wait(400)]),
    checkpoint('Мысль: осталось завести план', [
      think('Тест починен, осталось завести план для остального.'),
      wait(300),
    ]),
    checkpoint('TodoWrite: план работ', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Обзор модуля аналитики', status: 'completed' },
            { content: 'Починить упавший тест stability.ts', status: 'completed' },
            { content: 'Разобрать оставшиеся TODO', status: 'pending' },
          ],
        },
        'e18-todo',
      ),
      wait(500),
    ]),
    checkpoint('→ результат', [toolResult('e18-todo', 'Todos have been modified successfully.'), wait(500)]),
    checkpoint('Готовый ответ', [
      ...textReply('Осмотрел lib/analysis, починил упавший тест на NaN в stability.ts и завёл план на оставшиеся TODO.'),
      turnResult(9200),
    ]),
  ]),
]
