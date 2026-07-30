# Сворачиваемая группа вызовов инструментов в ленте — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подряд идущие вызовы обычных инструментов в ленте webview-панели сворачиваются в одну карточку — свёрнута по умолчанию, во время работы показывает текущий вызов, после хода показывает «N tools · время», по клику разворачивается в привычный список.

**Architecture:** Новый вид элемента ленты `ToolGroupItem` в общей модели данных (`webview/src/feed/types.ts`), собирается редьюсером ленты (`webview/src/feed/build.ts`) по тому же принципу, что уже применяется к одиночным вызовам и подагентам (собственное отслеживание времени начала/конца через `state.startedAt`). Рендерится новым компонентом `ToolGroupCard`, который при единственном вложенном вызове рендерит существующий `ToolCard` напрямую (без рамки группы), а при двух и более — раскрывающийся список тех же `ToolCard`.

**Tech Stack:** React 19 + TypeScript, Vite/Vitest, CSS Modules — существующий стек `webview/`, без новых зависимостей.

## Global Constraints

- Спека: `docs/superpowers/specs/2026-07-30-collapsible-tool-calls-design.md` — при расхождении плана со спекой ориентир спека.
- В группу попадают только карточки, которые сегодня рисуются как `ToolItem` (чипы `THINK/READ/GREP/EDIT/WRITE/BASH/WEB/MCP/TOOL`). `TodoWrite`, `Task`/`Agent`, `ExitPlanMode`, `AskUserQuestion`, запрос разрешения — не группируются, остаются как есть.
- Группа не заводится (визуально) для одиночного вызова: при `tools.length === 1` рендерится тот же самый `ToolCard`, без обёртки.
- Цепочку группы рвёт только появление НЕ-инструмента между вызовами — не пауза между внутренними шагами хода (см. спеку, раздел «Логика сборки ленты»).
- Терминология счётчика — «tools», не «tool calls» (как уже принято в статус-строке `streamStatus`).
- Новых зависимостей и новой тестовой инфраструктуры не добавляем — в репозитории нет `@testing-library`, компонентных рендер-тестов не заводим (см. спеку, раздел «Проверка»).
- Каждый файл, который трогаем, редактируем точечно — не переписываем стили/поведение соседних, не тронутых этой задачей карточек (`TodoWrite`/`Task`/`Plan`/`Ask`/`Permission`).

---

## Task 1: Модель данных и сборка группы в редьюсере ленты

**Files:**
- Modify: `webview/src/feed/types.ts:83-99` (после `ToolItem`), `webview/src/feed/types.ts:198-210` (union `FeedItem`)
- Modify: `webview/src/feed/build.ts` (импорты; `applyAssistant`; новый хелпер группировки; `applyToolUse`; `applyToolResults`; `tickDurations`; `applyProcessExited`)
- Test: `webview/src/feed/build.test.ts`

**Interfaces:**
- Produces: `ToolGroupItem` — `{ id: string; kind: 'toolGroup'; tools: ToolItem[]; pending: boolean; duration: string }`, экспортируется из `webview/src/feed/types.ts`. `FeedItem` включает `ToolGroupItem` вместо `ToolItem` на верхнем уровне; `ToolItem` остаётся экспортированным типом и используется только как тип элементов `tools`.
- Дальше этим типом и этой формой данных (`state.items` больше никогда не содержит `kind: 'tool'` напрямую — только внутри `toolGroup.tools`) пользуется Task 2.

- [ ] **Step 1: Добавить тип `ToolGroupItem` и завести его в `FeedItem`**

В `webview/src/feed/types.ts` после интерфейса `ToolItem` (сразу после закрывающей `}` на строке 99, перед `export interface TaskItem`) добавить:

```ts
export interface ToolGroupItem {
  id: string
  kind: 'toolGroup'
  /** Подряд идущие вызовы обычных инструментов, без разрывов текстом или другой карточкой. */
  tools: ToolItem[]
  /** Есть ли внутри хотя бы один ещё не завершившийся вызов. */
  pending: boolean
  /** Точное время от создания группы до последнего результата; пока pending — тикает. */
  duration: string
}
```

