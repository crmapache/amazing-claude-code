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

  scenario('thinking-mixed-in', 'Мысль между вызовами — своя карточка', 'grouping', [
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
    // Мысль ПОСЛЕ того, как единственный вызов уже разрешился, без текста между
    // ними — своя карточка, соседнюю группу инструментов не трогает и не
    // переоткрывает (в группировку мысль вообще не заходит).
    checkpoint('Мысль после результата — не трогает соседнюю группу', [
      think('Файл совсем короткий, этого достаточно для ответа.'),
      wait(400),
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

  /**
   * Смотреть надо на строку под лентой: она называет то, что происходит прямо
   * сейчас, и на каждом шаге заменяется целиком — «Running the type checker» →
   * «Reading build.ts» → «Reading 3 files» → пункт списка задач в паузе между
   * вызовами.
   */
  scenario('activity-line', 'Строка про текущее дело', 'grouping', [
    checkpoint('Пользователь просит починить сборку', [user('Разберись, почему не собирается вебвью'), wait(400)]),
    checkpoint('Список задач: первый пункт в работе', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Найти ошибку типов', activeForm: 'Looking for the type error', status: 'in_progress' },
            { content: 'Починить её', activeForm: 'Fixing the type error', status: 'pending' },
          ],
        },
        'g6-todo',
      ),
      wait(700),
    ]),
    checkpoint('Bash: своё описание вместо команды', [
      toolUse('Bash', { command: 'pnpm tsc --noEmit', description: 'Run the type checker' }, 'g6-1'),
      wait(1600),
    ]),
    checkpoint('→ результат', [
      toolResult(
        'g6-1',
        "src/feed/build.ts(212,3): error TS2322: Type 'string' is not assignable to type 'number'.",
        true,
      ),
      wait(600),
    ]),
    checkpoint('Read: один файл', [
      toolUse('Read', { file_path: '/Users/you/demo-project/src/feed/build.ts' }, 'g6-2'),
      wait(900),
    ]),
    checkpoint('→ результат', [toolResult('g6-2', '210\t  const seq: number = state.seq\n'), wait(700)]),
    checkpoint('Три чтения разом — пачка называется числом', [
      toolUse('Read', { file_path: '/Users/you/demo-project/src/feed/types.ts' }, 'g6-3'),
      toolUse('Read', { file_path: '/Users/you/demo-project/src/feed/tools.ts' }, 'g6-4'),
      toolUse('Read', { file_path: '/Users/you/demo-project/src/App.tsx' }, 'g6-5'),
      wait(1500),
    ]),
    checkpoint('→ результаты', [
      toolResult('g6-3', '1\texport interface PanelState {\n'),
      toolResult('g6-4', '1\texport const chipFor = (name: string) => {\n'),
      toolResult('g6-5', '1\timport { Feed } from "./components/Feed"\n'),
      wait(900),
    ]),
    checkpoint('Список задач: второй пункт в работе', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Найти ошибку типов', activeForm: 'Looking for the type error', status: 'completed' },
            { content: 'Починить её', activeForm: 'Fixing the type error', status: 'in_progress' },
          ],
        },
        'g6-todo-2',
      ),
      wait(1200),
    ]),
    checkpoint('Edit: правка', [
      toolUse(
        'Edit',
        {
          file_path: '/Users/you/demo-project/src/feed/build.ts',
          old_string: 'const seq: number = state.seq',
          new_string: 'const seq: number = Number(state.seq)',
        },
        'g6-6',
      ),
      wait(800),
    ]),
    checkpoint('→ результат', [toolResult('g6-6', 'The file has been updated.'), wait(500)]),
    checkpoint('Готовый ответ', [
      ...textReply('Ошибка была в build.ts: в seq клали строку. Поправил, сборка проходит.'),
      turnResult(9800),
    ]),
  ]),
]
