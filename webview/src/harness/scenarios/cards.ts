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
    checkpoint('TodoWrite: список вырос — есть что схлопнуть', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Добавить форму логина', status: 'completed' },
            { content: 'Подключить валидацию', status: 'completed' },
            { content: 'Хранить токен в httpOnly cookie', status: 'in_progress' },
            { content: 'Обновить middleware авторизации', status: 'pending' },
            { content: 'Написать e2e-тест логина', status: 'pending' },
            { content: 'Написать e2e-тест логаута', status: 'pending' },
            { content: 'Обновить документацию по auth', status: 'pending' },
          ],
        },
        'c6-todo-2',
      ),
      wait(500),
    ]),
    checkpoint('→ результат', [toolResult('c6-todo-2', 'Todos have been modified successfully.'), wait(500)]),

    checkpoint('Edit: session.ts — переносит токен в httpOnly cookie', [
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
    checkpoint('→ результат', [toolResult('c6-cookie', 'The file has been updated.'), wait(600)]),
    checkpoint('TodoWrite: cookie готов, дальше — middleware', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Добавить форму логина', status: 'completed' },
            { content: 'Подключить валидацию', status: 'completed' },
            { content: 'Хранить токен в httpOnly cookie', status: 'completed' },
            { content: 'Обновить middleware авторизации', status: 'in_progress' },
            { content: 'Написать e2e-тест логина', status: 'pending' },
            { content: 'Написать e2e-тест логаута', status: 'pending' },
            { content: 'Обновить документацию по auth', status: 'pending' },
          ],
        },
        'c6-todo-3',
      ),
      wait(500),
    ]),
    checkpoint('→ результат', [toolResult('c6-todo-3', 'Todos have been modified successfully.'), wait(500)]),

    checkpoint('Edit: guard.ts — проверяет cookie вместо заголовка', [
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
    checkpoint('→ результат', [toolResult('c6-guard', 'The file has been updated.'), wait(600)]),
    checkpoint('TodoWrite: middleware готов, дальше — e2e-тест логина', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Добавить форму логина', status: 'completed' },
            { content: 'Подключить валидацию', status: 'completed' },
            { content: 'Хранить токен в httpOnly cookie', status: 'completed' },
            { content: 'Обновить middleware авторизации', status: 'completed' },
            { content: 'Написать e2e-тест логина', status: 'in_progress' },
            { content: 'Написать e2e-тест логаута', status: 'pending' },
            { content: 'Обновить документацию по auth', status: 'pending' },
          ],
        },
        'c6-todo-4',
      ),
      wait(500),
    ]),
    checkpoint('→ результат', [toolResult('c6-todo-4', 'Todos have been modified successfully.'), wait(500)]),

    checkpoint('Write: e2e-тест логина', [
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
    checkpoint('→ результат', [
      toolResult('c6-e2e-login', 'File created successfully at: /Users/you/demo-project/e2e/login.e2e.ts'),
      wait(600),
    ]),
    checkpoint('TodoWrite: e2e-логин готов, дальше — e2e-тест логаута', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Добавить форму логина', status: 'completed' },
            { content: 'Подключить валидацию', status: 'completed' },
            { content: 'Хранить токен в httpOnly cookie', status: 'completed' },
            { content: 'Обновить middleware авторизации', status: 'completed' },
            { content: 'Написать e2e-тест логина', status: 'completed' },
            { content: 'Написать e2e-тест логаута', status: 'in_progress' },
            { content: 'Обновить документацию по auth', status: 'pending' },
          ],
        },
        'c6-todo-5',
      ),
      wait(500),
    ]),
    checkpoint('→ результат', [toolResult('c6-todo-5', 'Todos have been modified successfully.'), wait(500)]),

    checkpoint('Write: e2e-тест логаута', [
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
    checkpoint('→ результат', [
      toolResult('c6-e2e-logout', 'File created successfully at: /Users/you/demo-project/e2e/logout.e2e.ts'),
      wait(600),
    ]),
    checkpoint('TodoWrite: e2e-логаут готов, дальше — документация', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Добавить форму логина', status: 'completed' },
            { content: 'Подключить валидацию', status: 'completed' },
            { content: 'Хранить токен в httpOnly cookie', status: 'completed' },
            { content: 'Обновить middleware авторизации', status: 'completed' },
            { content: 'Написать e2e-тест логина', status: 'completed' },
            { content: 'Написать e2e-тест логаута', status: 'completed' },
            { content: 'Обновить документацию по auth', status: 'in_progress' },
          ],
        },
        'c6-todo-6',
      ),
      wait(500),
    ]),
    checkpoint('→ результат', [toolResult('c6-todo-6', 'Todos have been modified successfully.'), wait(500)]),

    checkpoint('Edit: README.md — описывает cookie-сессию', [
      toolUse(
        'Edit',
        {
          file_path: '/Users/you/demo-project/README.md',
          old_string: '## Auth\n\nTODO',
          new_string:
            '## Auth\n\nСессионный токен хранится в httpOnly cookie и проверяется в src/middleware/guard.ts.',
        },
        'c6-docs',
      ),
      wait(650),
    ]),
    checkpoint('→ результат', [toolResult('c6-docs', 'The file has been updated.'), wait(600)]),
    checkpoint('TodoWrite: все семь готовы — список должен исчезнуть', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Добавить форму логина', status: 'completed' },
            { content: 'Подключить валидацию', status: 'completed' },
            { content: 'Хранить токен в httpOnly cookie', status: 'completed' },
            { content: 'Обновить middleware авторизации', status: 'completed' },
            { content: 'Написать e2e-тест логина', status: 'completed' },
            { content: 'Написать e2e-тест логаута', status: 'completed' },
            { content: 'Обновить документацию по auth', status: 'completed' },
          ],
        },
        'c6-todo-7',
      ),
      wait(500),
    ]),
    checkpoint('→ результат', [toolResult('c6-todo-7', 'Todos have been modified successfully.'), wait(500)]),

    checkpoint('Готовый ответ', [
      ...textReply(
        'Фича логина готова целиком: форма, валидация, токен в httpOnly cookie, миддлвар проверяет cookie, оба e2e-теста (логин и логаут) написаны, документация обновлена — семь из семи.',
      ),
      turnResult(26000),
    ]),
  ]),

  // Карточка плана настоящая, клики по обеим кнопкам реальны (шлют настоящий
  // ответ агенту) — но дальше самого клика скрипт эту реакцию бэкенда не отыгрывает.
  // Поэтому обе развилки — «одобрили» и «просят доработать» — отдельные сценарии:
  // выбор одного из них в списке слева и есть тот самый выбор кнопки, только
  // сыгранный целиком и заранее, а не оборванный на полуслове.
  scenario('plan-approve-run', 'План: одобрили — выполняет', 'cards', [
    checkpoint('Пользователь просит спланировать перенос конфига', [
      user('Спланируй, как перенести конфиг в отдельный модуль'),
      wait(500),
    ]),
    checkpoint('ExitPlanMode: план на 3 шага — ждём решения', [
      toolUse(
        'ExitPlanMode',
        {
          plan:
            '## Что делаем\n' +
            '\n' +
            '1. Вынести переменные окружения в `config/env.ts` — **до** правки вызовов\n' +
            '   - сначала собрать все обращения к `process.env`\n' +
            '   - потом заменять их пачкой, а не по одному\n' +
            '2. Заменить прямые обращения к process.env на импорт из config\n' +
            '3. Добавить валидацию обязательных переменных при старте\n' +
            '\n' +
            'Тесты после этого гоняем целиком: перенос трогает старт приложения.',
        },
        'c7-plan',
      ),
      wait(500),
    ]),
    // Ход на этом месте стоит: агент ждёт ответа на сам вызов ExitPlanMode,
    // поэтому итога хода тут и нет. «Approve & run» отвечает ему «план
    // одобрен» — он продолжает тем же ходом, без нового сообщения от
    // пользователя, а оболочка следом переключает разговор в bypass: иначе
    // каждый следующий шаг того же плана снова упирался бы в разрешение.
    // resolvePlan имитирует клик — карточка плана пропадает из ленты.
    checkpoint('Клик «Approve & run» — план выполняется без вопросов', [
      resolvePlan('c7-plan', 'approve'),
      shell({ type: 'mode', sessionId: SESSION, mode: 'bypassPermissions', applied: true }),
      wait(400),
    ]),
    // Одобренный план превращается в список задач — та же панель над полем
    // ввода, что и в сценарии «Список задач», ровно тем же путём.
    checkpoint('TodoWrite: план стал списком задач', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Вынести переменные окружения в config/env.ts', status: 'in_progress' },
            { content: 'Заменить прямые обращения к process.env на импорт из config', status: 'pending' },
            { content: 'Добавить валидацию обязательных переменных при старте', status: 'pending' },
          ],
        },
        'c7-todo',
      ),
      wait(500),
    ]),
    checkpoint('→ результат', [toolResult('c7-todo', 'Todos have been modified successfully.'), wait(500)]),
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
    checkpoint('→ результат', [
      toolResult('c7-env', 'File created successfully at: /Users/you/demo-project/config/env.ts'),
      wait(500),
    ]),
    checkpoint('TodoWrite: шаг 1 готов, дальше — импорт конфига', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Вынести переменные окружения в config/env.ts', status: 'completed' },
            { content: 'Заменить прямые обращения к process.env на импорт из config', status: 'in_progress' },
            { content: 'Добавить валидацию обязательных переменных при старте', status: 'pending' },
          ],
        },
        'c7-todo-2',
      ),
      wait(500),
    ]),
    checkpoint('→ результат', [toolResult('c7-todo-2', 'Todos have been modified successfully.'), wait(500)]),
    checkpoint('Edit: bootstrap.ts — импортирует конфиг', [
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
    checkpoint('→ результат', [toolResult('c7-bootstrap', 'The file has been updated.'), wait(500)]),
    checkpoint('TodoWrite: шаг 2 готов, дальше — валидация', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Вынести переменные окружения в config/env.ts', status: 'completed' },
            { content: 'Заменить прямые обращения к process.env на импорт из config', status: 'completed' },
            { content: 'Добавить валидацию обязательных переменных при старте', status: 'in_progress' },
          ],
        },
        'c7-todo-3',
      ),
      wait(500),
    ]),
    checkpoint('→ результат', [toolResult('c7-todo-3', 'Todos have been modified successfully.'), wait(500)]),
    checkpoint('Edit: env.ts — валидация обязательных переменных', [
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
    checkpoint('→ результат', [toolResult('c7-validate', 'The file has been updated.'), wait(500)]),
    checkpoint('TodoWrite: все три готовы — список должен исчезнуть', [
      toolUse(
        'TodoWrite',
        {
          todos: [
            { content: 'Вынести переменные окружения в config/env.ts', status: 'completed' },
            { content: 'Заменить прямые обращения к process.env на импорт из config', status: 'completed' },
            { content: 'Добавить валидацию обязательных переменных при старте', status: 'completed' },
          ],
        },
        'c7-todo-4',
      ),
      wait(500),
    ]),
    checkpoint('→ результат', [toolResult('c7-todo-4', 'Todos have been modified successfully.'), wait(500)]),
    checkpoint('Готовый ответ', [
      ...textReply(
        'Перенёс переменные окружения в config/env.ts, заменил прямое обращение в bootstrap.ts на импорт из конфига и добавил валидацию обязательных переменных при старте — все три шага плана выполнены.',
      ),
      turnResult(18000),
    ]),
  ]),

  scenario('plan-keep-planning', 'План: просят доработать', 'cards', [
    checkpoint('Пользователь просит спланировать перенос конфига', [
      user('Спланируй, как перенести конфиг в отдельный модуль'),
      wait(500),
    ]),
    checkpoint('ExitPlanMode: план на 3 шага — ждём решения', [
      toolUse(
        'ExitPlanMode',
        {
          plan:
            '## Что делаем\n' +
            '\n' +
            '1. Вынести переменные окружения в `config/env.ts` — **до** правки вызовов\n' +
            '   - сначала собрать все обращения к `process.env`\n' +
            '   - потом заменять их пачкой, а не по одному\n' +
            '2. Заменить прямые обращения к process.env на импорт из config\n' +
            '3. Добавить валидацию обязательных переменных при старте\n' +
            '\n' +
            'Тесты после этого гоняем целиком: перенос трогает старт приложения.',
        },
        'c7b-plan',
      ),
      wait(500),
    ]),
    // «Keep planning» отвечает агенту отказом с объяснением: план не запущен,
    // режим остаётся planning, а сам он продолжает тот же ход обычным текстом,
    // как в живом чате, а не молчит в ожидании нового сообщения. resolvePlan
    // имитирует сам клик — карточка плана пропадает из ленты.
    checkpoint('Клик «Keep planning» — план на доработку, режим прежний', [
      resolvePlan('c7b-plan', 'keepPlanning'),
      wait(400),
    ]),
    checkpoint('Готовый ответ: уточняющий вопрос, без запуска', [
      ...textReply(
        'Хорошо, не запускаю. Уточни: валидацию обязательных переменных делать явным throw при старте, или сразу через готовый парсер вроде zod?',
      ),
      turnResult(1400),
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

  // Шесть вопросов в одном вызове — обычное дело для настройки чего-то
  // многогранного. Проверяет и раскладку сетки на 5 вариантах, и multiSelect
  // чекбоксами, и то, что панель не выталкивает поле ввода за экран, а
  // скроллится сама, оставляя шапку и кнопку отправки на месте.
  scenario('ask-question-multi', 'Вопрос: 6 вопросов сразу', 'cards', [
    checkpoint('Пользователь просит донастроить тёмную тему', [
      user('Донастрой детали тёмной темы'),
      wait(500),
    ]),
    checkpoint('AskUserQuestion: шесть вопросов сразу', [
      toolUse(
        'AskUserQuestion',
        {
          questions: [
            {
              question: 'Какой акцентный цвет использовать?',
              header: 'Акцент',
              multiSelect: false,
              options: [
                { label: 'Фиолетовый', description: 'Как сейчас, --acc-accent' },
                { label: 'Синий', description: 'Классика тёмных тем' },
                { label: 'Бирюзовый', description: 'В цвет ветки/раздела вопросов' },
                { label: 'Оранжевый', description: 'Тёплый, выделяется на тёмном' },
                { label: 'Розовый', description: 'Нестандартно, но читаемо' },
              ],
            },
            {
              question: 'Какие поверхности красить в тёмную тему сразу?',
              header: 'Область',
              multiSelect: true,
              options: [
                { label: 'Лента', description: 'Основной поток сообщений' },
                { label: 'Панель ввода', description: 'Композер и доковые карточки' },
                { label: 'Боковые списки', description: 'Чекпоинты, сценарии' },
              ],
            },
            {
              question: 'Форма элементов?',
              header: 'Форма',
              multiSelect: false,
              options: [
                { label: 'Скруглённая', description: 'Как сейчас, --acc-r-*' },
                { label: 'Прямые углы', description: 'Строже, техничнее' },
              ],
            },
            {
              question: 'Плотность интерфейса?',
              header: 'Плотность',
              multiSelect: false,
              options: [
                { label: 'Компактная', description: 'Как сейчас' },
                { label: 'Просторная', description: 'Больше воздуха между строками' },
              ],
            },
            {
              question: 'Шрифт для кода и команд?',
              header: 'Шрифт',
              multiSelect: false,
              options: [
                { label: 'Системный моно', description: 'Как сейчас, --acc-mono' },
                { label: 'JetBrains Mono', description: 'Чуть шире, с лигатурами' },
              ],
            },
            {
              question: 'Включить анимации переливов и пульса?',
              header: 'Анимации',
              multiSelect: false,
              options: [
                { label: 'Да', description: 'Шиммер статуса, пульс RUNNING' },
                { label: 'Нет', description: 'Статично, для слабых машин' },
              ],
            },
          ],
        },
        'c8b-ask',
      ),
      wait(500),
    ]),
    checkpoint('→ ответ пользователя', [
      toolResult(
        'c8b-ask',
        'Answered: Бирюзовый; Лента, Панель ввода; Скруглённая; Компактная; Системный моно; Да',
      ),
      wait(400),
    ]),
    checkpoint('Готовый ответ', [
      ...textReply(
        'Записал все шесть: бирюзовый акцент, красим ленту и панель ввода, скруглённые углы, компактно, системный моно, анимации оставляем.',
      ),
      turnResult(2200),
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

  // Тот самый вопрос, который приходит и в «Bypass»: опасное удаление CLI не
  // пропускает ни в одном режиме и правилом его не отключить — поэтому под
  // карточкой стоит причина, а «Always allow» здесь нет вовсе.
  scenario('permission-dangerous', 'Разрешение вопреки режиму', 'cards', [
    checkpoint('Пользователь просит вычистить сборку', [
      user('Вычисти каталог сборки перед релизом'),
      wait(500),
    ]),
    checkpoint('Bash: rm со звёздочкой — спрашивают даже в Bypass', [
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

  scenario('subagent-task', 'Вызов субагента', 'cards', [
    checkpoint('Пользователь просит найти чтение переменных окружения', [
      user('Найди все места, где мы читаем переменные окружения'),
      wait(500),
    ]),
    // Про один и тот же запуск CLI сообщает дважды: блоком вызова в ответе
    // агента и системным событием со своим task_id. Здесь оба — чип в шапке
    // обязан остаться один.
    checkpoint('Task: запуск субагента Explore', [
      toolUse('Task', { subagent_type: 'Explore', description: 'Найти чтение переменных окружения' }, 'c10-task'),
      agent({
        type: 'system',
        subtype: 'task_started',
        task_id: 'c10-task-id',
        tool_use_id: 'c10-task',
        subagent_type: 'Explore',
        description: 'Найти чтение переменных окружения',
        task_type: 'local_agent',
      }),
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

  /**
   * Task-инструмент с run_in_background: свой ход агент заканчивает сразу
   * после запуска, не дожидаясь субагента — тот доводит работу до конца уже
   * после того, как streamStatus главного потока замолчал. Без отдельной
   * ветки в streamStatus для «ход кончился, а pending-таск ещё есть» строка
   * статуса пропадала бы насовсем до самого task_notification.
   */
  scenario('subagent-outlives-turn', 'Субагент фоном: ход кончился, а он ещё работает', 'cards', [
    checkpoint('Пользователь просит найти и посчитать TODO по всему репозиторию', [
      user('Найди все TODO по всему репозиторию и посчитай их — это может быть долго, не жди, делай в фоне'),
      wait(500),
    ]),
    checkpoint('Task: запуск фонового субагента', [
      toolUse(
        'Task',
        { subagent_type: 'Explore', description: 'Найти и посчитать TODO', run_in_background: true },
        'c10b-task',
      ),
      agent({
        type: 'system',
        subtype: 'task_started',
        task_id: 'c10b-task-id',
        tool_use_id: 'c10b-task',
        subagent_type: 'Explore',
        description: 'Найти и посчитать TODO',
        task_type: 'local_agent',
      }),
      wait(800),
    ]),
    checkpoint('Свой ход агент заканчивает сразу, не дожидаясь субагента', [
      ...textReply('Запустил поиск TODO фоновым агентом — сообщу, как только будет готово.'),
      turnResult(2200),
    ]),
    checkpoint('Субагент продолжает работать после ответа — статус-строка это показывает', [
      subagentText('c10b-task', 'Прохожу по каталогам src/ и test/…'),
      wait(1500),
    ]),
    checkpoint('→ результат субагента, пришедший уже после ответа', [
      toolResult('c10b-task', 'Нашёл 14 TODO в 9 файлах, больше всего в src/legacy/.'),
      agent({
        type: 'system',
        subtype: 'task_notification',
        task_id: 'c10b-task-id',
        summary: 'Нашёл 14 TODO в 9 файлах.',
      }),
      wait(500),
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

  /**
   * Фоновая команда приходит теми же событиями, что и субагент, но агентом не
   * является: чип в шапке — единственное место, где видно, что процесс ещё жив,
   * а итог дописывается в её же карточку в ленте.
   */
  scenario('background-command', 'Фоновая команда', 'cards', [
    checkpoint('Пользователь просит поднять dev-сервер', [user('Подними dev-сервер'), wait(500)]),
    checkpoint('Bash в фоне: чип в шапке', [
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
    checkpoint('Ответ агента, пока сервер работает', [
      ...textReply('Сервер поднят, слушает http://localhost:5173 — чип в шапке считает, сколько он уже работает.'),
      turnResult(3200),
      wait(3000),
    ]),
    checkpoint('Сервер упал — чип уходит, карточка краснеет', [
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
   * Обычная долгая команда сообщает о себе тем же каналом — и не должна давать
   * ни чипа, ни карточки агента: она вся видна карточкой в ленте.
   */
  scenario('long-command', 'Долгая команда без фона', 'cards', [
    checkpoint('Пользователь просит прогнать типы', [user('Прогони типы'), wait(500)]),
    checkpoint('Bash: долгий typecheck', [
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
    checkpoint('→ результат команды', [
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
    checkpoint('Готовый ответ', [...textReply('Типы чистые.'), turnResult(2600)]),
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
      // Про каждый запуск CLI сообщает и системным событием со своим task_id —
      // тем самым, которым задачу потом просят остановить.
      agent({
        type: 'system',
        subtype: 'task_started',
        task_id: 'c12-a-id',
        tool_use_id: 'c12-a',
        subagent_type: 'react-architecture',
        description: 'Ревью фронта',
        task_type: 'local_agent',
      }),
      agent({
        type: 'system',
        subtype: 'task_started',
        task_id: 'c12-b-id',
        tool_use_id: 'c12-b',
        subagent_type: 'nest-architecture',
        description: 'Ревью бэка',
        task_type: 'local_agent',
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
    checkpoint('Следующее сообщение — завершённая пачка пропадает из дропдауна', [
      user('Отлично, теперь обнови README с находками'),
      wait(400),
    ]),
  ]),

  // Заканчивается на пермишене намеренно, как и permission-waiting: решение
  // принимает настоящая кнопка настоящего интерфейса, а не сценарий.
  scenario('multiple-agents-permission', 'Несколько агентов: один ждёт разрешения', 'cards', [
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
              id: 'c13-a',
              name: 'Task',
              input: { subagent_type: 'react-architecture', description: 'Ревью фронта' },
            },
            {
              type: 'tool_use',
              id: 'c13-b',
              name: 'Task',
              input: { subagent_type: 'nest-architecture', description: 'Ревью бэка' },
            },
          ],
        },
      }),
      wait(1500),
    ]),
    checkpoint('Агент фронта: смотрит компоненты', [subagentText('c13-a', 'Смотрю компоненты…'), wait(1200)]),
    checkpoint('Агент бэка: хочет прогнать тесты — ждёт разрешения', [
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
]