В объединении `FeedItem` (строки 198-210) заменить `| ToolItem` на `| ToolGroupItem`:

```ts
export type FeedItem =
  | UserItem
  | TextItem
  | ToolGroupItem
  | TaskItem
  | TodoItem
  | PlanItem
  | PermItem
  | AskItem
  | CheckpointItem
  | CompactItem
  | MetaItem
  | CrashItem
```

- [ ] **Step 2: Обновить и добавить тесты сборки — красные**

В `webview/src/feed/build.test.ts`:

1. В импорте типов (строка 6) добавить `ToolGroupItem`:

```ts
import type { TextItem, ToolGroupItem, ToolItem } from './types'
```

2. Заменить тест «превращает вызов инструмента в карточку с результатом» (строки 33-47) — вызовы теперь лежат внутри групп:

```ts
  it('превращает вызов инструмента в карточку с результатом', () => {
    const state = play(streamEvents())
    const tools = state.items
      .filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      .flatMap((group) => group.tools)

    expect(tools.length).toBeGreaterThan(0)

    const read = tools.find((tool) => tool.chip === 'READ')
    expect(read).toBeDefined()
    expect(read?.pending).toBe(false)
    expect(read?.isError).toBe(false)
    expect(read?.target).toBe('package.json')
    expect(read?.meta).toContain('lines')
    expect(read?.detail.length).toBeGreaterThan(0)
    expect(read?.duration).toMatch(/s$/)
  })
```

3. Перед `describe('сборка ленты из потока агента', ...)` (после блока `play`, то есть после строки 19) добавить хелперы событий:

```ts
const toolUseEvent = (id: string, name: string, input: unknown = {}): AgentEvent => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id, name, input }] },
})

const toolResultEvent = (id: string, content = 'ok'): AgentEvent => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: id, content }] },
})

const textEvent = (text: string): AgentEvent => ({
  type: 'assistant',
  message: { content: [{ type: 'text', text }] },
})
```

4. Внутри `describe('сборка ленты из потока агента', ...)`, после последнего существующего теста (перед закрывающей строкой 88 `})`), добавить новый вложенный `describe`:

```ts
  describe('группировка вызовов инструментов', () => {
    it('собирает подряд идущие вызовы в одну группу, даже через паузу между внутренними шагами хода', () => {
      let state = play([toolUseEvent('t1', 'Read', { file_path: 'a.ts' })])
      state = play([toolResultEvent('t1', 'line 1')], state)
      // t1 уже разрешился — группа на мгновение стала pending:false, но следующий
      // вызов идёт без единого текстового блока между ними и должен лечь в ту же группу.
      state = play([toolUseEvent('t2', 'Bash', { command: 'ls' })], state)
      state = play([toolResultEvent('t2', 'ok')], state)

      const groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.tools.map((tool) => tool.toolName)).toEqual(['Read', 'Bash'])
      expect(groups[0]?.pending).toBe(false)
      expect(groups[0]?.duration).toMatch(/s$/)
    })

    it('текст между вызовами открывает новую группу', () => {
      let state = play([toolUseEvent('t1', 'Read', { file_path: 'a.ts' })])
      state = play([toolResultEvent('t1', 'line 1')], state)
      state = play([textEvent('Нашёл файл.')], state)
      state = play([toolUseEvent('t2', 'Bash', { command: 'ls' })], state)
      state = play([toolResultEvent('t2', 'ok')], state)

      const groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(2)
      expect(groups[0]?.tools).toHaveLength(1)
      expect(groups[1]?.tools).toHaveLength(1)
    })

    it('включает мысль модели в ту же группу, что и вызов рядом', () => {
      let state = play([
        { type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'Надо посмотреть файл.' }] } },
      ])
      state = play([toolUseEvent('t1', 'Read', { file_path: 'a.ts' })], state)
      state = play([toolResultEvent('t1', 'line 1')], state)

      const groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.tools.map((tool) => tool.chip)).toEqual(['THINK', 'READ'])
    })

    it('закрывает незавершённые вызовы внутри группы при обрыве сессии', () => {
      let state = play([toolUseEvent('t1', 'Read', { file_path: 'a.ts' })])
      state = play([toolResultEvent('t1', 'line 1')], state)
      state = play([toolUseEvent('t2', 'Bash', { command: 'ls' })], state)

      state = reducePanel(state, { kind: 'processExited', exitCode: 1 }, 1_700_000_005_000)

      const groups = state.items.filter((item): item is ToolGroupItem => item.kind === 'toolGroup')
      expect(groups).toHaveLength(1)
      expect(groups[0]?.pending).toBe(false)
      expect(groups[0]?.tools.at(-1)?.isError).toBe(true)
      expect(groups[0]?.tools.at(-1)?.meta).toBe('· interrupted')
      expect(state.crashed).toBe(true)
    })
  })
```

