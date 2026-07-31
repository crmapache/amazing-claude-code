# Переработка Flow работы с субагентами: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить неработающие чипы `StreamsBar` и боковую шторку `AgentsDrawer` на один дропдаун с честным статусом каждого агента (running/done/needs-input), убрать карточки субагентов из основной ленты, дать каждому агенту свою вкладку с полным логом — и по пути починить два реальных бага: живое накопление лога субагента (сейчас не работает на актуальном CLI) и потерю `AskUserQuestion`, заданного субагентом.

**Architecture:** Небольшая правка в Kotlin-плагине прокидывает `agent_id` из hook-payload в permission-сообщение — он побайтово совпадает с `task_id`, который webview уже видит, поэтому дополнительной таблицы соответствий не нужно. В редьюсере ленты (`feed/build.ts`) заводится карта `tool_use_id → task_id` (из `task_started`), которая чинит привязку сообщений субагента к его карточке. Дальше — новый дропдаун `StreamSwitcher` (реализован через уже существующий генерик `Menu`, доработанный дополнительными опциями) переключает, что видно в области вывода: основную ленту `Feed` или новый экран `AgentStreamView` с полным логом конкретного агента.

**Tech Stack:** React 19 + TypeScript (webview), Vite, Vitest; Kotlin + kotlinx.serialization (JetBrains-плагин, IntelliJ Platform Gradle Plugin).

## Global Constraints

- Дизайн зафиксирован в `docs/superpowers/specs/2026-07-30-subagent-flow-redesign-design.md` — при любом расхождении между этим планом и спекой руководствоваться спекой и сообщить об этом.
- Каждая задача webview-стороны обязана проходить `pnpm tsc --noEmit` и `pnpm vitest run` в `webview/` перед коммитом.
- Финальная проверка обязана прогнать `pnpm build` в `webview/` — он же проверяет, что харнесс не просочился в сборку плагина (`! grep -rqil harness dist`).
- Kotlin-правка — точечная (три места), без рефакторинга `PermissionServer`/`ClaudePanel` за пределами нужного.
- Не трогать `webview/src/harness/` за пределами задачи 8 — остальные задачи меняют настоящий интерфейс, харнесс лишь проигрывает его.
- После каждой задачи — пройтись по своему диффу на предмет осиротевшего кода (неиспользуемые импорты/классы/поля), не только там, где явно указано.

---

### Task 1: Kotlin — прокинуть agent_id в permission-запрос

**Files:**
- Modify: `src/main/kotlin/io/github/crmapache/amazingclaudecode/claude/PermissionServer.kt:35-42` (data class `Request`), `:103-138` (`decide`), добавить приватный хелпер рядом с `:185-186` (`JsonObject.string`)
- Modify: `src/main/kotlin/io/github/crmapache/amazingclaudecode/toolwindow/ClaudePanel.kt:332-346` (`askPermission`)

**Interfaces:**
- Produces: `PermissionServer.Request.agentId: String?` — новое поле, `null` для запросов главного потока, значение `agent_id` из hook-payload для запросов, сделанных внутри субагента. JSON, уходящий в webview через `askPermission()`, получает необязательное поле `"agentId"` (ключ отсутствует в объекте целиком, если `agentId == null` — не пустая строка, а именно отсутствующий ключ).

- [ ] **Step 1: Добавить `agentId` в `Request` и прочитать его из payload**

В `PermissionServer.kt` замени `data class Request`:

```kotlin
    data class Request(
        val id: String,
        val sessionId: String,
        val toolName: String,
        val target: String,
        val command: String,
        val mode: String,
        /** Заполнено, только если разрешения запросил инструмент внутри субагента. */
        val agentId: String?,
    )
```

Рядом с существующим приватным хелпером `JsonObject.string` (в самом низу класса, строки 185-186) добавь второй:

```kotlin
    private fun JsonObject.string(key: String): String =
        this[key]?.jsonPrimitive?.contentOrNull.orEmpty()

    /** В отличие от string() — null, если поля нет вовсе или оно пустое, а не "". */
    private fun JsonObject.stringOrNull(key: String): String? =
        this[key]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotEmpty() }
```

В `decide()` (строки 119-126) добавь `agentId` в конструктор `Request`:

```kotlin
        val request = Request(
            id = UUID.randomUUID().toString(),
            sessionId = payload.string("session_id"),
            toolName = toolName,
            target = target(toolName, input),
            command = command(toolName, input),
            mode = mode,
            agentId = payload.stringOrNull("agent_id"),
        )
```

- [ ] **Step 2: Прокинуть agentId в сообщение webview**

В `ClaudePanel.kt`, `askPermission()` (строки 332-346):

```kotlin
    private fun askPermission(request: PermissionServer.Request) {
        awaiting[request.id] = request

        webview?.send(
            buildJsonObject {
                put("type", "permission")
                put("id", request.id)
                put("sessionId", request.sessionId.ifEmpty { MAIN_SESSION })
                put("toolName", request.toolName)
                put("target", request.target)
                put("command", request.command)
                put("mode", request.mode)
                request.agentId?.let { put("agentId", it) }
            }.toString(),
        )
    }
```

- [ ] **Step 3: Проверить, что Kotlin-сторона собирается**

Run: `./gradlew compileKotlin` из корня репозитория (если такой задачи в проекте нет — `./gradlew build`, посмотреть в выводе `gradle tasks --group build` заранее).
Expected: BUILD SUCCESSFUL, без предупреждений о новом поле `agentId`.

- [ ] **Step 4: Commit**

```bash
git add src/main/kotlin/io/github/crmapache/amazingclaudecode/claude/PermissionServer.kt src/main/kotlin/io/github/crmapache/amazingclaudecode/toolwindow/ClaudePanel.kt
git commit -m "feat(plugin): forward agent_id on permission requests from subagents"
```

---

### Task 2: Данные ленты — log вместо detail, taskId у решений, карта task_id↔tool_use_id

**Files:**
- Modify: `webview/src/protocol.ts:87-95` (вариант `permission` в `ShellMessage`)
- Modify: `webview/src/feed/types.ts:114-123` (`TaskItem`), `:153-160` (`PermItem`), `:176-181` (`AskItem`)
- Modify: `webview/src/feed/build.ts` (см. шаги ниже — `PanelState`, `PanelAction`, `initialPanelState`, `reducePanel` case `'permission'`, `applyProcessExited`, `applySystem` (`task_started`/`task_progress`/`task_notification`), `applyToolUse` (ветка `Task`/`Agent`), `applyToolResults` (ветка `task`), `noteSubagent`)
- Test: `webview/src/feed/build.test.ts`

**Interfaces:**
- Consumes: ничего нового снаружи модуля.
- Produces: `TaskItem.log: DetailLine[]` (было `detail`); `PermItem.taskId?: string`; `AskItem.taskId?: string`; `PanelState.taskByToolUseId: Record<string, string>`; `PanelAction` вариант `'permission'` получает необязательное поле `taskId?: string`. Эти имена и формы использует Task 4 (Feed.tsx), Task 5 (AgentStreamView), Task 7 (App.tsx).

- [ ] **Step 1: Расширить protocol.ts**

В `webview/src/protocol.ts`, вариант `permission` внутри `ShellMessage` (строки 87-95):

