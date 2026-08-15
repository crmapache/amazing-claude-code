import { agent, bash, checkpoint, scenario, shell, SESSION, textReply, toolResult, toolUse, turnResult, user, wait } from '../events'
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
