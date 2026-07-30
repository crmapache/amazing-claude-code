# Харнесс сценариев для ревью ленты webview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Локальная страница `harness.html`, которая по клику на кнопку мгновенно и с реалистичными таймингами разыгрывает один из 18 сценариев ленты (пачка вызовов инструментов, список задач, план, вопрос, разрешение, субагент, обрыв сессии и т.д.) в настоящем, ничем не изменённом интерфейсе панели — без IDE и без настоящего агента.

**Architecture:** Реальный `App` (`webview/src/App.tsx`) рендерится как есть; события сценария подаются в него через уже существующую точку внедрения моста (`window.__accReceive`, которую сам `App` регистрирует через `subscribe()` из `bridge.ts`). Единственная содержательная правка в самом продукте — необязательный параметр у функции отправки сообщения (`submit`) плюс один `useEffect` под `import.meta.env.DEV`, кладущий тонкую обёртку над ней в `window.__accHarnessSend` (Vite вырезает этот код в продакшен-сборке целиком). Библиотека сценариев и проигрыватель живут в отдельной, никогда не собираемой в плагин папке `webview/src/harness/`.

**Tech Stack:** React 19 + TypeScript, Vite (dev-сервер, без изменений конфигурации сборки) — существующий стек `webview/`, без новых зависимостей.

## Global Constraints

- Спека: `docs/superpowers/specs/2026-07-30-webview-scenario-harness-design.md` — при расхождении плана со спекой ориентир спека.
- `webview/harness.html` и весь код в `webview/src/harness/` не должны попадать в `vite build` (то, что gradle кладёт в ресурсы плагина) — только `vite dev`. Это достигается тем, что `harness.html` не прописывается в `build.rollupOptions.input` (`vite.config.ts` не трогаем вообще).
- Правка `webview/src/App.tsx` — единственная точка, где реальный код узнаёт о существовании харнесса, и она должна быть настолько маленькой, насколько возможно: один необязательный параметр у `submit` и один `useEffect` под `import.meta.env.DEV`. Ничего больше в `App.tsx` не трогаем.
- Автотестов на сам харнесс не пишем (нет `@testing-library`, это dev-инструмент, а не часть продукта) — проверка через `tsc --noEmit` и ручной визуальный прогон в браузере.
- Каждый сценарий должен доходить до конца сам, без зависаний — кроме тех, что намеренно заканчиваются на «ждём решения человека» (запрос разрешения, план на согласование) - это не баг, а точка, где дальше сценарий продолжает сам пользователь, кликая по настоящим кнопкам в настоящем интерфейсе.
- Тайминги между шагами — реальные паузы (`setTimeout`), а не мгновенное появление: часть ценности харнесса именно в том, чтобы видеть живое состояние «сейчас идёт вызов» с тикающим таймером, а не только готовый результат.

---

## Task 1: Тонкий хук отправки сообщения в App.tsx

**Files:**
- Modify: `webview/src/App.tsx` (функция `submit`, объявленная как `const submit = useCallback(() => { ... }, [draft, running, active, runLocal, editDraft])` — найти по этой сигнатуре, точный номер строки не гарантирован)
- Create: `webview/src/harness/types.ts`

**Interfaces:**
- Produces: глобальное `window.__accHarnessSend?: (text: string) => void` (объявлено через `declare global` в `webview/src/harness/types.ts` — ambient-декларация типов действует на весь TS-проект без импорта, поэтому `App.tsx` может ссылаться на это свойство `window`, не импортируя ничего из `harness/`, и в рантайме между ними остаётся ноль связи). Этим полем будет пользоваться `webview/src/harness/player.ts` в Task 2.

- [ ] **Step 1: Завести `webview/src/harness/types.ts` с типами шагов сценария и глобальной декларацией**

Создать файл `webview/src/harness/types.ts`:

```ts
import type { AgentEvent, ShellMessage } from '../protocol'

export type ScenarioStep =
  | { kind: 'shell'; message: ShellMessage }
  | { kind: 'agent'; event: AgentEvent }
  | { kind: 'user'; text: string }
  | { kind: 'wait'; ms: number }

export interface Scenario {
  id: string
  title: string
  category: 'grouping' | 'cards' | 'system' | 'combined'
  steps: ScenarioStep[]
}

declare global {
  interface Window {
    /**
     * Тонкий хук в App.tsx (только dev-сборка): харнесс имитирует настоящую
     * отправку сообщения из поля ввода, не трогая само поле ввода.
     */
    __accHarnessSend?: (text: string) => void
  }
}
```