```ts
  | {
      type: 'permission'
      id: string
      sessionId: string
      toolName: string
      target: string
      command: string
      mode: string
      /** Заполнено, только если запрос породил вызов инструмента внутри субагента. */
      agentId?: string
    }
```

- [ ] **Step 2: Расширить feed/types.ts**

`TaskItem` (строки 114-123) — переименовать `detail` в `log`:

```ts
export interface TaskItem {
  id: string
  kind: 'task'
  target: string
  meta: string
  duration: string
  percent: number
  log: DetailLine[]
  pending: boolean
}
```

`PermItem` (строки 153-160):

```ts
export interface PermItem {
  id: string
  kind: 'perm'
  target: string
  meta: string
  command: string
  decision: 'once' | 'always' | 'deny' | null
  /** Не задано — решение главного потока. Задано — принадлежит конкретному агенту. */
  taskId?: string
}
```

`AskItem` (строки 176-181):

```ts
export interface AskItem {
  id: string
  kind: 'ask'
  meta: string
  questions: AskQuestion[]
  /** Не задано — вопрос главного потока. Задано — вопрос конкретного агента. */
  taskId?: string
}
```

- [ ] **Step 3: Запустить tsc, чтобы увидеть все места, которые ссылаются на старое имя поля**

Run: `cd webview && pnpm tsc --noEmit`
Expected: FAIL — ошибки на `item.detail` в `feed/build.ts` (несколько мест), `components/items/TaskCard.tsx`, `App.tsx` (`buildAgents`). Это ожидаемо: следующий шаг чинит `build.ts`, Task 4/5/7 чинят остальные файлы.

- [ ] **Step 4: PanelState/PanelAction — новые поля**

В `feed/build.ts`, `PanelState` (строки 32-78) — добавить поле после `startedAt`:

```ts
  /** Время начала каждого незавершённого вызова — из него считается длительность. */
  startedAt: Record<string, number>
  /**
   * task_id субагента по tool_use_id вызова Task, который его породил — из
   * системного события task_started. Сообщения самого субагента несут только
   * tool_use_id в parent_tool_use_id, а карточка живёт под task_id: без этой
   * карты их нечем связать.
   */
  taskByToolUseId: Record<string, string>
```

`initialPanelState` (строки 107-125) — добавить `taskByToolUseId: {}`:

```ts
export const initialPanelState: PanelState = {
  items: [],
  streamingText: '',
  status: 'idle',
  errors: [],
  usage: {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
  cost: 0,
  startedAt: {},
  taskByToolUseId: {},
  slashCommands: [],
  seq: 1,
  crashed: false,
  compacting: false,
  suppressNextMeta: false,
}
```

`PanelAction` (строки 80-105) — вариант `'permission'` получает `taskId`:

```ts
  | { kind: 'permission'; id: string; target: string; command: string; mode: string; taskId?: string }
```

- [ ] **Step 5: reducePanel — прокинуть taskId в PermItem**

В `reducePanel`, case `'permission'` (строки 190-204):

```ts
    case 'permission':
      return {
        ...state,
        items: [
          ...state.items,
          {
            id: action.id,
            kind: 'perm',
            target: action.target,
            meta: `${action.mode} mode`,
            command: action.command,
            decision: null,
            taskId: action.taskId,
          },
        ],
      }
```

- [ ] **Step 6: Общий хелпер накопления лога — appendAgentLog**

Прямо над `noteSubagent` (сейчас строки 787-808) добавить:

```ts
/**
 * Кап на лог агента — иначе очень длинный субагент рос бы в памяти неограниченно.
 * 300 строк — с большим запасом на реальный ход субагента; при переполнении
 * старейшие строки уходят под одну сводную пометку вместо того, чтобы пропадать
 * молча.
 */
const AGENT_LOG_LIMIT = 300
const TRIM_MARK = /^…(\d+) earlier steps trimmed$/

const appendAgentLog = (log: DetailLine[], lines: DetailLine[]): DetailLine[] => {
  if (lines.length === 0) return log

  const merged = [...log, ...lines]
  if (merged.length <= AGENT_LOG_LIMIT) return merged

  const already = TRIM_MARK.exec(merged[0]?.text ?? '')
  const priorTrimmed = already ? Number(already[1]) : 0
  const withoutMark = already ? merged.slice(1) : merged
  const keep = withoutMark.slice(withoutMark.length - (AGENT_LOG_LIMIT - 1))
  const trimmedNow = withoutMark.length - keep.length

  return [{ text: `…${priorTrimmed + trimmedNow} earlier steps trimmed`, tone: 'dim' as const }, ...keep]
}
```

- [ ] **Step 7: applyProcessExited — переименовать detail в log**

В `applyProcessExited` (строки 310-323), ветка `item.kind === 'task'`:

```ts
    if (item.kind === 'task') {
      if (!item.pending) return item

      const started = startedAt[item.id]
      delete startedAt[item.id]
      const duration = started ? formatDuration(now - started) : item.duration

      return {
        ...item,
        pending: false,
        duration,
        log: appendAgentLog(item.log, [{ text: 'Session ended before this returned.', tone: 'bad' as const }]),
      }
    }
```

- [ ] **Step 8: applySystem — task_started запоминает tool_use_id→task_id, task_progress/task_notification копят, а не заменяют**

`task_started` (строки 487-505):

```ts
  if (event.subtype === 'task_started' && event.task_id) {
    return {
      ...base,
      startedAt: { ...base.startedAt, [event.task_id]: now },
      taskByToolUseId: event.tool_use_id
        ? { ...base.taskByToolUseId, [event.tool_use_id]: event.task_id }
        : base.taskByToolUseId,
      items: [
        ...base.items,
        {
          id: event.task_id,
          kind: 'task',
          target: event.subagent_type ?? 'agent',
          meta: event.description ?? '',
          duration: '',
          percent: 0,
          log: [],
          pending: true,
        },
      ],
    }
  }
```

`task_progress` (строки 507-520):

```ts
  if (event.subtype === 'task_progress' && event.task_id) {
    return {
      ...base,
      items: base.items.map((item) =>
        item.kind === 'task' && item.id === event.task_id
          ? {
              ...item,
              meta: event.description ?? item.meta,
              log: event.last_tool_name ? appendAgentLog(item.log, [{ text: `→ ${event.last_tool_name}` }]) : item.log,
            }
          : item,
      ),
    }
  }
```

`task_notification` (строки 522-543):

```ts
  if (event.subtype === 'task_notification' && event.task_id) {
    const startedTime = base.startedAt[event.task_id]
    const duration = startedTime ? formatDuration(now - startedTime) : ''
    const startedAt = { ...base.startedAt }
    delete startedAt[event.task_id]

    return {
      ...base,
      startedAt,
      items: base.items.map((item) =>
        item.kind === 'task' && item.id === event.task_id
          ? {
              ...item,
              pending: false,
              percent: 100,
              duration,
              log: event.summary ? appendAgentLog(item.log, detailFor(event.summary)) : item.log,
            }
          : item,
      ),
    }
  }
```

Заодно поправь комментарий над блоком (строки 480-486), который сейчас упоминает `StreamsBar`/`AgentsDrawer` — их к этой задаче ещё не снесли (это Task 7), но комментарий явно устареет:

```ts
  /**
   * Фоновый подагент скилла/воркфлоу (/code-review и подобные) — своей карточки
   * не было вовсе, потому что у него нет вызова инструмента Task в потоке
   * ассистента: скилл поднимает его напрямую, в обход обычного цикла хода.
   * Карточка та же самая, что и у обычного Task — потребителям ниже (дропдаун
   * стримов, экран агента) всё равно, откуда взялся kind:'task'.
   */
```

- [ ] **Step 9: applyToolUse — ветка Task/Agent заводит log**

Строки 688-707:

```ts
  if (block.name === 'Task' || block.name === 'Agent') {
    const subagent = typeof input.subagent_type === 'string' ? input.subagent_type : 'general'
    return {
      ...state,
      startedAt: { ...state.startedAt, [block.id]: now },
      items: [
        ...state.items,
        {
          id: block.id,
          kind: 'task',
          target: subagent,
          meta: targetFor(block.name, input, workingDirectory),
          duration: '',
          percent: 0,
          log: [],
          pending: true,
        },
      ],
    }
  }
```

- [ ] **Step 10: applyToolResults — ветка task копит финальный результат, а не заменяет лог**

Строки 758-770:

```ts
    if (item.kind === 'task') {
      const result = results.find((candidate) => candidate.tool_use_id === item.id)
      if (!result) return item

      const started = state.startedAt[item.id]
      const duration = started ? formatDuration(now - started) : ''
      delete startedAt[item.id]

      const text = resultToText(result.content)
      const isError = result.is_error === true
      const tone = isError ? ('bad' as const) : ('ok' as const)
      const task: TaskItem = {
        ...item,
        pending: false,
        percent: 100,
        duration,
        log: appendAgentLog(item.log, detailFor(text).map((line) => ({ ...line, tone }))),
      }
      return task
    }
```

- [ ] **Step 11: noteSubagent — резолвить task_id через карту, копить лог, ловить AskUserQuestion субагента**

Полностью заменить `noteSubagent` (строки 787-808) на:

```ts
/**
 * Резолвит id вызова, который породил субагента, в реальный task_id его
 * карточки. У фонового канала (task_started/...) это два разных значения —
 * карта строится в applySystem. У прямого вызова Task/Agent tool_use они
 * совпадают напрямую (сама карточка создана с id, равным этому же вызову),
 * поэтому карта для него не нужна — резолвится в самого себя через ?? .
 */
const resolveTaskId = (state: PanelState, parentToolUseId: string): string =>
  state.taskByToolUseId[parentToolUseId] ?? parentToolUseId

/**
 * Сообщения субагента идут в лог его же карточки, а не в общую ленту — у него
 * своя вкладка (см. AgentStreamView). Вопрос AskUserQuestion, заданный самим
 * субагентом, отдельно превращается в настоящую карточку с вариантами ответа,
 * привязанную к нему через taskId — раньше терялся здесь же, одной строкой без
 * возможности ответить.
 */
const noteSubagent = (state: PanelState, parentToolUseId: string, blocks: ContentBlock[]): PanelState => {
  const taskId = resolveTaskId(state, parentToolUseId)
  if (!state.items.some((item) => item.kind === 'task' && item.id === taskId)) return state

  const askBlock = blocks.find(
    (block): block is ToolUseBlock => block.type === 'tool_use' && block.name === 'AskUserQuestion',
  )

  let next = state
  if (askBlock) {
    const questions = readQuestions((askBlock.input ?? {}) as Record<string, unknown>)
    next = {
      ...next,
      items: [
        ...next.items,
        {
          id: askBlock.id,
          kind: 'ask',
          meta: `${questions.length} ${questions.length === 1 ? 'question' : 'questions'} · blocks the run`,
          questions,
          taskId,
        },
      ],
    }
  }

  const lines = blocks.flatMap((block): DetailLine[] => {
    if (block.type === 'text' && block.text.trim()) return [{ text: block.text.trim().split('\n')[0] ?? '' }]
    if (block.type === 'tool_use') return [{ text: `${block.name}…`, tone: 'dim' as const }]
    return []
  })

  return {
    ...next,
    items: next.items.map((item) =>
      item.id === taskId && item.kind === 'task'
        ? { ...item, log: appendAgentLog(item.log, lines), percent: Math.min(item.percent + 12, 92) }
        : item,
    ),
  }
}
```

Импорт `ToolUseBlock` в `build.ts` уже есть (строки 1-8, используется в сигнатуре `applyToolUse`) — новых импортов не требуется.

