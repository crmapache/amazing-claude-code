import {
  agent,
  checkpoint,
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
    checkpoint('Пользователь просит разбить работу на шаги', [
      user('Разбей работу над фичей логина на шаги и начни'),
      wait(400),
    ]),
    checkpoint('TodoWrite: список задач', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Добавить форму логина', status: 'completed' },
            { content: 'Подключить валидацию', status: 'in_progress' },
            { content: 'Написать e2e-тест', status: 'pending' },
          ],
        },
        'c6-todo',
      ),
      wait(500),
    ]),
    checkpoint('→ результат', [toolResult('c6-todo', 'Todos have been modified successfully.'), wait(500)]),
    checkpoint('Готовый ответ', [
      ...textReply('Завёл три шага, форма логина уже готова, дальше валидация.'),
      turnResult(1900),
    ]),
  ]),

  // Заканчивается здесь намеренно: плеер доигрывает до конца, но дальше ничего
  // не запланировано - кнопка «одобрить» на карточке плана настоящая, клик по
  // ней не продолжает сценарий.
  scenario('plan-approval', 'План на согласование', 'cards', [
    checkpoint('Пользователь просит спланировать перенос конфига', [
      user('Спланируй, как перенести конфиг в отдельный модуль'),
      wait(500),
    ]),
    checkpoint('ExitPlanMode: план на 3 шага — ждём решения', [
      toolUse(
        'ExitPlanMode',
        {
          plan:
            '1. Вынести переменные окружения в `config/env.ts`\n' +
            '2. Заменить прямые обращения к process.env на импорт из config\n' +
            '3. Добавить валидацию обязательных переменных при старте',
        },
        'c7-plan',
      ),
      wait(500),
      turnResult(2200),
    ]),
  ]),

  scenario('ask-question', 'Вопрос с вариантами', 'cards', [
    checkpoint('Пользователь хочет добавить тёмную тему', [user('Хочу добавить тёмную тему'), wait(500)]),
    checkpoint('AskUserQuestion: как выбрать тему по умолчанию', [
      toolUse(
        'AskUserQuestion',
        {
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
        'c8-ask',
      ),
      wait(500),
    ]),
    checkpoint('→ ответ пользователя', [
      toolResult('c8-ask', 'Answered: По системной настройке'),
      wait(400),
    ]),
    checkpoint('Готовый ответ', [
      ...textReply('Понял, беру системную настройку как источник темы по умолчанию.'),
      turnResult(1600),
    ]),
  ]),

  // Заканчивается здесь намеренно: дальше сценарий не продолжается, панель не
  // поедет дальше после твоего клика на карточке разрешения - это настоящая
  // кнопка настоящего интерфейса, а не часть скрипта.
  scenario('permission-waiting', 'Ожидание разрешения', 'cards', [
    checkpoint('Пользователь просит удалить файл', [
      user('Удали неиспользуемый файл src/legacy/old-auth.ts'),
      wait(500),
    ]),
    checkpoint('Bash: rm — ждём разрешения', [
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

  scenario('subagent-task', 'Вызов субагента', 'cards', [
    checkpoint('Пользователь просит найти чтение переменных окружения', [
      user('Найди все места, где мы читаем переменные окружения'),
      wait(500),
    ]),
    checkpoint('Task: запуск субагента Explore', [
      toolUse('Task', { subagent_type: 'Explore', description: 'Найти чтение переменных окружения' }, 'c10-task'),
      wait(1200),
    ]),
    checkpoint('Субагент: смотрит config и server', [
      subagentText('c10-task', 'Смотрю src/config и src/server…'),
      wait(1500),
    ]),
    checkpoint('→ результат субагента', [
      toolResult('c10-task', 'process.env читается в src/config/env.ts (5 мест) и src/server/bootstrap.ts (1 место).'),
      wait(500),
    ]),
    checkpoint('Готовый ответ', [
      ...textReply('Субагент нашёл шесть мест — почти все они уже в config/env.ts, одно затесалось в bootstrap.ts.'),
      turnResult(4800),
    ]),
  ]),

  scenario('background-subagent', 'Фоновый субагент от скилла', 'cards', [
    checkpoint('Пользователь запускает /code-review', [user('/code-review'), wait(500)]),
    checkpoint('Фоновый субагент стартовал', [
      agent({
        type: 'system',
        subtype: 'task_started',
        task_id: 'c11-bg',
        subagent_type: 'code-reviewer',
        description: 'Ревью изменений в PR',
      }),
      wait(1200),
    ]),
    checkpoint('Прогресс: читает файлы', [
      agent({
        type: 'system',
        subtype: 'task_progress',
        task_id: 'c11-bg',
        description: 'Ревью изменений в PR',
        last_tool_name: 'Read',
      }),
      wait(1200),
    ]),
    checkpoint('Прогресс: ищет по коду', [
      agent({
        type: 'system',
        subtype: 'task_progress',
        task_id: 'c11-bg',
        description: 'Ревью изменений в PR',
        last_tool_name: 'Grep',
      }),
      wait(1500),
    ]),
    checkpoint('→ итог ревью', [
      agent({
        type: 'system',
        subtype: 'task_notification',
        task_id: 'c11-bg',
        summary: 'Нашёл 2 замечания: неиспользуемый импорт и отсутствующую проверку null.',
      }),
      wait(500),
    ]),
    checkpoint('Готовый ответ', [
      ...textReply('Ревью фонового субагента готово — два небольших замечания, посмотри карточку выше.'),
      turnResult(6500),
    ]),
  ]),

  scenario('multiple-agents', 'Несколько агентов параллельно', 'cards', [
    checkpoint('Пользователь просит параллельное ревью', [
      user('Запусти ревью фронта и бэка параллельно'),
      wait(500),
    ]),
    checkpoint('Task ×2: фронт и бэк одновременно', [
      agent({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'c12-a',
              name: 'Task',
              input: { subagent_type: 'react-architecture', description: 'Ревью фронта' },
            },
            {
              type: 'tool_use',
              id: 'c12-b',
              name: 'Task',
              input: { subagent_type: 'nest-architecture', description: 'Ревью бэка' },
            },
          ],
        },
      }),
      wait(1500),
    ]),
    checkpoint('Агент фронта: смотрит компоненты', [subagentText('c12-a', 'Смотрю компоненты…'), wait(1200)]),
    checkpoint('Агент бэка: смотрит контроллеры', [subagentText('c12-b', 'Смотрю контроллеры…'), wait(1800)]),
    checkpoint('→ результат фронта', [toolResult('c12-a', 'Фронт в порядке, пара мелких находок.'), wait(1200)]),
    checkpoint('→ результат бэка', [toolResult('c12-b', 'Бэк тоже чист, замечаний нет.'), wait(500)]),
    checkpoint('Готовый ответ', [
      ...textReply('Оба ревью закончились — по фронту пара мелочей, бэк чист.'),
      turnResult(8500),
    ]),
  ]),
]
