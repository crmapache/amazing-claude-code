import {
  agent,
  bootstrap,
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

export const scenariosCards: Scenario[] = [
  scenario('todo-list', 'Список задач', 'cards', [
    ...bootstrap,
    user('Разбей работу над фичей логина на шаги и начни'),
    wait(400),
    agent({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'c6-todo',
            name: 'TodoWrite',
            input: {
              todos: [
                { content: 'Добавить форму логина', status: 'completed' },
                { content: 'Подключить валидацию', status: 'in_progress' },
                { content: 'Написать e2e-тест', status: 'pending' },
              ],
            },
          },
        ],
      },
    }),
    wait(500),
    toolResult('c6-todo', 'Todos have been modified successfully.'),
    wait(500),
    ...textReply('Завёл три шага, форма логина уже готова, дальше валидация.'),
    turnResult(1900),
  ]),

  scenario('plan-approval', 'План на согласование', 'cards', [
    ...bootstrap,
    user('Спланируй, как перенести конфиг в отдельный модуль'),
    wait(500),
    agent({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'c7-plan',
            name: 'ExitPlanMode',
            input: {
              plan:
                '1. Вынести переменные окружения в `config/env.ts`\n' +
                '2. Заменить прямые обращения к process.env на импорт из config\n' +
                '3. Добавить валидацию обязательных переменных при старте',
            },
          },
        ],
      },
    }),
    wait(500),
    turnResult(2200),
  ]),

  scenario('ask-question', 'Вопрос с вариантами', 'cards', [
    ...bootstrap,
    user('Хочу добавить тёмную тему'),
    wait(500),
    agent({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'c8-ask',
            name: 'AskUserQuestion',
            input: {
              questions: [
                {
                  question: 'Как выбираем тему по умолчанию?',
                  header: 'Тема',
                  multiSelect: false,
                  options: [
                    { label: 'По системной настройке', description: 'Смотрим prefers-color-scheme' },
                    { label: 'Всегда светлая', description: 'Игнорируем системную настройку' },
                  ],
                },
              ],
            },
          },
        ],
      },
    }),
    wait(500),
    toolResult('c8-ask', 'Answered: По системной настройке'),
    wait(400),
    ...textReply('Понял, беру системную настройку как источник темы по умолчанию.'),
    turnResult(1600),
  ]),

  scenario('permission-waiting', 'Ожидание разрешения', 'cards', [
    ...bootstrap,
    user('Удали неиспользуемый файл src/legacy/old-auth.ts'),
    wait(500),
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

  scenario('subagent-task', 'Вызов субагента', 'cards', [
    ...bootstrap,
    user('Найди все места, где мы читаем переменные окружения'),
    wait(500),
    agent({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'c10-task',
            name: 'Task',
            input: { subagent_type: 'Explore', description: 'Найти чтение переменных окружения' },
          },
        ],
      },
    }),
    wait(1200),
    subagentText('c10-task', 'Смотрю src/config и src/server…'),
    wait(1500),
    toolResult('c10-task', 'process.env читается в src/config/env.ts (5 мест) и src/server/bootstrap.ts (1 место).'),
    wait(500),
    ...textReply('Субагент нашёл шесть мест — почти все они уже в config/env.ts, одно затесалось в bootstrap.ts.'),
    turnResult(4800),
  ]),

  scenario('background-subagent', 'Фоновый субагент от скилла', 'cards', [
    ...bootstrap,
    user('/code-review'),
    wait(500),
    agent({ type: 'system', subtype: 'task_started', task_id: 'c11-bg', subagent_type: 'code-reviewer', description: 'Ревью изменений в PR' }),
    wait(1200),
    agent({ type: 'system', subtype: 'task_progress', task_id: 'c11-bg', description: 'Ревью изменений в PR', last_tool_name: 'Read' }),
    wait(1200),
    agent({ type: 'system', subtype: 'task_progress', task_id: 'c11-bg', description: 'Ревью изменений в PR', last_tool_name: 'Grep' }),
    wait(1500),
    agent({
      type: 'system',
      subtype: 'task_notification',
      task_id: 'c11-bg',
      summary: 'Нашёл 2 замечания: неиспользуемый импорт и отсутствующую проверку null.',
    }),
    wait(500),
    ...textReply('Ревью фонового субагента готово — два небольших замечания, посмотри карточку выше.'),
    turnResult(4400),
  ]),

  scenario('multiple-agents', 'Несколько агентов параллельно', 'cards', [
    ...bootstrap,
    user('Запусти ревью фронта и бэка параллельно'),
    wait(500),
    agent({
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 'c12-a', name: 'Task', input: { subagent_type: 'react-architecture', description: 'Ревью фронта' } },
          { type: 'tool_use', id: 'c12-b', name: 'Task', input: { subagent_type: 'nest-architecture', description: 'Ревью бэка' } },
        ],
      },
    }),
    wait(1500),
    subagentText('c12-a', 'Смотрю компоненты…'),
    wait(1200),
    subagentText('c12-b', 'Смотрю контроллеры…'),
    wait(1800),
    toolResult('c12-a', 'Фронт в порядке, пара мелких находок.'),
    wait(1200),
    toolResult('c12-b', 'Бэк тоже чист, замечаний нет.'),
    wait(500),
    ...textReply('Оба ревью закончились — по фронту пара мелочей, бэк чист.'),
    turnResult(6200),
  ]),
]