- [ ] **Step 12: Запустить tsc и починить оставшиеся ссылки внутри feed/**

Run: `cd webview && pnpm tsc --noEmit`
Expected: ошибки только вне `feed/` (TaskCard.tsx, App.tsx) — они чинятся в Task 4/5/7. Если tsc ругается на что-то ВНУТРИ `feed/build.ts` или `feed/types.ts` — значит шаг выше выполнен не полностью, вернуться и доисправить.

- [ ] **Step 13: Тесты — накопление лога через карту task_id↔tool_use_id**

В `webview/src/feed/build.test.ts` расширить импорт типов (строка 6) — добавить `TaskItem`:

```ts
import type { TaskItem, TextItem, ToolGroupItem } from './types'
```

Добавить рядом с существующими хелперами (после `textEvent`, строка 34):

```ts
const taskStartedEvent = (taskId: string, toolUseId: string, subagentType: string): AgentEvent => ({
  type: 'system',
  subtype: 'task_started',
  task_id: taskId,
  tool_use_id: toolUseId,
  subagent_type: subagentType,
  description: 'Демо-задача',
})

const subagentMessageEvent = (parentToolUseId: string, text: string): AgentEvent => ({
  type: 'assistant',
  message: { content: [{ type: 'text', text }] },
  parent_tool_use_id: parentToolUseId,
})

const subagentAskEvent = (parentToolUseId: string): AgentEvent => ({
  type: 'assistant',
  message: {
    content: [
      {
        type: 'tool_use',
        id: 'ask-1',
        name: 'AskUserQuestion',
        input: { questions: [{ question: 'Продолжать?', header: 'Ветка', options: [{ label: 'Да' }, { label: 'Нет' }] }] },
      },
    ],
  },
  parent_tool_use_id: parentToolUseId,
})
```

Новый `describe`-блок в конце файла (после существующего `describe`, перед закрывающей скобкой файла — если существующий `describe` уже закрыт, добавить новый на верхнем уровне):

```ts
describe('лог фонового субагента', () => {
  it('копит шаги в TaskItem.log через карту task_id↔tool_use_id, а не теряет их', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    state = play([subagentMessageEvent('toolu-parent', 'Смотрю конфиги')], state)
    state = play([subagentMessageEvent('toolu-parent', 'Смотрю сервер')], state)

    const task = state.items.find((item): item is TaskItem => item.kind === 'task')
    expect(task).toBeDefined()
    expect(task?.log.map((line) => line.text)).toEqual(['Смотрю конфиги', 'Смотрю сервер'])
  })

  it('AskUserQuestion от субагента создаёт AskItem с taskId, а не теряется в логе', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    state = play([subagentAskEvent('toolu-parent')], state)

    const ask = state.items.find((item) => item.kind === 'ask')
    expect(ask).toBeDefined()
    expect(ask?.kind === 'ask' && ask.taskId).toBe('task-1')
    expect(ask?.kind === 'ask' && ask.questions[0]?.title).toBe('Продолжать?')
  })

  it('обрезает лог агента после AGENT_LOG_LIMIT строк, а не растит его бесконечно', () => {
    let state = play([taskStartedEvent('task-1', 'toolu-parent', 'Explore')])
    for (let i = 0; i < 310; i += 1) {
      state = play([subagentMessageEvent('toolu-parent', `шаг ${i}`)], state)
    }

    const task = state.items.find((item) => item.kind === 'task')
    expect(task?.kind === 'task' && task.log.length).toBe(300)
    expect(task?.kind === 'task' && task.log[0]?.text).toMatch(/^…\d+ earlier steps trimmed$/)
    expect(task?.kind === 'task' && task.log.at(-1)?.text).toBe('шаг 309')
  })

  it('permission-действие с taskId создаёт PermItem, привязанный к агенту', () => {
    const state = reducePanel(initialPanelState, {
      kind: 'permission',
      id: 'perm-1',
      target: 'wants to run a command',
      command: 'npm test',
      mode: 'default',
      taskId: 'task-1',
    })

    const perm = state.items.find((item) => item.kind === 'perm')
    expect(perm?.kind === 'perm' && perm.taskId).toBe('task-1')
  })
})
```

- [ ] **Step 14: Прогнать новые тесты**

Run: `cd webview && pnpm vitest run src/feed/build.test.ts`
Expected: PASS — все тесты файла, включая 4 новых.

- [ ] **Step 15: Commit**

```bash
git add webview/src/protocol.ts webview/src/feed/types.ts webview/src/feed/build.ts webview/src/feed/build.test.ts
git commit -m "feat(webview): accumulate full subagent log and attach ask/permission to their agent"
```

---

### Task 3: Feed.tsx — убрать карточку задачи из основной ленты

**Files:**
- Modify: `webview/src/components/Feed.tsx`

**Interfaces:**
- Consumes: `TaskItem` (уже без `.detail`, с `.log` — из Task 2), `PermItem.taskId` (из Task 2).
- Produces: `Feed` больше не принимает и не рендерит `kind: 'task'` — `FeedRowItem` сужен до `Exclude<FeedItem, TodoItem | AskItem | PermItem | TaskItem>`.

- [ ] **Step 1: Сузить FeedRowItem и убрать TaskCard**

В `webview/src/components/Feed.tsx`:

Строка 8 — убрать импорт:

```ts
import { TaskCard } from './items/TaskCard'
```

Строка 18 — расширить исключение:

```ts
type FeedRowItem = Exclude<FeedItem, TodoItem | AskItem | PermItem | TaskItem>
```

Импорт типов (строка 3) — добавить `TaskItem`, убрать больше не нужный `ToolItem` из flatMap-генерика (он остаётся нужен для самого поля `ToolItem` в `ItemView`? Нет — `ToolItem` в файле сейчас используется только внутри `lastPendingId`'s generic; после следующего шага генерик сужается до одного `ToolItem`, импорт остаётся):

```ts
import type { AskItem, FeedItem, PermItem, TaskItem, TodoItem, ToolItem } from '../feed/types'
```

- [ ] **Step 2: Убрать 'task' из фильтра rows**

Строки 53-59 — фильтр `rows` не менять по составу условий (task и так не входил явно, он просто перестаёт быть допустимым типом `FeedRowItem` после Step 1) — оставить как есть, tsc сам подтвердит, что `item.kind !== 'task'` не нужен явно (тип уже не включает `TaskItem`).

- [ ] **Step 3: Ограничить awaitingPermission только главным потоком и убрать task из lastPendingId**

Строки 61-75 заменить на:

```ts
  /**
   * Пока где-то в ленте открыт неотвеченный запрос разрешения ГЛАВНОГО потока
   * (не субагента — у его решений своя вкладка, см. AgentStreamView), самая
   * свежая «выполняется»-карточка на деле просто ждёт человека. Без этой
   * пометки обе ситуации выглядят одинаковым спиннером.
   */
  const awaitingPermission = items.some(
    (item) => item.kind === 'perm' && item.decision === null && item.taskId === undefined,
  )
  const lastPendingId = awaitingPermission
    ? items
        .flatMap<ToolItem>((item) => (item.kind === 'toolGroup' ? item.tools.filter((tool) => tool.pending) : []))
        .at(-1)?.id
    : undefined
```

- [ ] **Step 4: Убрать case 'task' из ItemView**

Строки 230-238 (`case 'task': return <TaskCard .../>`) — удалить целиком.

- [ ] **Step 5: tsc**

Run: `cd webview && pnpm tsc --noEmit`
Expected: PASS для `Feed.tsx` (оставшиеся ошибки — в `App.tsx`/`TaskCard.tsx`, они за пределами этой задачи).

- [ ] **Step 6: Визуальная проверка сценарием харнесса**

Run (если dev-сервер ещё не поднят): `cd webview && pnpm dev`, открыть `http://localhost:5173/harness.html`, сценарий `subagent-task` (категория `cards`), чекпоинт «Субагент: смотрит config и server».
Expected: карточка `TASK` в этом чекпоинте больше НЕ появляется в общей ленте (это ожидаемо и временно — она вернётся отдельным экраном в Task 7; сейчас просто убеждаемся, что лента не падает и не рисует пустых мест на месте задачи).

- [ ] **Step 7: Commit**

```bash
git add webview/src/components/Feed.tsx
git commit -m "refactor(webview): stop rendering task cards inline in the main feed"
```

---

### Task 4: AgentStreamView — новый экран вместо TaskCard

**Files:**
- Delete: `webview/src/components/items/TaskCard.tsx`
- Create: `webview/src/components/AgentStreamView.tsx`
- Modify: `webview/src/components/feed.module.css` (см. шаги)

**Interfaces:**
- Consumes: `TaskItem` (из Task 2, с полем `.log`).
- Produces: `AgentStreamView({ item: TaskItem | undefined })` — если `item` не задан, рендерит `null` (тот же контракт, что у `PermissionPanel`/`AskPanel`). Использует его Task 7.

- [ ] **Step 1: Удалить старый TaskCard.tsx**

```bash
git rm webview/src/components/items/TaskCard.tsx
```

- [ ] **Step 2: Создать AgentStreamView.tsx**

