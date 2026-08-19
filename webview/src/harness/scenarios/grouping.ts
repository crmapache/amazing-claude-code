import { checkpoint, scenario, think, thinkReply, toolResult, toolUse, textReply, turnResult, user, wait } from '../events'
import type { Scenario } from '../types'

export const scenariosGrouping: Scenario[] = [
  scenario('single-tool', 'Одиночный вызов', 'grouping', [
    checkpoint('Пользователь спросил про package.json', [user('Что лежит в package.json?'), wait(400)]),
    checkpoint('Read: package.json', [
      toolUse('Read', { file_path: '/Users/you/demo-project/package.json' }, 'g1-read'),
      wait(900),
    ]),
    checkpoint('→ результат', [
      toolResult('g1-read', '1\t{\n2\t  "name": "demo-project",\n3\t  "version": "1.0.0"\n4\t}\n'),
      wait(300),
    ]),
    checkpoint('Готовый ответ', [
      ...textReply('В package.json лежит обычный манифест: имя пакета demo-project и версия 1.0.0.'),
      turnResult(1800),
    ]),
  ]),

  scenario('tool-burst', 'Пачка вызовов подряд', 'grouping', [
    checkpoint('Пользователь спросил про аутентификацию', [
      user('Разберись, как устроена аутентификация в проекте'),
      wait(400),
    ]),
    checkpoint('Bash: grep authenticate', [
      toolUse('Bash', { command: 'grep -rn "authenticate" src --include=*.ts' }, 'g2-1'),
      wait(700),
    ]),
    checkpoint('→ результат', [
      toolResult('g2-1', 'src/auth/login.ts:12:export const authenticate = async (token: string) => {'),
      wait(250),
    ]),
    checkpoint('Read: login.ts', [
      toolUse('Read', { file_path: '/Users/you/demo-project/src/auth/login.ts' }, 'g2-2'),
      wait(650),
    ]),
    checkpoint('→ результат', [
      toolResult('g2-2', '1\texport const authenticate = async (token: string) => {\n2\t  ...\n3\t}\n'),
      wait(250),
    ]),
    checkpoint('Grep: Session', [toolUse('Grep', { pattern: 'Session', path: 'src/auth' }, 'g2-3'), wait(500)]),
    checkpoint('→ результат', [
      toolResult('g2-3', 'src/auth/session.ts:4:export interface Session {'),
      wait(250),
    ]),
    checkpoint('Read: session.ts', [
      toolUse('Read', { file_path: '/Users/you/demo-project/src/auth/session.ts' }, 'g2-4'),
      wait(600),
    ]),
    checkpoint('→ результат', [
      toolResult('g2-4', '1\texport interface Session {\n2\t  token: string\n3\t}\n'),
      wait(250),
    ]),
    checkpoint('Bash: grep -l Session', [
      toolUse('Bash', { command: 'grep -rln "Session" src --include=*.ts' }, 'g2-5'),
      wait(550),
    ]),
    checkpoint('→ результат', [
      toolResult('g2-5', 'src/auth/session.ts\nsrc/auth/login.ts\nsrc/middleware/guard.ts'),
      wait(250),
    ]),
    checkpoint('Read: guard.ts', [
      toolUse('Read', { file_path: '/Users/you/demo-project/src/middleware/guard.ts' }, 'g2-6'),
      wait(700),
    ]),
    checkpoint('→ результат', [toolResult('g2-6', '1\timport { Session } from "../auth/session"\n'), wait(300)]),
    checkpoint('Готовый ответ', [
      ...textReply(
        'Аутентификация построена вокруг authenticate() в login.ts, который создаёт Session и проверяется в middleware guard.ts.',
      ),
      turnResult(8000),
    ]),
  ]),

  scenario('no-break-across-gap', 'Не рвётся между внутренними шагами', 'grouping', [
    checkpoint('Пользователь просит проверить тесты', [
      user('Проверь тесты и почини, если что-то красное'),
      wait(400),
    ]),
    checkpoint('Bash: vitest run', [toolUse('Bash', { command: 'pnpm vitest run' }, 'g3-1'), wait(900)]),
    checkpoint('→ тест упал', [
      toolResult('g3-1', ' FAIL  src/utils/date.test.ts\n  ✗ formats correctly', true),
      // Пауза побольше — как будто между внутренними шагами хода, без единого
      // текстового блока между вызовами. Группа не должна из-за этого разорваться.
      wait(1200),
    ]),
    checkpoint('Read: date.ts', [
      toolUse('Read', { file_path: '/Users/you/demo-project/src/utils/date.ts' }, 'g3-2'),
      wait(700),
    ]),
    checkpoint('→ результат', [
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
    checkpoint('→ результат', [toolResult('g3-3', 'The file has been updated.'), wait(1200)]),
    checkpoint('Bash: vitest run ещё раз', [
      toolUse('Bash', { command: 'pnpm vitest run' }, 'g3-4'),
      wait(900),
    ]),
    checkpoint('→ тест починен', [toolResult('g3-4', ' PASS  src/utils/date.test.ts'), wait(300)]),
    checkpoint('Готовый ответ', [
      ...textReply('Тест падал из-за toString() вместо ISO-формата — поправил, тесты снова зелёные.'),
      turnResult(9000),
    ]),
  ]),

  /**
   * Мысли одного куска хода копятся в одну карточку: снаружи стоит последняя,
   * счётчик справа говорит, сколько их всего, по клику открываются все. Вызовы
   * между ними при этом остаются одной группой — мысль в неё не вклинивается.
   */
  scenario('thinking-mixed-in', 'Мысли между вызовами — одна карточка', 'grouping', [
    checkpoint('Пользователь спросил про index.ts', [
      user('Кратко объясни, что делает src/index.ts'),
      wait(400),
    ]),
    // Стримится по кусочкам, как настоящая мысль — видно, как строка растёт и
    // обрезается многоточием, пока не придёт готовый блок thinking.
    checkpoint('Мысль: посмотреть файл (живой стрим)', [
      ...thinkReply('Нужно сначала посмотреть на сам файл, чтобы понять, с чего вообще начинается точка входа приложения.'),
      wait(300),
    ]),
    checkpoint('Read: index.ts', [
      toolUse('Read', { file_path: '/Users/you/demo-project/src/index.ts' }, 'g4-1'),
      wait(700),
    ]),
    checkpoint('→ результат', [
      toolResult('g4-1', '1\timport { start } from "./server"\n2\tstart()\n'),
      wait(500),
    ]),
    // Мысль ПОСЛЕ того, как вызов уже разрешился, без текста между ними —
    // дописывается в ту же карточку выше, а не заводит новую: снаружи меняется
    // строка, справа появляется счётчик.
    // Тоже живым стримом: печатается она уже прямо в карточке выше, а не
    // отдельной строкой внизу, которая потом прыгнула бы в карточку.
    checkpoint('Вторая мысль — печатается в ту же карточку', [
      ...thinkReply('Файл совсем короткий, этого достаточно для ответа.'),
      wait(500),
    ]),
    checkpoint('Ещё один вызов — группа не разорвалась', [
      toolUse('Grep', { pattern: 'start' }, 'g4-2'),
      wait(700),
    ]),
    checkpoint('→ результат', [toolResult('g4-2', 'src/server.ts:12:export const start = () => {'), wait(400)]),
    checkpoint('Третья мысль — счётчик 3', [
      think('Начало и правда одно, больше искать нечего.'),
      wait(500),
    ]),
    checkpoint('Готовый ответ', [
      ...textReply(
        'src/index.ts просто импортирует start() из server.ts и сразу его вызывает — это точка входа приложения.',
      ),
      turnResult(2600),
    ]),
  ]),

  scenario('text-breaks-group', 'Текст между вызовами — две группы', 'grouping', [
    checkpoint('Пользователь просит посмотреть два файла', [
      user('Сначала посмотри package.json, потом README'),
      wait(400),
    ]),
    checkpoint('Read: package.json', [
      toolUse('Read', { file_path: '/Users/you/demo-project/package.json' }, 'g5-1'),
      wait(700),
    ]),
    checkpoint('→ результат', [toolResult('g5-1', '1\t{ "name": "demo-project" }\n'), wait(300)]),
    checkpoint('Текст между вызовами — рвёт группу', [
      ...textReply('Нашёл package.json, теперь гляну README.'),
      wait(400),
    ]),
    checkpoint('Read: README.md', [
      toolUse('Read', { file_path: '/Users/you/demo-project/README.md' }, 'g5-2'),
      wait(700),
    ]),
    checkpoint('→ результат', [toolResult('g5-2', '1\t# Demo project\n'), wait(300)]),
    checkpoint('Готовый ответ', [
      ...textReply('А в README только заголовок «Demo project», больше ничего.'),
      turnResult(3400),
    ]),
  ]),
]
