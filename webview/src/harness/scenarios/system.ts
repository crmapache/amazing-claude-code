import { agent, apiRetry, bash, checkpoint, replayed, scenario, shell, SESSION, textReply, toolResult, toolUse, turnResult, user, wait } from '../events'
import type { Scenario } from '../types'

export const scenariosSystem: Scenario[] = [
  scenario('session-crash', 'Обрыв сессии', 'system', [
    checkpoint('Пользователь просит прогнать тесты', [user('Прогони полный набор тестов'), wait(500)]),
    checkpoint('Bash: pnpm test', [toolUse('Bash', { command: 'pnpm test' }, 's13-1'), wait(900)]),
    checkpoint('→ результат', [toolResult('s13-1', 'Запускаю сюиту…'), wait(700)]),
    checkpoint('Bash: vitest --coverage — зависает', [
      toolUse('Bash', { command: 'pnpm vitest run --coverage' }, 's13-2'),
      wait(1500),
    ]),
    checkpoint('Обрыв сессии', [shell({ type: 'processExited', sessionId: SESSION, exitCode: 1 })]),
  ]),

  scenario('context-compaction', 'Сжатие контекста', 'system', [
    checkpoint('Пользователь продолжает рефакторинг', [user('Продолжаем большой рефакторинг'), wait(500)]),
    // Реальный CLI сперва шлёт отдельный статус "compacting" — задолго до итога с
    // цифрами. Без этого шага в ленте нет никакого следа того, что сжатие вообще
    // происходит: карточка CONTEXT появляется здесь же, в pending-состоянии.
    // Пауза долгая нарочно: сжатие в жизни занимает десятки секунд, и процент
    // на карточке считается от секундомера. За полторы секунды он не сдвинулся
    // бы вовсе, и смотреть на этом шаге было бы не на что.
    checkpoint('Идёт сжатие контекста', [
      agent({ type: 'system', subtype: 'status', status: 'compacting' }),
      wait(6000),
    ]),
    checkpoint('Контекст сжат', [
      agent({
        type: 'system',
        subtype: 'compact_boundary',
        compact_metadata: { trigger: 'automatic', pre_tokens: 168000, post_tokens: 41000, duration_ms: 3200 },
      }),
      agent({ type: 'system', subtype: 'status', compact_result: 'completed' }),
      wait(800),
    ]),
    checkpoint('Готовый ответ', [
      ...textReply('Контекст сжался, но я помню суть рефакторинга — продолжаем.'),
      turnResult(2200),
    ]),
  ]),

  scenario('error-turn', 'Ошибка хода', 'system', [
    checkpoint('Пользователь просит задеплоить прод', [user('Задеплой прод'), wait(500)]),
    checkpoint('Bash: deploy:prod', [toolUse('Bash', { command: 'pnpm run deploy:prod' }, 's15-1'), wait(1200)]),
    checkpoint('→ ошибка деплоя', [toolResult('s15-1', 'Error: DEPLOY_TOKEN is not set', true), wait(400)]),
    checkpoint('Ход завершился ошибкой', [
      agent({
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        result: 'Деплой упал: не задан DEPLOY_TOKEN.',
        duration_ms: 2600,
      }),
    ]),
  ]),

  /**
   * Сорвавшийся запрос CLI говорит дважды: сперва репликой агента в потоке,
   * следом той же строкой в своём stderr. Смысл сценария — второй чекпоинт: в
   * ленте остаётся одна красная плашка вместо пары одинаковых абзацев подряд, и
   * адрес в ней живой — по нему и идут смотреть, что со сторонним сервисом.
   */
  scenario('error-echo', 'Ошибка приходит дважды', 'system', [
    checkpoint('Агент отвечает текстом ошибки', [
      ...textReply('API Error: 500 Internal server error. This is a server-side issue, usually temporary — try again in a moment. If it persists, check https://status.claude.com.'),
      wait(600),
    ]),
    checkpoint('Та же строка приходит от процесса', [
      shell({
        type: 'error',
        sessionId: SESSION,
        message:
          'API Error: 500 Internal server error. This is a server-side issue, usually temporary — try again in a moment. If it persists, check https://status.claude.com.',
      }),
      turnResult(4300),
    ]),
  ]),

  /**
   * Серверы Anthropic перегружены, и CLI пережидает отказ, чтобы повторить
   * запрос. Смысл сценария — первые два чекпоинта: до них панель на таком месте
   * молчала совсем, показывая «Claude is thinking» с бегущим счётчиком, хотя
   * запрос вообще не доходил до модели и разговор просто стоял.
   *
   * Паузы настоящие: попытки идут с нарастающим ожиданием, как в жизни, и
   * обратный отсчёт до следующей видно живьём.
   */
  scenario('api-retry', 'Перегрузка API', 'system', [
    checkpoint('Пользователь просит закоммитить', [user('Закоммить и запушь'), wait(600)]),
    checkpoint('Сервер перегружен, идут повторы', [
      apiRetry(1, 600),
      wait(600),
      apiRetry(2, 1200),
      wait(1200),
      apiRetry(3, 2500),
      wait(2500),
      apiRetry(4, 5000),
      wait(5000),
    ]),
    checkpoint('Запрос прошёл, агент отвечает', [
      ...textReply('Сервер отпустило — коммичу и пушу.'),
      toolUse('Bash', { command: 'git commit -am "fix: close out stalled turns" && git push' }, 's16-1'),
      wait(900),
      toolResult('s16-1', 'main -> main'),
      turnResult(11800),
    ]),
  ]),

  /**
   * Тот же отказ, но попытки кончились. CLI закрывает такой ход не ответом
   * модели, а своей заглушкой с текстом ошибки — по ней карточка повторов и
   * понимает, что дело кончилось сдачей, а не удачей.
   */
  scenario('api-retry-exhausted', 'Перегрузка API: попытки кончились', 'system', [
    checkpoint('Пользователь просит разобраться в логе', [user('Разберись, почему падает сборка'), wait(500)]),
    checkpoint('Повторы не помогают', [
      apiRetry(1, 600),
      wait(600),
      apiRetry(2, 1500),
      wait(1500),
      apiRetry(3, 4000),
      wait(4000),
    ]),
    checkpoint('CLI сдаётся', [
      agent({
        type: 'assistant',
        message: {
          model: '<synthetic>',
          content: [
            {
              type: 'text',
              text: 'API Error: 529 Overloaded. This is a server-side issue, usually temporary — try again in a moment.',
            },
          ],
        },
      }),
      agent({
        type: 'result',
        subtype: 'success',
        is_error: true,
        result: 'API Error: 529 Overloaded. This is a server-side issue, usually temporary — try again in a moment.',
        duration_ms: 9200,
      }),
    ]),
  ]),

  scenario('clear-conversation', '/clear стирает разговор', 'system', [
    checkpoint('Пользователь спрашивает про историю', [user('Расскажи, что мы уже обсудили'), wait(500)]),
    checkpoint('Готовый ответ', [
      ...textReply('Пока это первая реплика в разговоре — обсуждать особо нечего.'),
      turnResult(1200),
      wait(600),
    ]),
    checkpoint('Пользователь пишет /clear', [user('/clear'), wait(400)]),
    checkpoint('Разговор стёрт', [agent({ type: 'conversation_reset', new_conversation_id: 'demo-cleared' }), wait(300)]),
    // /clear закрывает ход тем же способом, что и настоящий CLI: без вызова модели,
    // плейсхолдером «(no content)» + result — иначе status/Stop-кнопка зависают
    // навсегда, и не проверяется suppressNextMeta, ради которого этот сценарий и нужен.
    checkpoint('Ход /clear завершается', [
      agent({ type: 'assistant', message: { content: [{ type: 'text', text: '(no content)' }] } }),
      turnResult(300),
    ]),
  ]),

  scenario('bash-mode', 'Команда через !', 'system', [
    checkpoint('Смотрит статус сам, без агента', [
      bash('git status -sb', '## main...origin/main\n M webview/src/App.tsx\n?? webview/src/feed/bash.ts'),
      wait(600),
    ]),
    checkpoint('Команда упала', [
      bash('pnpm typecheck', 'src/App.tsx(42,7): error TS2322: Type "string" is not assignable to type "number".', {
        exitCode: 2,
        stderr: 'ELIFECYCLE  Command failed with exit code 2.',
      }),
      wait(600),
    ]),
    checkpoint('Спрашивает агента — вывод уезжает вместе с вопросом', [
      user('Почини эту ошибку'),
      wait(600),
    ]),
    checkpoint('Готовый ответ', [
      ...textReply('Вижу — в App.tsx строка попала туда, где ждут число. Правлю.'),
      turnResult(1800),
    ]),
  ]),

  /**
   * Вкладка, открытая из истории: панель проигрывает сохранённый разговор, а
   * потом объявляет перепись законченной. Смысл сценария — второй чекпоинт: до
   * него фоновый субагент выглядит работающим (чип в шапке, счётчик, «Waiting
   * for subagent» под лентой), хотя работать в этой вкладке нечему. Его итог
   * приезжает системным событием, а в переписке лежат одни реплики, так что
   * закрыть карточку может только конец переписи.
   */
  scenario('resumed-conversation', 'Разговор из истории', 'system', [
    checkpoint('Перепись прошлого разговора', [
      ...replayed([
        // Реплика человека приходит записью из переписки: класть её в ленту при
        // отправке, как в живом разговоре, здесь было некому.
        agent({
          type: 'user',
          message: { content: [{ type: 'text', text: 'Посмотри свежим взглядом на панель настроек' }] },
          timestamp: '2026-08-17T09:41:07.000Z',
        }),
        wait(300),
        toolUse('Agent', { subagent_type: 'Explore', description: 'Review plan: UI consistency' }, 'r-1'),
        wait(300),
        toolResult('r-1', 'Async agent launched successfully. Agent ID: a90aa'),
        wait(300),
        ...textReply('Запустил разбор в фоне — вернусь с находками.'),
        turnResult(4200),
      ]),
    ]),
    /**
     * Тот же прошлый разговор дальше: агент спрашивал человека вариантами, тот
     * ответил, и ответ лежит в переписке обычной репликой. Карточка вопроса
     * поверх поля ввода тут появляться не должна вовсе — на этот вопрос ответили
     * когда-то в прошлом (см. AskItem.historic).
     */
    checkpoint('В переписи был вопрос с вариантами — и ответ на него', [
      ...replayed([
        toolUse(
          'AskUserQuestion',
          {
            questions: [
              {
                question: 'Оставить прежний порядок разделов в настройках?',
                header: 'Порядок',
                multiSelect: false,
                options: [
                  { label: 'Оставить', description: 'Ничего не двигаем, правим только вид' },
                  { label: 'Пересобрать', description: 'Сгруппировать по смыслу заново' },
                ],
              },
            ],
          },
          'r-ask',
        ),
        wait(300),
        agent({
          type: 'user',
          message: {
            content: [
              {
                type: 'text',
                text: 'Оставить прежний порядок разделов в настройках?\nОставить',
              },
            ],
          },
          timestamp: '2026-08-17T09:44:12.000Z',
        }),
        wait(300),
        ...textReply('Хорошо, порядок не трогаю — правлю только вид.'),
        turnResult(2600),
      ]),
    ]),
    checkpoint('Перепись доиграна', [shell({ type: 'replayFinished', sessionId: SESSION })]),
  ]),

  scenario('rich-markdown', 'Ответ с markdown', 'system', [
    checkpoint('Пользователь просит пример хука useDebounce', [
      user('Покажи пример хука useDebounce'),
      wait(600),
    ]),
    checkpoint('Готовый ответ с кодом и списком', [
      ...textReply(
        [
          'Вот простой вариант:',
          '',
          '```ts',
          'function useDebounce<T>(value: T, delay: number): T {',
          '  const [debounced, setDebounced] = useState(value)',
          '',
          '  useEffect(() => {',
          '    const id = setTimeout(() => setDebounced(value), delay)',
          '    return () => clearTimeout(id)',
          '  }, [value, delay])',
          '',
          '  return debounced',
          '}',
          '```',
          '',
          'Коротко о том, что здесь происходит:',
          '- на каждое изменение `value` таймер стартует заново',
          '- значение обновляется только когда пользователь перестал печатать',
          '- `delay` можно подкрутить под конкретное поле',
        ].join('\n'),
      ),
      turnResult(2400),
    ]),
  ]),
]