```tsx
import type { TaskItem } from '../feed/types'
import s from './feed.module.css'

interface AgentStreamViewProps {
  /** Агент, открытый сейчас в дропдауне — или ничего, пока вкладка не выбрана. */
  item: TaskItem | undefined
}

/**
 * Область вывода, когда в дропдауне открыт конкретный агент, а не main — тот
 * же визуальный язык, что раньше был у карточки задачи в общей ленте, но как
 * самостоятельный экран: шапка с прогрессом и весь накопленный лог агента, а
 * не последние несколько строк.
 */
export const AgentStreamView = ({ item }: AgentStreamViewProps) => {
  if (!item) return null

  return (
    <div className={s.agentView}>
      <div className={s.agentViewHead}>
        <span className={s.taskChip}>TASK</span>
        <span className={s.taskTarget}>{item.target}</span>
        <span className={s.taskMeta}>{item.meta}</span>
        <div className={s.spacer} />
        <span className={`${s.taskDur} ${item.pending ? s.running : ''}`}>
          {item.pending ? item.duration || 'running' : item.duration}
        </span>
      </div>

      <div className={s.agentViewBody}>
        {item.log.map((line, index) => (
          <div
            key={index}
            className={`${s.detail} ${line.tone === 'ok' ? s.detailOk : ''} ${line.tone === 'bad' ? s.detailBad : ''}`}
          >
            {line.text}
          </div>
        ))}

        <div className={s.barRow}>
          <div className={s.bar}>
            <div className={s.barFill} style={{ width: `${item.percent}%` }} />
          </div>
          <span className={s.barLabel}>{item.pending ? `${item.percent}%` : '100% · returned'}</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: CSS — новый экран вместо карточки, убрать мёртвый .taskDur.waiting**

В `webview/src/components/feed.module.css`, после блока `.barLabel` (строка 682-685, перед следующей секцией `/* --- План ... */`) добавить:

```css
/* --- Экран агента (вкладка дропдауна вместо main) --------------------------- */

.agentView {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.agentViewHead {
  flex: none;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--acc-line);
  background: rgb(183 140 240 / 5%);
}