- [ ] **Step 2: Дать `submit` необязательный параметр с текстом-подменой**

В `webview/src/App.tsx` найти определение `submit` (ищи `const submit = useCallback`). Заменить целиком на:

```ts
  const submit = useCallback((overrideText?: string) => {
    // Команды панели агенту не уходят: вход и выход в потоковом режиме ему
    // недоступны, а ветвление вообще про устройство панели.
    // Цитаты и вложения команде не мешают: они останутся в поле и уедут со
    // следующим сообщением — терять их из-за одной команды было бы обидно.
    const tokens = overrideText !== undefined ? [{ kind: 'text' as const, value: overrideText }] : draft.tokens
    const quotes = overrideText !== undefined ? [] : draft.quotes

    const local = localCommand(plainText(tokens))
    if (local) {
      runLocal(local)
      if (overrideText === undefined) editDraft(active, { tokens: [] })
      return
    }

    const text = overrideText ?? composePrompt(draft)
    if (!text) return

    const images = overrideText !== undefined ? [] : imageAttachments(draft.tokens)
    const attachCount = overrideText !== undefined ? 0 : draft.tokens.filter((token) => token.kind === 'chip').length

    if (running) {
      setQueue((current) => [
        ...current,
        {
          id: `q-${Date.now()}`,
          text,
          attach: attachCount ? `${attachCount} refs` : '',
          images,
        },
      ])
      if (overrideText === undefined) setDrafts((current) => ({ ...current, [active]: EMPTY_DRAFT }))
      return
    }

    dispatchPanel({
      session: active,
      action: { kind: 'prompt', tokens, quotes: quotes.map((quote) => quote.text) },
    })

    send({ type: 'prompt', sessionId: active, text, images })
    if (overrideText === undefined) setDrafts((current) => ({ ...current, [active]: EMPTY_DRAFT }))
  }, [draft, running, active, runLocal, editDraft])
```

Ничего в JSX, где `submit` используется (кнопка отправки, `onKeyDown` поля ввода и т.п.), менять не нужно — существующие вызовы `submit()` без аргумента ведут себя ровно как раньше (`overrideText === undefined` на каждом шаге).

- [ ] **Step 3: Завести dev-only хук сразу после `submit`**

Сразу после блока `useCallback` из Step 2 добавить:

```ts
  // Только для локальной страницы-харнесса (webview/src/harness) — имитирует
  // настоящую отправку сообщения из поля ввода. Vite статически подставляет
  // import.meta.env.DEV в false при vite build, поэтому в собранном плагине
  // этого кода физически не будет.
  useEffect(() => {
    if (!import.meta.env.DEV) return

    window.__accHarnessSend = submit
    return () => {
      window.__accHarnessSend = undefined
    }
  }, [submit])
```

- [ ] **Step 4: Проверить типы**

Run: `cd webview && pnpm tsc --noEmit`
Expected: чисто, без ошибок.

- [ ] **Step 5: Ручная проверка хука в браузере (без харнесса — напрямую через консоль)**

Run: `cd webview && pnpm dev`, открыть `http://localhost:5173/` в браузере, открыть консоль разработчика (F12) и выполнить по очереди:

```js
window.__accReceive?.({ type: 'auth', installed: true, loggedIn: true, email: 'you@example.com', plan: 'Max' })
window.__accHarnessSend?.('привет, тестовое сообщение')
```

Expected: после первой команды исчезает экран «Checking Claude Code…» и появляется обычная панель; после второй — в ленте появляется карточка пользователя с текстом «привет, тестовое сообщение». Если карточка не появилась — проверить консоль на ошибки, `submit` завёл битую замыкающую зависимость.

- [ ] **Step 6: Коммит**

```bash
git add webview/src/App.tsx webview/src/harness/types.ts
git commit -m "feat(webview): add dev-only harness send hook to submit"
```