- [ ] **Step 3: Запустить тесты — убедиться, что новые красные**

Run: `cd webview && pnpm vitest run src/feed/build.test.ts`
Expected: FAIL — новые тесты про `toolGroup` падают (в ленте до сих пор нет элементов `kind: 'toolGroup'`, только плоские `kind: 'tool'`); тест «превращает вызов инструмента…» тоже падает (fetches groups, которых ещё нет).

- [ ] **Step 4: Реализовать группировку в редьюсере**

В `webview/src/feed/build.ts`:

1. В импорт типов (строки 11-19) добавить `ToolGroupItem`:

```ts
import type {
  AskQuestion,
  FeedItem,
  PlanStep,
  TaskItem,
  TodoEntry,
  ToolGroupItem,
  ToolItem,
  UserToken,
} from './types'
```

2. Перед функцией `applyToolUse` (то есть прямо перед строкой `const applyToolUse = (state: PanelState, block: ToolUseBlock, now: number): PanelState => {`) добавить два новых хелпера:

```ts
/**
 * Подряд идущие вызовы обычных инструментов складываются в одну группу, пока их
 * не прервёт что-то другое (текст, todo, план, вопрос, задача субагента). Между
 * внутренними шагами одного агентского хода группа может на мгновение полностью
 * разрешиться и тут же продолжиться следующим вызовом без единого текстового
 * блока между ними — это тот самый непрерывный «взрыв» вызовов, который и должен
 * остаться одной группой. Поэтому смотрим только на то, чем был последний
 * элемент ленты, а не на его pending.
 */
const appendToolCall = (state: PanelState, tool: ToolItem, now: number): PanelState => {
  const last = state.items.at(-1)

  if (last?.kind === 'toolGroup') {
    const group: ToolGroupItem = { ...last, tools: [...last.tools, tool], pending: true }
    return {
      ...state,
      startedAt: { ...state.startedAt, [tool.id]: now },
      items: [...state.items.slice(0, -1), group],
    }
  }

  const group: ToolGroupItem = { id: `g-${tool.id}`, kind: 'toolGroup', tools: [tool], pending: true, duration: '' }
  return {
    ...state,
    startedAt: { ...state.startedAt, [tool.id]: now, [group.id]: now },
    items: [...state.items, group],
  }
}

/** То же самое, что push, но для вызова инструмента — уходит в группу, а не прямо в items. */
const pushTool = (state: PanelState, make: (id: string) => ToolItem, now: number): PanelState => {
  const tool = make(`i-${state.seq}`)
  return { ...appendToolCall(state, tool, now), seq: state.seq + 1 }
}
```

3. В `applyAssistant` заменить ветку `block.type === 'thinking'` (строки 543-560):

```ts
    if (block.type === 'thinking') {
      if (!block.thinking.trim()) continue
      next = pushTool(next, (id) => ({
        id,
        kind: 'tool',
        chip: 'THINK',
        toolName: 'Thinking',
        input: undefined,
        target: 'Thought',
        meta: '',
        duration: '',
        detail: block.thinking.split('\n').map((text) => ({ text, tone: 'dim' as const })),
        hunks: [],
        isError: false,
        pending: false,
      }), now)
      continue
    }
```