.agentViewBody {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
```

`.taskCaret`/`.caretOpen`-специфика больше не нужна (кнопки-раскрытия больше нет), но эти классы общие с другими карточками (`.caret`/`.caretOpen` в блоке 345-353 используются `ToolGroupCard`, не удалять). Специфичный только для старого `TaskCard` — `.taskDur.waiting` (строки 650-652) и `.taskHead`/`.taskHead:hover`/`.taskCaret`/`.taskBody` (строки 593-612, 654-659), которые нигде больше не используются. Удалить блоки `.taskHead`, `.taskHead:hover`, `.taskCaret`, `.taskBody` (строки 593-612 и 654-659) и `.taskDur.waiting` (строки 650-652), оставить `.task` (строки 585-591 — уже не используется этой задачей, но проверить перед удалением: другие карточки его не занимают, поэтому он тоже становится мёртвым — удалить и его), `.taskChip`/`.taskTarget`/`.taskMeta`/`.taskDur`/`.taskDur.running` (используются `AgentStreamView`), `.bar`/`.barFill`/`.barRow`/`.barLabel` (используются `AgentStreamView`).

- [ ] **Step 4: tsc**

Run: `cd webview && pnpm tsc --noEmit`
Expected: ошибки только в `App.tsx` (ссылки на удалённый `TaskCard`-путь через `Feed`/старый `buildAgents` — уже почищено в Task 3/предыдущих; оставшиеся — из `App.tsx`, чинятся в Task 6).

- [ ] **Step 5: Commit**

```bash
git add webview/src/components/AgentStreamView.tsx webview/src/components/feed.module.css
git rm webview/src/components/items/TaskCard.tsx 2>/dev/null || true
git commit -m "refactor(webview): replace TaskCard with a standalone AgentStreamView screen"
```

---

### Task 5: StreamSwitcher — дропдаун стримов поверх существующего Menu

**Files:**
- Modify: `webview/src/components/Menu.tsx` (добавить `dot` в `MenuOption`, `placement` в `MenuProps`)
- Modify: `webview/src/components/StatusBar.tsx` (расширить `Anchor`)
- Modify: `webview/src/components/shell.module.css` (добавить `.menuDot`, `.streamBar`; удалить блоки `.streams`/`.running` из старого `StreamsBar`)
- Create: `webview/src/components/StreamSwitcher.tsx`

**Interfaces:**
- Consumes: `Menu`, `MenuOption`, `Anchor` (существующие, дорабатываются здесь же).
- Produces: `AgentStatus = 'idle' | 'running' | 'done' | 'needs-input'`; `AgentTab { id, label, meta, status }`; `StreamSwitcher({ tabs: AgentTab[], mainStatus: AgentStatus, active: string, onPick: (id: string) => void })` — рендерит `null`, если `tabs.length === 0`. Использует их Task 7.

- [ ] **Step 1: Menu.tsx — placement и dot**

`Anchor` определён в `StatusBar.tsx` (строки 8-11) — расширить:

```ts
/** Где стоит кнопка селектора: меню открывается рядом с ней. */
export interface Anchor {
  right: number
  top: number
  /** Нижний край кнопки-триггера — нужен только меню, открывающемуся вниз. */
  bottom?: number
}
```

`Menu.tsx` — добавить `dot` в `MenuOption` (строки 4-11):

```ts
export interface MenuOption {
  id: string
  label: string
  tag?: string
  danger?: boolean
  sub?: string
  key?: string
  /** Цветная точка перед подписью — цвет как значение CSS (var(...) или #hex). */
  dot?: string
}
```

`MenuProps` (строки 13-23) — добавить `placement`:

```ts
interface MenuProps {
  title: string
  hint: string
  width: number
  /** Кнопка, из которой меню открыли: оно встаёт рядом с ней. */
  anchor: Anchor
  options: MenuOption[]
  selected: string
  onPick: (id: string) => void
  onClose: () => void
  /** 'up' (по умолчанию) — растёт вверх от кнопки, как у нижней строки статуса. 'down' — вниз. */
  placement?: 'up' | 'down'
}
```

Тело компонента (строки 25-41) — вычислить позицию по `placement`:

```tsx
export const Menu = ({ title, hint, width, anchor, options, selected, onPick, onClose, placement = 'up' }: MenuProps) => {
  // Прижимаемся к правому краю кнопки, но не даём уехать за края панели: она в
  // IDE бывает уже самого меню.
  const actualWidth = Math.min(width, window.innerWidth - 16)
  const right = Math.min(Math.max(8, anchor.right), Math.max(8, window.innerWidth - actualWidth - 8))
  const vertical =
    placement === 'down'
      ? { top: `${Math.max(8, (anchor.bottom ?? anchor.top) + 6)}px` }
      : { bottom: `${Math.max(8, window.innerHeight - anchor.top + 6)}px` }

  return (
    <>
      <div className={s.menuScrim} onClick={onClose} />
      <div className={s.menu} style={{ width: `${actualWidth}px`, right: `${right}px`, ...vertical }}>
```

(Дальше тело `<div className={s.menu}>` не меняется до самого конца — только исходный многострочный `style={{...}}` заменяется на строку выше.)

Внутри `.map((option) => ...)` (строки 47-68), в `menuRow` — добавить точку перед лейблом:

```tsx
              <div className={s.menuBody}>
                <div className={s.menuRow}>
                  {option.dot ? <span className={s.menuDot} style={{ background: option.dot }} /> : null}
                  <span className={`${s.menuLabel} ${on ? s.menuLabelOn : ''}`}>{option.label}</span>
                  {option.tag ? (
                    <span className={`${s.menuTag} ${option.danger ? s.menuTagDanger : ''}`}>{option.tag}</span>
                  ) : null}
                </div>
                {option.sub ? <div className={s.menuSub}>{option.sub}</div> : null}
              </div>
```

- [ ] **Step 2: CSS — .menuDot и замена .streams/.running на .streamBar**

В `shell.module.css`, рядом с `.menuTag`/`.menuTagDanger` (после строки 610) добавить:

```css
.menuDot {
  flex: none;
  align-self: center;
  width: 5px;
  height: 5px;
  border-radius: 9px;
}
```

Удалить весь блок «Полоса потоков» — комментарий-заголовок и правила `.streams`/`.streamsLabel`/`.streamList`/`.stream`/`.stream:hover`/`.streamActive`/`.streamDot`/`.streamLabel`/`.streamMeta`/`.running`/`.running:hover`/`.runningDot`/`.runningLabel` (строки 262-358, от `/* --- Полоса потоков ... */` до пустой строки перед `/* --- Нижняя строка ... */`). На его месте (та же позиция в файле) добавить:

```css
/* --- Переключатель стрима --------------------------------------------------- */

.streamBar {
  flex: none;
  display: flex;
  align-items: center;
  padding: 6px 8px;
  background: var(--acc-bg-raised);
  border-bottom: 1px solid var(--acc-line);
}
```

- [ ] **Step 3: Создать StreamSwitcher.tsx**

```tsx
import { useState } from 'react'
import { Menu, type MenuOption } from './Menu'
import type { Anchor } from './StatusBar'
import s from './shell.module.css'

export type AgentStatus = 'idle' | 'running' | 'done' | 'needs-input'

export interface AgentTab {
  id: string
  label: string
  meta: string
  status: AgentStatus
}

interface StreamSwitcherProps {
  tabs: AgentTab[]
  mainStatus: AgentStatus
  active: string
  onPick: (id: string) => void
}

const STATUS_DOT: Partial<Record<AgentStatus, string>> = {
  running: 'var(--acc-accent)',
  done: 'var(--acc-ok)',
  'needs-input': 'var(--acc-warn)',
}

const STATUS_TAG: Partial<Record<AgentStatus, string>> = {
  running: 'RUNNING',
  done: 'DONE',
  'needs-input': 'NEEDS INPUT',
}

/**
 * Дропдаун вместо чипов StreamsBar: переключает, что видно в области вывода —
 * main или конкретный агент. Появляется только когда за сессию был хотя бы
 * один агент — до этого переключать нечего, а до первого запуска место в
 * шапке лучше не занимать.
 */
export const StreamSwitcher = ({ tabs, mainStatus, active, onPick }: StreamSwitcherProps) => {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  if (tabs.length === 0) return null

  const options: MenuOption[] = [
    {
      id: 'main',
      label: 'main',
      dot: STATUS_DOT[mainStatus],
      tag: STATUS_TAG[mainStatus],
      danger: mainStatus === 'needs-input',
    },
    ...tabs.map((tab) => ({
      id: tab.id,
      label: tab.label,
      sub: tab.meta,
      dot: STATUS_DOT[tab.status],
      tag: STATUS_TAG[tab.status],
      danger: tab.status === 'needs-input',
    })),
  ]

  const currentLabel = active === 'main' ? 'main' : (tabs.find((tab) => tab.id === active)?.label ?? 'main')

  return (
    <div className={s.streamBar}>
      <button
        type="button"
        className={s.selector}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setAnchor({ right: window.innerWidth - rect.right, top: rect.top, bottom: rect.bottom })
        }}
      >
        <span className={s.selectorLabel}>STREAM</span>
        <span className={s.selectorValue}>{currentLabel}</span>
        <Chevron />
      </button>

      {anchor ? (
        <Menu
          title="STREAMS"
          hint="what the output area shows"
          width={280}
          anchor={anchor}
          placement="down"
          options={options}
          selected={active}
          onPick={(id) => {
            onPick(id)
            setAnchor(null)
          }}
          onClose={() => setAnchor(null)}
        />
      ) : null}
    </div>
  )
}

const Chevron = () => (
  <svg className={s.selectorCaret} viewBox="0 0 10 6" aria-hidden="true">
    <path
      d="M1 1.4 5 5 9 1.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)
```

- [ ] **Step 4: tsc**

Run: `cd webview && pnpm tsc --noEmit`
Expected: `Menu.tsx`/`StatusBar.tsx`/`StreamSwitcher.tsx` — без ошибок. Оставшиеся ошибки — только в `App.tsx` (импортирует ещё удаляемые `StreamsBar`/`AgentsDrawer`), чинится в Task 6.

- [ ] **Step 5: Визуальная проверка Menu не сломался для существующих селекторов**

Run: `cd webview && pnpm dev`, открыть харнесс, любой сценарий, кликнуть по `MODEL`/`EFFORT`/`MODE` в нижней строке.
Expected: меню по-прежнему открывается вверх от кнопки, без точек перед пунктами (у них `dot` не задан) — визуально не изменилось.

- [ ] **Step 6: Commit**

```bash
git add webview/src/components/Menu.tsx webview/src/components/StatusBar.tsx webview/src/components/StreamSwitcher.tsx webview/src/components/shell.module.css
git commit -m "feat(webview): add StreamSwitcher dropdown on top of the existing Menu popover"
```

---

### Task 6: App.tsx — свести всё воедино, удалить StreamsBar/AgentsDrawer

**Files:**
- Delete: `webview/src/components/StreamsBar.tsx`, `webview/src/components/AgentsDrawer.tsx`
- Modify: `webview/src/App.tsx`

**Interfaces:**
- Consumes: всё из Task 2 (`TaskItem.log`, `PermItem.taskId`, `AskItem.taskId`), Task 4 (`AgentStreamView`), Task 5 (`StreamSwitcher`, `AgentTab`, `AgentStatus`).
- Produces: рабочий `activeStream`, переключающий содержимое `.body`; `hiddenTaskIds`, скрывающий завершённую пачку агентов перед следующим сообщением в main.

- [ ] **Step 1: Удалить мёртвые компоненты**

```bash
git rm webview/src/components/StreamsBar.tsx webview/src/components/AgentsDrawer.tsx
```

- [ ] **Step 2: Импорты**

В `App.tsx` заменить (строки 4, 19):

```ts
import { AgentsDrawer, type AgentCard } from './components/AgentsDrawer'
```
и
```ts
import { StreamsBar, type Stream } from './components/StreamsBar'
```

на:

```ts
import { AgentStreamView } from './components/AgentStreamView'
```
и (в алфавитном порядке импортов компонентов, там же где была `StreamsBar`):
```ts
import { StreamSwitcher, type AgentStatus, type AgentTab } from './components/StreamSwitcher'
```

- [ ] **Step 3: Состояние — hiddenTaskIds вместо drawerOpen**

Строка 92 (`const [drawerOpen, setDrawerOpen] = useState(false)`) заменить на:

```ts
  /**
   * Завершённая пачка агентов пропадает из дропдауна не мгновенно (мигнуло бы
   * до того, как успел посмотреть), а перед следующим сообщением в main — см.
   * clearFinishedAgents. Живёт здесь, а не в PanelState: durable-лог событий
   * ничего не теряет, скрытие — чисто отображение.
   */
  const [hiddenTaskIds, setHiddenTaskIds] = useState<Set<string>>(new Set())
```

Строка 93 (`const [activeStream, setActiveStream] = useState('main')`) — оставить как есть.

- [ ] **Step 4: permission-сообщение — прокинуть taskId**

В `subscribe`-колбэке, case `'permission'` (строки 296-307):

```ts
          case 'permission':
            dispatchPanel({
              session: message.sessionId,
              action: {
                kind: 'permission',
                id: message.id,
                target: message.target,
                command: message.command,
                mode: message.mode,
                taskId: message.agentId,
              },
            })
            break
```

- [ ] **Step 5: clearFinishedAgents — скрыть завершённую пачку перед новым сообщением**

Добавить рядом с остальными вспомогательными функциями компонента, сразу после определения `panelsRef` (после строки 151, `panelsRef.current = panels`):

```ts
  /**
   * Перед тем как реально уйдёт новое сообщение в main, прячем из дропдауна всех
   * агентов, которые к этому моменту уже закончили работу — иначе за длинную
   * сессию там накопился бы длинный хвост ненужного. Ещё не завершённого агента
   * не трогаем: он не должен пропадать сам по себе, только когда закончит.
   */
  const clearFinishedAgents = (session: string) => {
    const items = panelsRef.current[session]?.items ?? []
    const finishedIds = items
      .filter((item): item is TaskItem => item.kind === 'task' && !item.pending)
      .map((item) => item.id)
    if (finishedIds.length === 0) return

    setHiddenTaskIds((current) => {
      const next = new Set(current)
      for (const id of finishedIds) next.add(id)
      return next
    })
    setActiveStream((current) => (finishedIds.includes(current) ? 'main' : current))
  }
```

Вызвать её в трёх местах, где реально уходит новое сообщение в main (не в момент постановки в очередь — сама постановка в очередь батч не завершает):

В `submit()`, прямо перед `dispatchPanel({ session: active, action: { kind: 'prompt', ... } })` (строка 600, ветка после `if (running) { ...; return }`):

```ts
    clearFinishedAgents(active)

    dispatchPanel({
      session: active,
      action: { kind: 'prompt', tokens, quotes: quotes.map((quote) => quote.text) },
    })
```

В `useEffect`, который разбирает очередь (строки 362-374), сразу после `if (!next) return`:

```ts
  useEffect(() => {
    if (running || queue.length === 0) return

    const [next, ...rest] = queue
    if (!next) return

    clearFinishedAgents(active)
    setQueue(rest)
    dispatchPanel({
      session: active,
      action: { kind: 'prompt', tokens: [{ kind: 'text', value: next.text }], quotes: [] },
    })
    send({ type: 'prompt', sessionId: active, text: next.text, images: next.images })
  }, [running, queue, active])
```

В `runMcpCommand` (строки 639-656), в ветке `else` перед `dispatchPanel`:

```ts
      if (running) {
        setQueue((current) => [...current, { id: `q-${Date.now()}`, text, attach: '', images: [] }])
      } else {
        clearFinishedAgents(active)
        dispatchPanel({
          session: active,
          action: { kind: 'prompt', tokens: [{ kind: 'text', value: text }], quotes: [] },
        })
        send({ type: 'prompt', sessionId: active, text })
      }
```

- [ ] **Step 6: Заменить buildStreams/buildAgents на статус-селекторы**

Удалить `buildStreams`/`buildAgents` целиком (строки 1102-1131) и заменить на:

```ts
const statusOf = (task: TaskItem, items: FeedItem[], answeredAsks: string[]): AgentStatus => {
  if (!task.pending) return 'done'

  const blocked = items.some(
    (item) =>
      (item.kind === 'perm' && item.taskId === task.id && item.decision === null) ||
      (item.kind === 'ask' && item.taskId === task.id && !answeredAsks.includes(item.id)),
  )
  return blocked ? 'needs-input' : 'running'
}

const mainStatusOf = (panel: PanelState, answeredAsks: string[]): AgentStatus => {
  const blocked = panel.items.some(
    (item) =>
      (item.kind === 'perm' && item.taskId === undefined && item.decision === null) ||
      (item.kind === 'ask' && item.taskId === undefined && !answeredAsks.includes(item.id)),
  )
  if (blocked) return 'needs-input'
  return panel.status === 'running' ? 'running' : 'idle'
}

/** Пачка, скрытая clearFinishedAgents, из дропдауна пропадает — сама история никуда не делась. */
const buildAgentTabs = (panel: PanelState, answeredAsks: string[], hiddenTaskIds: Set<string>): AgentTab[] =>
  panel.items
    .filter((item): item is TaskItem => item.kind === 'task' && !hiddenTaskIds.has(item.id))
    .map((task) => ({
      id: task.id,
      label: `agent:${task.target}`,
      meta: task.meta,
      status: statusOf(task, panel.items, answeredAsks),
    }))
```

- [ ] **Step 7: pendingPermission/pendingAsk — фильтр по активному стриму**

Заменить (строки 1094-1100):

```ts
/** Последний заданный агентом вопрос в текущем стриме, на который ещё не отвечено. */
const pendingAsk = (items: FeedItem[], answered: string[], stream: string): AskItem | undefined =>
  [...items]
    .reverse()
    .find(
      (item): item is AskItem =>
        item.kind === 'ask' &&
        !answered.includes(item.id) &&
        (stream === 'main' ? item.taskId === undefined : item.taskId === stream),
    )

/** Последний вызов текущего стрима, который всё ещё ждёт решения по разрешению. */
const pendingPermission = (items: FeedItem[], stream: string): PermItem | undefined =>
  [...items]
    .reverse()
    .find(
      (item): item is PermItem =>
        item.kind === 'perm' &&
        item.decision === null &&
        (stream === 'main' ? item.taskId === undefined : item.taskId === stream),
    )
```

- [ ] **Step 8: useMemo для вкладок**

Заменить (строки 658-659):

```ts
  const streams = useMemo(() => buildStreams(panel), [panel])
  const agents = useMemo(() => buildAgents(panel), [panel])
```

на:

```ts
  const agentTabs = useMemo(
    () => buildAgentTabs(panel, cards.answeredAsks, hiddenTaskIds),
    [panel, cards.answeredAsks, hiddenTaskIds],
  )
  const mainStatus = useMemo(() => mainStatusOf(panel, cards.answeredAsks), [panel, cards.answeredAsks])
```

- [ ] **Step 9: JSX — StreamSwitcher вместо StreamsBar, Feed/AgentStreamView по стриму, панели по стриму**

Заменить (строки 810-832):

```tsx
        <StreamSwitcher tabs={agentTabs} mainStatus={mainStatus} active={activeStream} onPick={setActiveStream} />

        <div className={s.body}>
          {activeStream === 'main' ? (
            <Feed
              items={panel.items}
              streamingText={panel.streamingText}
              streaming={running}
              streamStatus={streamStatus(panel, cards)}
              errors={panel.errors}
              cards={cards}
              scrollRef={(element) => {
                feedRef.current = element
              }}
              onScroll={clearSelection}
              onPlanDecision={decidePlan}
              onDismissError={(index) => dispatchPanel({ session: active, action: { kind: 'dismissError', index } })}
            />
          ) : (
            <AgentStreamView
              item={panel.items.find((item): item is TaskItem => item.kind === 'task' && item.id === activeStream)}
            />
          )}

          {selection && activeStream === 'main' ? (
```

(Дальше блок `<SelectionMenu .../>` и его закрывающий `) : null}` — без изменений по содержимому, только условие рендера получило `&& activeStream === 'main'`, как показано выше.)

Заменить (строки 859-866, начало `composer.dock`):

```tsx
        <div className={composer.dock}>
          <PermissionPanel item={pendingPermission(panel.items, activeStream)} onDecide={decidePermission} />

          <AskPanel
            key={pendingAsk(panel.items, cards.answeredAsks, activeStream)?.id ?? 'none'}
            item={pendingAsk(panel.items, cards.answeredAsks, activeStream)}
            onSubmit={sendAnswers}
          />
```

- [ ] **Step 10: Убрать AgentsDrawer из JSX**

Удалить блок (строки 968-977):

```tsx
      {drawerOpen ? (
        <AgentsDrawer
          agents={agents}
          onFocus={(id) => {
            setActiveStream(id)
            setDrawerOpen(false)
          }}
          onClose={() => setDrawerOpen(false)}
        />
      ) : null}
```

- [ ] **Step 11: tsc и vitest всего webview**

Run: `cd webview && pnpm tsc --noEmit && pnpm vitest run`
Expected: PASS целиком, без единой ошибки — это первая точка после Task 2, где весь webview компилируется снова.

- [ ] **Step 12: Визуальная проверка живым сценарием**

Run: `cd webview && pnpm dev` (если не запущен), открыть `http://localhost:5173/harness.html`.
- Сценарий `todo-list` (без агентов) — убедиться, что дропдаун стрима НЕ появляется вообще.
- Сценарий `subagent-task`, чекпоинт «Task: запуск субагента Explore» — дропдаун появился, показывает `main` и `agent:Explore` с точкой RUNNING; клик по `agent:Explore` показывает шапку и растущий лог, композер остаётся рабочим и всё ещё шлёт в main.
- Сценарий `multiple-agents`, чекпоинт «Task ×2» — оба агента видны в дропдауне одновременно, у обоих RUNNING.
Expected: все три пункта подтверждаются глазами, без консольных ошибок в DevTools.

- [ ] **Step 13: Commit**

```bash
git add webview/src/App.tsx
git rm webview/src/components/StreamsBar.tsx webview/src/components/AgentsDrawer.tsx 2>/dev/null || true
git commit -m "feat(webview): wire StreamSwitcher end to end, drop StreamsBar/AgentsDrawer"
```

---

### Task 7: Харнесс — сценарии на needs-input и очистку пачки

**Files:**
- Modify: `webview/src/harness/scenarios/cards.ts`

**Interfaces:**
- Consumes: `shell`, `agent`, `user`, `wait`, `checkpoint`, `scenario`, `subagentText`, `toolResult`, `textReply`, `turnResult`, `SESSION` (все уже существуют в `../events`).

- [ ] **Step 1: Новый сценарий — параллельный агент ждёт разрешения**

В `webview/src/harness/scenarios/cards.ts`, сразу после сценария `multiple-agents` (после строки 677, `]),`, перед закрывающей `]` массива `scenariosCards`) добавить:

```ts
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
```

- [ ] **Step 2: Расширить multiple-agents — демонстрация очистки пачки**

В том же файле, в существующем сценарии `multiple-agents`, после последнего чекпоинта («Готовый ответ», строки 673-676) добавить ещё один — тот же массив `checkpoint(...)`, просто новый элемент перед закрывающей `]),` сценария:

```ts
    checkpoint('Готовый ответ', [
      ...textReply('Оба ревью закончились — по фронту пара мелочей, бэк чист.'),
      turnResult(8500),
    ]),
    checkpoint('Следующее сообщение — завершённая пачка пропадает из дропдауна', [
      user('Отлично, теперь обнови README с находками'),
      wait(400),
    ]),
  ]),
```

- [ ] **Step 3: tsc**

Run: `cd webview && pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Визуальная проверка обоих сценариев**

Run: `cd webview && pnpm dev` (если не запущен), `http://localhost:5173/harness.html`.

- `multiple-agents-permission`, последний чекпоинт: дропдаун показывает `agent:react-architecture` — RUNNING, `agent:nest-architecture` — NEEDS INPUT (жёлтая точка). На вкладке `main` и на вкладке фронтового агента панели разрешения нет. На вкладке `agent:nest-architecture` — панель разрешения пришпилена над полем ввода, с настоящими кнопками; нажать «Allow once» — панель пропадает, статус в дропдауне переключается на DONE (после её собственного tool-result можно было бы дожать сценарий вручную, но это не обязательно для проверки самого статуса).
- `multiple-agents`, последний чекпоинт: до него в дропдауне два агента (DONE/DONE), после чекпоинта дропдаун снова скрыт (пуст).

Expected: оба пункта подтверждаются глазами.

- [ ] **Step 5: Commit**

```bash
git add webview/src/harness/scenarios/cards.ts
git commit -m "test(harness): add scenarios for per-agent needs-input status and batch clearing"
```

---

### Task 8: Финальная проверка всего диффа

**Files:** нет новых изменений — только верификация уже сделанного.

- [ ] **Step 1: Полный прогон webview**

Run: `cd webview && pnpm tsc --noEmit && pnpm vitest run && pnpm build`
Expected: всё зелёное; `pnpm build` включает проверку `! grep -rqil harness dist` — падать не должен, поскольку харнесс живёт только за `import.meta.env.DEV` и статически вырезается Vite.

- [ ] **Step 2: Дословная чистка мёртвого кода по всему диффу**

Run: `cd webview && git diff --stat main` (или сравнить с базовой веткой, с которой начиналась работа), пройтись по каждому изменённому файлу глазами на предмет:
- неиспользуемых импортов (`ToolItem`/`TaskItem`/др. в `Feed.tsx`, `App.tsx`);
- CSS-классов из `shell.module.css`/`feed.module.css`, на которые после Task 4/5 не осталось ссылок (`.gaugeTrack`/`.gaugeFill` уже были нерабочими и ушли вместе с `AgentsDrawer.tsx`; перепроверить, что `grep -rn "className={s\.<имя>}"` не находит новых сирот).
Expected: список пуст либо все находки уже учтены в задачах выше.

- [ ] **Step 3: Kotlin — финальная сборка**

Run: `./gradlew compileKotlin` из корня репозитория.
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Живая проверка в песочнице**

Run: `./scripts/sandbox.sh` из корня репозитория (долгая команда — дождаться, не считать зависшей). В открывшейся тестовой IDE запустить реальный ход с `Task`, довести субагента до вызова `Bash`/другого watched-инструмента в проекте без `bypassPermissions`/`acceptEdits`.
Expected: permission-запрос от субагента виден в его собственной вкладке дропдауна (не смешивается с запросом главного потока, если такой тоже есть параллельно), статус в дропдауне — NEEDS INPUT, после решения — RUNNING/DONE по факту.

- [ ] **Step 5: Итоговый commit (если что-то поправлено на этом шаге)**

Если шаги 1-4 ничего не поменяли — коммитить нечего, задача на этом закрыта. Если по ходу проверки что-то подчищено — обычный коммит с тем, что реально изменилось:

```bash
git add -A
git commit -m "chore(webview): final cleanup pass after subagent flow redesign"
```