---

## Task 2: Каркас харнесса — типы, события, плеер, тулбар, точка входа + сценарии группировки

**Files:**
- Create: `webview/src/harness/events.ts`
- Create: `webview/src/harness/player.ts`
- Create: `webview/src/harness/ScenarioToolbar.tsx`
- Create: `webview/src/harness/harness.module.css`
- Create: `webview/src/harness/harness.tsx`
- Create: `webview/src/harness/scenarios/grouping.ts`
- Create: `webview/src/harness/scenarios/index.ts`
- Create: `webview/harness.html`

**Interfaces:**
- Consumes: `ScenarioStep`/`Scenario` из `webview/src/harness/types.ts` (Task 1); `window.__accHarnessSend` (Task 1); `App` из `webview/src/App.tsx` (без изменений сигнатуры — компонент без пропов); `window.__accReceive`/`ShellMessage` — уже существующий канал из `webview/src/bridge.ts`/`webview/src/protocol.ts`.
- Produces: `scenario()`, `shell()`, `agent()`, `user()`, `wait()`, `bootstrap: ScenarioStep[]`, `toolUse()`, `toolResult()`, `think()`, `textReply()`, `turnResult()`, `SESSION` — все из `webview/src/harness/events.ts`, используются последующими задачами (Task 3, Task 4) для файлов `cards.ts`/`system.ts`/`combined.ts`. `ScenarioPlayer` (класс с методами `play(scenario): Promise<void>` и `cancel(): void`) из `webview/src/harness/player.ts`. `scenarios: Scenario[]` из `webview/src/harness/scenarios/index.ts` — Task 3/4 добавляют в этот файл новые категории.

- [ ] **Step 1: Хелперы построения событий (`events.ts`)**

Создать `webview/src/harness/events.ts`:

```ts
import type { AgentEvent, ShellMessage } from '../protocol'
import type { Scenario, ScenarioStep } from './types'

export const SESSION = 'main'

export const scenario = (
  id: string,
  title: string,
  category: Scenario['category'],
  steps: ScenarioStep[],
): Scenario => ({ id, title, category, steps })

export const shell = (message: ShellMessage): ScenarioStep => ({ kind: 'shell', message })
export const agent = (event: AgentEvent): ScenarioStep => ({ kind: 'agent', event })
export const user = (text: string): ScenarioStep => ({ kind: 'user', text })
export const wait = (ms: number): ScenarioStep => ({ kind: 'wait', ms })

/** Вход и открытие проекта — общий старт для всех сценариев. */
export const bootstrap: ScenarioStep[] = [
  shell({ type: 'auth', installed: true, loggedIn: true, email: 'you@example.com', plan: 'Max' }),
  shell({
    type: 'init',
    projectName: 'demo-project',
    workingDirectory: '/Users/you/demo-project',
    gitBranch: 'main',
    canAskPermissions: true,
  }),
]

export const toolUse = (name: string, input: unknown, id: string): ScenarioStep =>
  agent({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id, name, input }] },
  })

export const toolResult = (id: string, content: string, isError = false): ScenarioStep =>
  agent({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] },
  })

/** Вложенный вызов/реплика субагента — та же форма, что и обычная, но с parent_tool_use_id родительского Task. */
export const subagentText = (parentId: string, text: string): ScenarioStep =>
  agent({
    type: 'assistant',
    message: { content: [{ type: 'text', text }] },
    parent_tool_use_id: parentId,
  })

export const think = (thought: string): ScenarioStep =>
  agent({
    type: 'assistant',
    message: { content: [{ type: 'thinking', thinking: thought }] },
  })

/** Печатающийся ответ: несколько дельт кусками с паузами, затем готовый текстовый блок — как настоящий поток. */
export const textReply = (text: string, chunkSize = 28): ScenarioStep[] => {
  const steps: ScenarioStep[] = []

  for (let i = 0; i < text.length; i += chunkSize) {
    steps.push(
      agent({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: text.slice(i, i + chunkSize) } },
      }),
    )
    steps.push(wait(60))
  }

  steps.push(agent({ type: 'assistant', message: { content: [{ type: 'text', text }] } }))
  return steps
}

export const turnResult = (durationMs: number): ScenarioStep =>
  agent({
    type: 'result',
    subtype: 'success',
    duration_ms: durationMs,
    total_cost_usd: 0.01,
    session_id: 'demo-session',
    usage: { input_tokens: 1200, output_tokens: 260, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  })
```