4. В `applyToolUse` заменить последний `return` (финальная ветка после проверки `Task`/`Agent`, строки 641-662):

```ts
  const tool: ToolItem = {
    id: block.id,
    kind: 'tool',
    chip: chipFor(block.name),
    toolName: block.name,
    input,
    target: targetFor(block.name, input, workingDirectory),
    meta: '',
    duration: '',
    detail: [],
    hunks: [],
    isError: false,
    pending: true,
  }

  return appendToolCall(state, tool, now)
```

5. Заменить всю функцию `applyToolResults` (строки 664-711):

```ts
const applyToolResults = (state: PanelState, blocks: ContentBlock[], now: number): PanelState => {
  const results = blocks.filter((block): block is ToolResultBlock => block.type === 'tool_result')
  if (results.length === 0) return state

  const startedAt = { ...state.startedAt }

  const resolveTool = (item: ToolItem): ToolItem => {
    const result = results.find((candidate) => candidate.tool_use_id === item.id)
    if (!result) return item

    const started = state.startedAt[item.id]
    const duration = started ? formatDuration(now - started) : ''
    delete startedAt[item.id]

    const text = resultToText(result.content)
    const isError = result.is_error === true
    const hunks = hunksFor(item.id, item.toolName, item.input, text)

    return {
      ...item,
      pending: false,
      isError,
      duration,
      meta: metaFor(item.toolName, item.input, text, isError),
      // При диффе сырой ответ инструмента не показываем: он повторяет то же самое
      // строками вида «файл обновлён» и куском кода вокруг правки.
      detail: hunks.length > 0 ? [] : detailFor(text),
      hunks,
    }
  }

  const items = state.items.map((item) => {
    if (item.kind === 'task') {
      const result = results.find((candidate) => candidate.tool_use_id === item.id)
      if (!result) return item

      const started = state.startedAt[item.id]
      const duration = started ? formatDuration(now - started) : ''
      delete startedAt[item.id]

      const text = resultToText(result.content)
      const task: TaskItem = { ...item, pending: false, percent: 100, duration, detail: detailFor(text) }
      return task
    }

    if (item.kind !== 'toolGroup') return item

    const tools = item.tools.map(resolveTool)
    const pending = tools.some((tool) => tool.pending)

    if (item.pending && !pending) {
      const started = state.startedAt[item.id]
      const duration = started ? formatDuration(now - started) : item.duration
      delete startedAt[item.id]
      return { ...item, tools, pending, duration }
    }

    return { ...item, tools, pending }
  })

  return { ...state, items, startedAt }
}
```

6. Заменить тело `tickDurations` (строки 250-265):

```ts
const tickDurations = (state: PanelState, now: number): PanelState => {
  if (Object.keys(state.startedAt).length === 0) return state

  let changed = false

  const items = state.items.map((item) => {
    if (item.kind === 'task') {
      if (!item.pending) return item
      const started = state.startedAt[item.id]
      if (!started) return item
      changed = true
      return { ...item, duration: formatDuration(now - started) }
    }

    if (item.kind !== 'toolGroup' || !item.pending) return item

    const tools = item.tools.map((tool) => {
      if (!tool.pending) return tool
      const started = state.startedAt[tool.id]
      if (!started) return tool
      changed = true
      return { ...tool, duration: formatDuration(now - started) }
    })

    const groupStarted = state.startedAt[item.id]
    if (!groupStarted) return { ...item, tools }

    changed = true
    return { ...item, tools, duration: formatDuration(now - groupStarted) }
  })

  return changed ? { ...state, items } : state
}
```

7. Заменить тело `applyProcessExited` (строки 267-324) — сигнатура функции не меняется, меняется только всё, что между `const startedAt = { ...state.startedAt }` и финальным `return`:

```ts
const applyProcessExited = (state: PanelState, exitCode: number, now: number): PanelState => {
  const startedAt = { ...state.startedAt }

  const closeTool = (tool: ToolItem): ToolItem => {
    if (!tool.pending) return tool

    const started = startedAt[tool.id]
    delete startedAt[tool.id]
    const duration = started ? formatDuration(now - started) : tool.duration

    return {
      ...tool,
      pending: false,
      isError: true,
      duration,
      meta: '· interrupted',
      detail: [
        ...tool.detail,
        { text: 'Claude Code stopped responding before this finished.', tone: 'bad' as const },
      ],
    }
  }

  const items = state.items.map((item) => {
    if (item.kind === 'task') {
      if (!item.pending) return item

      const started = startedAt[item.id]
      delete startedAt[item.id]
      const duration = started ? formatDuration(now - started) : item.duration

      return {
        ...item,
        pending: false,
        duration,
        detail: [...item.detail, { text: 'Session ended before this returned.', tone: 'bad' as const }].slice(-6),
      }
    }

    if (item.kind !== 'toolGroup' || !item.pending) return item

    const tools = item.tools.map(closeTool)
    const started = startedAt[item.id]
    delete startedAt[item.id]
    const duration = started ? formatDuration(now - started) : item.duration

    return { ...item, tools, pending: false, duration }
  })

  return {
    ...state,
    status: 'idle',
    streamingText: '',
    crashed: true,
    stopRequestedAt: undefined,
    startedAt,
    seq: state.seq + 1,
    items: [
      ...items,
      {
        id: `crash-${state.seq}`,
        kind: 'crash',
        message:
          exitCode === 0
            ? 'Claude Code stopped unexpectedly.'
            : `Claude Code stopped unexpectedly (exit code ${exitCode}).`,
      },
    ],
  }
}
```

- [ ] **Step 5: Запустить тесты — все зелёные**

Run: `cd webview && pnpm vitest run src/feed/build.test.ts`
Expected: PASS — все тесты, включая новые из `describe('группировка вызовов инструментов', ...)`.

- [ ] **Step 6: Коммит**

```bash
git add webview/src/feed/types.ts webview/src/feed/build.ts webview/src/feed/build.test.ts
git commit -m "feat(webview): group consecutive tool calls into one feed item"
```

---

## Task 2: Отображение группы и починка счётчика в статус-строке

**Files:**
- Modify: `webview/src/components/items/ToolCard.tsx:4` (экспорт `CHIP_CLASS`)
- Create: `webview/src/components/items/ToolGroupCard.tsx`
- Modify: `webview/src/components/feed.module.css` (новая секция стилей после строки 443)
- Modify: `webview/src/components/Feed.tsx` (`lastPendingId`, `ItemView`, импорты)
- Modify: `webview/src/App.tsx:1005-1010` (`streamStatus`)

**Interfaces:**
- Consumes: `ToolGroupItem`, `ToolItem` из `webview/src/feed/types.ts` (Task 1); `CardState` из `webview/src/hooks/useCardState.ts` (`isOpen(id): boolean`, `toggle(id): void`, `appliedHunks: string[]`, `applyHunk(id): void`, `rejectHunk(id): void`).
- Produces: `ToolGroupCard(props: { item: ToolGroupItem; cards: CardState; awaitingPermissionId: string | undefined })`.

- [ ] **Step 1: Экспортировать `CHIP_CLASS` из `ToolCard.tsx`**

В `webview/src/components/items/ToolCard.tsx` строку 4 заменить с:

```ts
const CHIP_CLASS: Record<ToolChip, string> = {
```

на:

```ts
export const CHIP_CLASS: Record<ToolChip, string> = {
```

- [ ] **Step 2: Добавить алиасы стилей группы в `feed.module.css`**

В `webview/src/components/feed.module.css` после блока `.detailBad` (строки 441-443) и перед секцией `/* --- Дифф ------ */` (строка 445) вставить:

```css
/* --- Группа вызовов инструментов -------------------------------------------- */

.toolGroup {
  composes: tool;
}

.toolGroupHead {
  composes: toolHead;
}

.toolGroupBody {
  composes: toolBody;
}
```

- [ ] **Step 3: Создать `ToolGroupCard.tsx`**

Создать файл `webview/src/components/items/ToolGroupCard.tsx`:

```tsx
import type { ToolGroupItem } from '../../feed/types'
import type { CardState } from '../../hooks/useCardState'
import s from '../feed.module.css'
import { CHIP_CLASS, ToolCard } from './ToolCard'

interface ToolGroupCardProps {
  item: ToolGroupItem
  cards: CardState
  /** id вызова, который прямо сейчас ждёт твоего решения — если такой есть среди детей группы. */
  awaitingPermissionId: string | undefined
}

export const ToolGroupCard = ({ item, cards, awaitingPermissionId }: ToolGroupCardProps) => {
  // Один вызов подряд — рисуем его как обычную одиночную карточку, без рамки
  // группы: сворачивать нечего, а лишняя стрелочка только мешала бы.
  if (item.tools.length === 1) {
    const tool = item.tools[0]!
    return (
      <ToolCard
        item={tool}
        open={cards.isOpen(tool.id)}
        appliedHunks={cards.appliedHunks}
        awaitingPermission={tool.id === awaitingPermissionId}
        onToggle={() => cards.toggle(tool.id)}
        onAcceptHunk={cards.applyHunk}
        onRejectHunk={cards.rejectHunk}
      />
    )
  }

  const open = cards.isOpen(item.id)
  const current = item.tools.at(-1)!
  const currentAwaited = current.id === awaitingPermissionId

  return (
    <div className={s.toolGroup}>
      <button type="button" className={s.toolGroupHead} onClick={() => cards.toggle(item.id)}>
        <span className={`${s.caret} ${open ? s.caretOpen : ''}`}>▶</span>

        {item.pending ? (
          <>
            <span className={`${s.toolChip} ${CHIP_CLASS[current.chip]}`}>{current.chip}</span>
            <span className={s.toolTarget}>{current.target}</span>
            <span className={`${s.toolMeta} ${currentAwaited ? s.waiting : s.running}`}>
              {currentAwaited ? '· waiting for you' : '· running'}
            </span>
          </>
        ) : (
          <span className={s.toolTarget}>{item.tools.length} tools</span>
        )}

        <div className={s.spacer} />
        {item.pending ? <span className={s.toolMeta}>{item.tools.length} tools</span> : null}
        <span className={s.toolDur}>{item.duration}</span>
      </button>

      {open ? (
        <div className={s.toolGroupBody}>
          {item.tools.map((tool) => (
            <ToolCard
              key={tool.id}
              item={tool}
              open={cards.isOpen(tool.id)}
              appliedHunks={cards.appliedHunks}
              awaitingPermission={tool.id === awaitingPermissionId}
              onToggle={() => cards.toggle(tool.id)}
              onAcceptHunk={cards.applyHunk}
              onRejectHunk={cards.rejectHunk}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Завести группу в `Feed.tsx`**

В `webview/src/components/Feed.tsx`:

1. Заменить импорт `ToolCard` (строка 13) на импорт `ToolGroupCard`:

```ts
import { ToolGroupCard } from './items/ToolGroupCard'
```

(строку `import { ToolCard } from './items/ToolCard'` удалить — она больше не используется в этом файле)

2. Заменить вычисление `lastPendingId` (строки 55-58):

```ts
  const awaitingPermission = items.some((item) => item.kind === 'perm' && item.decision === null)
  const lastPendingId = awaitingPermission
    ? items
        .flatMap((item) => {
          if (item.kind === 'toolGroup') return item.tools.filter((tool) => tool.pending)
          if (item.kind === 'task' && item.pending) return [item]
          return []
        })
        .at(-1)?.id
    : undefined
```

3. В цикле рендера (строки 138-150) заменить проп `awaitingPermission={item.id === lastPendingId}` на проброс самого `lastPendingId`:

```tsx
        {items.map((item) => (
          <div key={item.id} className={s.row}>
            <ItemView
              item={item}
              cards={cards}
              lastPendingId={lastPendingId}
              onSendAnswers={onSendAnswers}
              onApprovePlan={onApprovePlan}
              onKeepPlanning={onKeepPlanning}
              onPermissionDecision={onPermissionDecision}
            />
          </div>
        ))}
