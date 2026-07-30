import { agent, bootstrap, scenario, shell, SESSION, textReply, toolResult, toolUse, turnResult, user, wait } from '../events'
import type { Scenario } from '../types'

export const scenariosSystem: Scenario[] = [
  scenario('session-crash', 'Обрыв сессии', 'system', [
    ...bootstrap,
    user('Прогони полный набор тестов'),
    wait(500),
    toolUse('Bash', { command: 'pnpm test' }, 's13-1'),
    wait(900),
    toolResult('s13-1', 'Запускаю сюиту…'),
    wait(700),
    toolUse('Bash', { command: 'pnpm vitest run --coverage' }, 's13-2'),
    wait(1500),
    shell({ type: 'processExited', sessionId: SESSION, exitCode: 1 }),
  ]),

  scenario('context-compaction', 'Сжатие контекста', 'system', [
    ...bootstrap,
    user('Продолжаем большой рефакторинг'),
    wait(500),
    agent({ type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'automatic', pre_tokens: 168000 } }),
    wait(800),
    ...textReply('Контекст сжался, но я помню суть рефакторинга — продолжаем.'),
    turnResult(1200),
  ]),

  scenario('error-turn', 'Ошибка хода', 'system', [
    ...bootstrap,
    user('Задеплой прод'),
    wait(500),
    toolUse('Bash', { command: 'pnpm run deploy:prod' }, 's15-1'),
    wait(1200),
    toolResult('s15-1', 'Error: DEPLOY_TOKEN is not set', true),
    wait(400),
    agent({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      result: 'Деплой упал: не задан DEPLOY_TOKEN.',
      duration_ms: 2600,
    }),
  ]),

  scenario('clear-conversation', '/clear стирает разговор', 'system', [
    ...bootstrap,
    user('Расскажи, что мы уже обсудили'),
    wait(500),
    ...textReply('Пока это первая реплика в разговоре — обсуждать особо нечего.'),
    turnResult(1200),
    wait(600),
    user('/clear'),
    wait(400),
    agent({ type: 'conversation_reset', new_conversation_id: 'demo-cleared' }),
  ]),

  scenario('rich-markdown', 'Ответ с markdown', 'system', [
    ...bootstrap,
    user('Покажи пример хука useDebounce'),
    wait(600),
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
]