- [ ] **Step 2: Плеер сценариев (`player.ts`)**

Создать `webview/src/harness/player.ts`:

```ts
import type { ShellMessage } from '../protocol'
import { SESSION } from './events'
import type { Scenario } from './types'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * После смены key у <App/> React размонтирует старый экземпляр и монтирует новый —
 * его собственный subscribe() перепишет window.__accReceive заново, но не мгновенно.
 * Ждём, пока там появится действительно НОВАЯ функция, а не та, что была до ремонта
 * (иначе на повторном клике события первые полсекунды улетали бы ещё старому,
 * уже размонтированному экземпляру).
 */
const waitForFreshBridge = async (previous: Window['__accReceive']): Promise<void> => {
  for (let i = 0; i < 50; i += 1) {
    if (window.__accReceive && window.__accReceive !== previous) return
    await sleep(10)
  }
}

export class ScenarioPlayer {
  private cancelled = false

  cancel(): void {
    this.cancelled = true
  }

  async play(scenario: Scenario): Promise<void> {
    const previousBridge = window.__accReceive
    this.cancelled = false
    await waitForFreshBridge(previousBridge)

    for (const step of scenario.steps) {
      if (this.cancelled) return

      if (step.kind === 'wait') {
        await sleep(step.ms)
        continue
      }

      if (step.kind === 'user') {
        window.__accHarnessSend?.(step.text)
        continue
      }

      const message: ShellMessage =
        step.kind === 'shell' ? step.message : { type: 'agent', sessionId: SESSION, event: step.event }

      window.__accReceive?.(message)
    }
  }
}
```

- [ ] **Step 3: Панель кнопок (`ScenarioToolbar.tsx` + `harness.module.css`)**

Создать `webview/src/harness/harness.module.css`:

```css
.toolbar {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 260px;
  overflow-y: auto;
  padding: 12px;
  background: #16171c;
  border-left: 1px solid #2a2b32;
  font: 12px/1.4 -apple-system, BlinkMacSystemFont, sans-serif;
  color: #d8d9df;
  z-index: 9999;
}

.toolbarCollapsed {
  width: 34px;
  padding: 12px 6px;
  overflow: hidden;
}

.toolbarHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.toolbarTitle {
  font-weight: 600;
}

.toolbarToggle {
  color: #9a9bab;
  padding: 2px 6px;
}

.group {
  margin-bottom: 14px;
}

.groupLabel {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #74758a;
  margin-bottom: 6px;
}

.scenarioButton {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  margin-bottom: 3px;
  border-radius: 6px;
  color: #d8d9df;
  background: transparent;
}

.scenarioButton:hover {
  background: #23242c;
}

.scenarioActive {
  background: #2d3350;
  color: #b9c2ff;
}
```

Создать `webview/src/harness/ScenarioToolbar.tsx`:

```tsx
import { useState } from 'react'
import type { Scenario } from './types'
import s from './harness.module.css'

interface ScenarioToolbarProps {
  scenarios: Scenario[]
  activeId: string | null
  onRun: (scenario: Scenario) => void
}

const CATEGORY_LABEL: Record<Scenario['category'], string> = {
  grouping: 'Группировка вызовов',
  cards: 'Остальные карточки',
  system: 'Служебные состояния',
  combined: 'Комбинированный',
}

const CATEGORY_ORDER: Scenario['category'][] = ['grouping', 'cards', 'system', 'combined']

export const ScenarioToolbar = ({ scenarios, activeId, onRun }: ScenarioToolbarProps) => {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className={`${s.toolbar} ${collapsed ? s.toolbarCollapsed : ''}`}>
      <div className={s.toolbarHead}>
        {!collapsed ? <span className={s.toolbarTitle}>Сценарии</span> : null}
        <button type="button" className={s.toolbarToggle} onClick={() => setCollapsed((value) => !value)}>
          {collapsed ? '«' : '»'}
        </button>
      </div>

      {!collapsed
        ? CATEGORY_ORDER.filter((category) => scenarios.some((item) => item.category === category)).map(
            (category) => (
              <div key={category} className={s.group}>
                <div className={s.groupLabel}>{CATEGORY_LABEL[category]}</div>
                {scenarios
                  .filter((item) => item.category === category)
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`${s.scenarioButton} ${activeId === item.id ? s.scenarioActive : ''}`}
                      onClick={() => onRun(item)}
                    >
                      {item.title}
                    </button>
                  ))}
              </div>
            ),
          )
        : null}
    </div>
  )
}
```