```

4. Заменить `ItemViewProps` (строки 202-211) — вместо предвычисленного булева `awaitingPermission` компонент получает сам `lastPendingId`:

```ts
interface ItemViewProps {
  item: FeedItem
  cards: CardState
  /** id вызова, который сейчас реально ждёт разрешения (или undefined, если ждать нечего). */
  lastPendingId: string | undefined
  onSendAnswers: (answers: string[]) => void
  onApprovePlan: () => void
  onKeepPlanning: () => void
  onPermissionDecision: (id: string, decision: 'once' | 'always' | 'deny') => void
}
```

5. Заменить сигнатуру и тело `ItemView` (строки 213-307):

```tsx
const ItemView = ({
  item,
  cards,
  lastPendingId,
  onSendAnswers,
  onApprovePlan,
  onKeepPlanning,
  onPermissionDecision,
}: ItemViewProps) => {
  switch (item.kind) {
    case 'user':
      return <UserCard item={item} />

    case 'text':
      return <TextCard item={item} />

    case 'toolGroup':
      return <ToolGroupCard item={item} cards={cards} awaitingPermissionId={lastPendingId} />

    case 'task':
      return (
        <TaskCard
          item={item}
          open={cards.isOpen(item.id)}
          awaitingPermission={item.id === lastPendingId}
          onToggle={() => cards.toggle(item.id)}
        />
      )

    case 'todo':
      return (
        <TodoCard
          item={item}
          overrides={todoOverridesFor(cards.todoOverrides, item.id)}
          onToggle={(todoId, next) => cards.setTodo(item.id, todoId, next)}
        />
      )

    case 'plan':
      return (
        <PlanCard
          item={item}
          approved={cards.approvedPlans.includes(item.id)}
          onApprove={() => {
            cards.approvePlan(item.id)
            onApprovePlan()
          }}
          onKeepPlanning={onKeepPlanning}
        />
      )

    case 'perm':
      return (
        <PermissionCard
          item={item}
          // Решение хранится в самом элементе: агент стоит и ждёт именно его,
          // а не состояния карточки в интерфейсе.
          decision={item.decision}
          onDecide={(decision) => onPermissionDecision(item.id, decision)}
        />
      )

    case 'ask':
      return (
        <AskCard
          item={item}
          picks={picksFor(cards.picks, item.id)}
          onPick={(questionId, optionId) => cards.pick(item.id, questionId, optionId)}
          onSubmit={onSendAnswers}
        />
      )

    case 'checkpoint':
      return <CheckpointRow item={item} />

    case 'compact':
      return <CompactRow item={item} />

    case 'meta':
      return <MetaRow item={item} />

    case 'crash':
      return <CrashRow item={item} />
  }
}
```

- [ ] **Step 5: Починить счётчик в `App.tsx`**

В `webview/src/App.tsx` заменить `streamStatus` (строки 1005-1010):

```ts
const streamStatus = (panel: PanelState): string => {
  if (panel.compacting) return 'Compacting context…'

  const last = panel.items.at(-1)
  const tools = last?.kind === 'toolGroup' && last.pending ? last.tools.length : 0
  return tools > 0 ? `Claude is working · ${tools} tools this turn` : 'Claude is thinking'
}
```

- [ ] **Step 6: Проверить типы и весь набор тестов**

Run: `cd webview && pnpm tsc --noEmit && pnpm vitest run`
Expected: PASS — компиляция чистая, все тесты (включая Task 1) зелёные.

- [ ] **Step 7: Коммит**

```bash
git add webview/src/components/items/ToolCard.tsx webview/src/components/items/ToolGroupCard.tsx \
        webview/src/components/feed.module.css webview/src/components/Feed.tsx webview/src/App.tsx
git commit -m "feat(webview): render collapsible tool-call group, fix per-turn tool counter"
```

---

## После выполнения

Полноценная визуальная проверка (как это реально выглядит и сворачивается в живой панели) — через песочницу IDE: `./scripts/sandbox.sh` (или как обычно запускается gradle-песочница плагина). Автоматических component-тестов на это нет по решению из спеки — визуальная сверка ручная, по запросу.