- [ ] **Step 4: Точка входа (`harness.tsx` + `harness.html`)**

Создать `webview/src/harness/harness.tsx`:

```tsx
import { StrictMode, useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../App'
import '../base.css'
import { ScenarioPlayer } from './player'
import { ScenarioToolbar } from './ScenarioToolbar'
import { scenarios } from './scenarios'
import type { Scenario } from './types'

const player = new ScenarioPlayer()

const Harness = () => {
  const [runId, setRunId] = useState(0)
  const [activeId, setActiveId] = useState<string | null>(null)

  const runScenario = useCallback((next: Scenario) => {
    player.cancel()
    setActiveId(next.id)
    setRunId((id) => id + 1)
    void player.play(next)
  }, [])

  return (
    <>
      <App key={runId} />
      <ScenarioToolbar scenarios={scenarios} activeId={activeId} onRun={runScenario} />
    </>
  )
}

const container = document.getElementById('root')
if (!container) throw new Error('Root container is missing in harness.html')

createRoot(container).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)
```

Создать `webview/harness.html` (копия `webview/index.html` с другим заголовком и точкой входа):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Amazing Claude Code — Harness</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/harness/harness.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Первая категория сценариев — группировка вызовов (`scenarios/grouping.ts`)**

Создать `webview/src/harness/scenarios/grouping.ts`:

```ts
import { bootstrap, scenario, think, toolResult, toolUse, textReply, turnResult, user, wait } from '../events'
import type { Scenario } from '../types'

export const scenariosGrouping: Scenario[] = [
  scenario('single-tool', 'Одиночный вызов', 'grouping', [
    ...bootstrap,
    user('Что лежит в package.json?'),
    wait(400),
    toolUse('Read', { file_path: '/Users/you/demo-project/package.json' }, 'g1-read'),
    wait(900),
    toolResult('g1-read', '1\t{\n2\t  "name": "demo-project",\n3\t  "version": "1.0.0"\n4\t}\n'),
    wait(300),
    ...textReply('В package.json лежит обычный манифест: имя пакета demo-project и версия 1.0.0.'),
    turnResult(1800),
  ]),

  scenario('tool-burst', 'Пачка вызовов подряд', 'grouping', [
    ...bootstrap,
    user('Разберись, как устроена аутентификация в проекте'),
    wait(400),
    toolUse('Bash', { command: 'grep -rn "authenticate" src --include=*.ts' }, 'g2-1'),
    wait(700),
    toolResult('g2-1', 'src/auth/login.ts:12:export const authenticate = async (token: string) => {'),
    wait(250),
    toolUse('Read', { file_path: '/Users/you/demo-project/src/auth/login.ts' }, 'g2-2'),
    wait(650),
    toolResult('g2-2', '1\texport const authenticate = async (token: string) => {\n2\t  ...\n3\t}\n'),
    wait(250),
    toolUse('Grep', { pattern: 'Session', path: 'src/auth' }, 'g2-3'),
    wait(500),
    toolResult('g2-3', 'src/auth/session.ts:4:export interface Session {'),
    wait(250),
    toolUse('Read', { file_path: '/Users/you/demo-project/src/auth/session.ts' }, 'g2-4'),
    wait(600),
    toolResult('g2-4', '1\texport interface Session {\n2\t  token: string\n3\t}\n'),
    wait(250),
    toolUse('Bash', { command: 'grep -rln "Session" src --include=*.ts' }, 'g2-5'),
    wait(550),
    toolResult('g2-5', 'src/auth/session.ts\nsrc/auth/login.ts\nsrc/middleware/guard.ts'),
    wait(250),
    toolUse('Read', { file_path: '/Users/you/demo-project/src/middleware/guard.ts' }, 'g2-6'),
    wait(700),
    toolResult('g2-6', '1\timport { Session } from "../auth/session"\n'),
    wait(300),
    ...textReply(
      'Аутентификация построена вокруг authenticate() в login.ts, который создаёт Session и проверяется в middleware guard.ts.',
    ),
    turnResult(6200),
  ]),

  scenario('no-break-across-gap', 'Не рвётся между внутренними шагами', 'grouping', [
    ...bootstrap,
    user('Проверь тесты и почини, если что-то красное'),
    wait(400),
    toolUse('Bash', { command: 'pnpm vitest run' }, 'g3-1'),
    wait(900),
    toolResult('g3-1', ' FAIL  src/utils/date.test.ts\n  ✗ formats correctly', true),
    // Пауза побольше — как будто между внутренними шагами хода, без единого
    // текстового блока между вызовами. Группа не должна из-за этого разорваться.
    wait(1200),
    toolUse('Read', { file_path: '/Users/you/demo-project/src/utils/date.ts' }, 'g3-2'),
    wait(700),
    toolResult('g3-2', '1\texport const formatDate = (d: Date) => d.toString()\n'),
    wait(1000),
    toolUse(
      'Edit',
      { file_path: '/Users/you/demo-project/src/utils/date.ts', old_string: 'd.toString()', new_string: 'd.toISOString()' },
      'g3-3',
    ),
    wait(600),
    toolResult('g3-3', 'The file has been updated.'),
    wait(1200),
    toolUse('Bash', { command: 'pnpm vitest run' }, 'g3-4'),
    wait(900),
    toolResult('g3-4', ' PASS  src/utils/date.test.ts'),
    wait(300),
    ...textReply('Тест падал из-за toString() вместо ISO-формата — поправил, тесты снова зелёные.'),
    turnResult(5400),
  ]),

  scenario('thinking-mixed-in', 'Мысль внутри и после группы', 'grouping', [
    ...bootstrap,
    user('Кратко объясни, что делает src/index.ts'),
    wait(400),
    think('Нужно сначала посмотреть на сам файл.'),
    wait(300),
    toolUse('Read', { file_path: '/Users/you/demo-project/src/index.ts' }, 'g4-1'),
    wait(700),
    toolResult('g4-1', '1\timport { start } from "./server"\n2\tstart()\n'),
    // Мысль ПОСЛЕ того, как единственный вызов уже разрешился, без текста между
    // ними — именно этот случай чинили в фиче группировки (баг с зависшим таймером).
    wait(500),
    think('Файл совсем короткий, этого достаточно для ответа.'),
    wait(400),
    ...textReply(
      'src/index.ts просто импортирует start() из server.ts и сразу его вызывает — это точка входа приложения.',
    ),
    turnResult(2600),
  ]),

  scenario('text-breaks-group', 'Текст между вызовами — две группы', 'grouping', [
    ...bootstrap,
    user('Сначала посмотри package.json, потом README'),
    wait(400),
    toolUse('Read', { file_path: '/Users/you/demo-project/package.json' }, 'g5-1'),
    wait(700),
    toolResult('g5-1', '1\t{ "name": "demo-project" }\n'),
    wait(300),
    ...textReply('Нашёл package.json, теперь гляну README.'),
    wait(400),
    toolUse('Read', { file_path: '/Users/you/demo-project/README.md' }, 'g5-2'),
    wait(700),
    toolResult('g5-2', '1\t# Demo project\n'),
    wait(300),
    ...textReply('А в README только заголовок «Demo project», больше ничего.'),
    turnResult(3400),
  ]),
]
```

- [ ] **Step 6: Собрать общий список (`scenarios/index.ts`)**

Создать `webview/src/harness/scenarios/index.ts`:

```ts
import { scenariosGrouping } from './grouping'
import type { Scenario } from '../types'

export const scenarios: Scenario[] = [...scenariosGrouping]
```

(Task 3 и Task 4 добавят сюда `scenariosCards`/`scenariosSystem`/`scenariosCombined` — этот файл каждый раз получает ещё один импорт и ещё один элемент в массиве, ничего в нём не удаляется.)

- [ ] **Step 7: Проверить типы**

Run: `cd webview && pnpm tsc --noEmit`
Expected: чисто, без ошибок.

- [ ] **Step 8: Ручная проверка в браузере**

Run: `cd webview && pnpm dev`, открыть `http://localhost:5173/harness.html`.

Expected: справа — панель с одной группой «Группировка вызовов» и 5 кнопками. По клику на «Пачка вызовов подряд» — окно оживает (проходит форма входа/пустой экран), появляется сообщение пользователя, затем один за другим (с видимыми паузами) появляются вызовы инструментов, сворачивающиеся в одну группу с тикающим таймером, и в конце — готовый текстовый ответ. Клик на другую кнопку сбрасывает всё и начинает заново. Ошибок в консоли браузера быть не должно.

- [ ] **Step 9: Коммит**

```bash
git add webview/harness.html webview/src/harness/
git commit -m "feat(webview): add scenario harness scaffold with tool-grouping scenarios"
```

---

## Task 3: Сценарии остальных карточек ленты (`scenarios/cards.ts`)

**Files:**
- Create: `webview/src/harness/scenarios/cards.ts`
- Modify: `webview/src/harness/scenarios/index.ts`

**Interfaces:**
- Consumes: всё из `webview/src/harness/events.ts` и `webview/src/harness/types.ts` (Task 2) — `scenario`, `bootstrap`, `shell`, `agent`, `user`, `wait`, `toolUse`, `toolResult`, `think`, `subagentText`, `textReply`, `turnResult`, `SESSION`.

- [ ] **Step 1: Написать сценарии**

Создать `webview/src/harness/scenarios/cards.ts`:

```ts
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
```

- [ ] **Step 2: Подключить в общий список**

Заменить `webview/src/harness/scenarios/index.ts` целиком на:

```ts
import { scenariosCards } from './cards'
import { scenariosGrouping } from './grouping'
import type { Scenario } from '../types'

export const scenarios: Scenario[] = [...scenariosGrouping, ...scenariosCards]
```

- [ ] **Step 3: Проверить типы**

Run: `cd webview && pnpm tsc --noEmit`
Expected: чисто, без ошибок.

- [ ] **Step 4: Ручная проверка в браузере**

Run: `cd webview && pnpm dev` (если уже запущен — просто обновить `http://localhost:5173/harness.html`).

Expected: во второй группе «Остальные карточки» — 7 кнопок. Пройтись по каждой: список задач с тремя пунктами разного статуса; план с шагами и рабочей кнопкой «одобрить»; вопрос с вариантами, на который можно ответить; запрос разрешения, где карточка вызова показывает «waiting for you»; субагент с прогресс-баром; фоновый субагент от скилла (без обычной карточки вызова инструмента — сразу карточка задачи); несколько одновременно бегущих агентов — видно в шапке со стримами и в списке агентов.

- [ ] **Step 5: Коммит**

```bash
git add webview/src/harness/scenarios/cards.ts webview/src/harness/scenarios/index.ts
git commit -m "feat(webview): add card scenarios to harness (todo, plan, ask, permission, subagents)"
```

---

## Task 4: Служебные состояния и комбинированный сценарий (`system.ts`, `combined.ts`)

**Files:**
- Create: `webview/src/harness/scenarios/system.ts`
- Create: `webview/src/harness/scenarios/combined.ts`
- Modify: `webview/src/harness/scenarios/index.ts`

**Interfaces:**
- Consumes: то же самое из `webview/src/harness/events.ts`/`types.ts`, что и в Task 3, плюс `SESSION` для `shell({type:'processExited', ...})`.

- [ ] **Step 1: Служебные состояния**

Создать `webview/src/harness/scenarios/system.ts`:

```ts
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
```

- [ ] **Step 2: Комбинированный сценарий**

Создать `webview/src/harness/scenarios/combined.ts`:

```ts
import { agent, bootstrap, scenario, textReply, think, toolResult, toolUse, turnResult, user, wait } from '../events'
import type { Scenario } from '../types'

export const scenariosCombined: Scenario[] = [
  scenario('everything-at-once', 'Всё сразу', 'combined', [
    ...bootstrap,
    user('Разберись в модуле аналитики, заведи план работ и почини сломанный тест'),
    wait(500),
    think('Начну с обзора структуры модуля.'),
    wait(300),
    toolUse('Bash', { command: 'find lib/analysis -maxdepth 1 -type f' }, 'e18-1'),
    wait(700),
    toolResult('e18-1', 'lib/analysis/impression-share.ts\nlib/analysis/elasticity.ts\nlib/analysis/stability.ts'),
    wait(300),
    toolUse('Read', { file_path: '/Users/you/demo-project/lib/analysis/elasticity.ts' }, 'e18-2'),
    wait(650),
    toolResult('e18-2', '1\texport const computeElasticity = (a: number, b: number) => a / b\n'),
    wait(250),
    toolUse('Grep', { pattern: 'TODO', path: 'lib/analysis' }, 'e18-3'),
    wait(600),
    toolResult('e18-3', 'lib/analysis/stability.ts:41:// TODO: handle NaN'),
    wait(250),
    toolUse('Bash', { command: 'pnpm vitest run lib/analysis' }, 'e18-4'),
    wait(900),
    toolResult('e18-4', ' FAIL  lib/analysis/stability.test.ts\n  ✗ handles empty input', true),
    wait(1100),
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
    toolResult('e18-5', 'The file has been updated.'),
    wait(250),
    toolUse('Bash', { command: 'pnpm vitest run lib/analysis' }, 'e18-6'),
    wait(800),
    toolResult('e18-6', ' PASS  lib/analysis/stability.test.ts'),
    wait(400),
    think('Тест починен, осталось завести план для остального.'),
    wait(300),
    agent({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'e18-todo',
            name: 'TodoWrite',
            input: {
              todos: [
                { content: 'Обзор модуля аналитики', status: 'completed' },
                { content: 'Починить упавший тест stability.ts', status: 'completed' },
                { content: 'Разобрать оставшиеся TODO', status: 'pending' },
              ],
            },
          },
        ],
      },
    }),
    wait(500),
    toolResult('e18-todo', 'Todos have been modified successfully.'),
    wait(500),
    ...textReply(
      'Осмотрел lib/analysis, починил упавший тест на NaN в stability.ts и завёл план на оставшиеся TODO.',
    ),
    turnResult(9200),
  ]),
]
```

- [ ] **Step 3: Подключить в общий список**

Заменить `webview/src/harness/scenarios/index.ts` целиком на:

```ts
import { scenariosCards } from './cards'
import { scenariosCombined } from './combined'
import { scenariosGrouping } from './grouping'
import { scenariosSystem } from './system'
import type { Scenario } from '../types'

export const scenarios: Scenario[] = [...scenariosGrouping, ...scenariosCards, ...scenariosSystem, ...scenariosCombined]
```

- [ ] **Step 4: Проверить типы**

Run: `cd webview && pnpm tsc --noEmit`
Expected: чисто, без ошибок.

- [ ] **Step 5: Полный ручной прогон всех 18 сценариев**

Run: `cd webview && pnpm dev`, открыть `http://localhost:5173/harness.html`.

Expected: все 4 группы кнопок на месте (5 + 7 + 5 + 1 = 18). Пройтись по каждой кнопке подряд, для каждой убедиться: сценарий доигрывает до объявленного конца (либо до финальной реплики, либо до точки «ждём тебя» — permission/plan), в консоли браузера нет ошибок и предупреждений React, клик по соседней кнопке посреди проигрывания корректно обрывает предыдущий сценарий и начинает новый с чистого листа.

- [ ] **Step 6: Убедиться, что харнесс не попадает в сборку плагина**

Run: `cd webview && pnpm build`
Expected: сборка проходит успешно. Затем:

Run: `ls webview/dist` и `find webview/dist -iname '*harness*'`
Expected: `find` не находит ни одного файла — ни `harness.html`, ни чанков с харнесс-кодом в `dist`.

- [ ] **Step 7: Коммит**

```bash
git add webview/src/harness/scenarios/system.ts webview/src/harness/scenarios/combined.ts webview/src/harness/scenarios/index.ts
git commit -m "feat(webview): add system-state and combined scenarios to harness"
```
