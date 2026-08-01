import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { send, subscribe } from './bridge'
import { EFFORT_OPTIONS, MODEL_OPTIONS, MODE_OPTIONS, nextMode, normalizeMode, withRefusedMode } from './catalog'
import { AgentStreamView } from './components/AgentStreamView'
import { AskPanel } from './components/AskPanel'
import { Composer } from './components/Composer'
import { Feed } from './components/Feed'
import { Header, type Session, type SessionState } from './components/Header'
import { History } from './components/History'
import { LoginGate, type AuthState } from './components/LoginGate'
import { Mcp } from './components/Mcp'
import { Menu, type MenuOption } from './components/Menu'
import { PermissionPanel } from './components/PermissionPanel'
import { Plugins } from './components/Plugins'
import { Queue, type QueuedPrompt } from './components/Queue'
import { Quotes, type Quote } from './components/Quotes'
import { SelectionMenu } from './components/SelectionMenu'
import { StatusBar, type Anchor, type SelectorKind } from './components/StatusBar'
import { StreamSwitcher, type AgentStatus, type AgentTab } from './components/StreamSwitcher'
import { TaskListPanel } from './components/TaskListPanel'
import composer from './components/composer.module.css'
import s from './components/shell.module.css'
import { contextUsage, formatTokens, initialPanelState, reducePanel, type PanelState } from './feed/build'
import { referenceChip } from './feed/reference'
import { appendChip, appendText, buildCommands, localCommand, plainText } from './feed/slash'
import { composePrompt, imageAttachments } from './feed/tokens'
import type { AskItem, FeedItem, PermItem, TaskItem, TodoItem, UserToken } from './feed/types'
import type {
  AvailablePluginInfo,
  HistoryEntry,
  InstalledPluginInfo,
  McpServerInfo,
  PluginMarketplaceInfo,
  UsageWindow,
} from './protocol'
import { useCardState, type CardState } from './hooks/useCardState'
import { useSelection } from './hooks/useSelection'

const MAIN_SESSION = 'main'

/**
 * Шрифты IDE — прямо в корень документа, а не в состояние React: их читают
 * десятки правил в стилях всех модулей, и гонять такое через пропсы значило бы
 * протащить размер шрифта через половину дерева ради того, что и так решается
 * каскадом. Значения по умолчанию остаются в tokens.css — по ним панель живёт
 * в браузере и в харнессе, где IDE рядом нет.
 */
const applyTypography = (monoFamily: string, uiFamily: string, lineHeight: number): void => {
  const root = document.documentElement.style

  if (monoFamily) root.setProperty('--acc-mono', `'${monoFamily}', ui-monospace, monospace`)
  if (uiFamily) root.setProperty('--acc-font', `'${uiFamily}', system-ui, sans-serif`)
  if (lineHeight > 0) root.setProperty('--acc-leading', String(lineHeight))
}

/** Сколько ждём подтверждения Stop, прежде чем предложить убить процесс насильно. */
const STOP_GRACE_MS = 8000

/**
 * Черновик, вложения и цитаты принадлежат разговору, а не панели целиком.
 *
 * Текст и вложения — одна последовательность токенов, а не текст с отдельным
 * списком чипов сверху: так вложение остаётся ровно там, куда его вставили, а
 * не всегда перед текстом целиком.
 */
interface Draft {
  tokens: UserToken[]
  quotes: Quote[]
}

const EMPTY_DRAFT: Draft = { tokens: [], quotes: [] }

export const App = () => {
  const [panels, dispatchPanel] = useReducer(panelsReducer, { [MAIN_SESSION]: initialPanelState })
  const [sessions, setSessions] = useState<Session[]>([
    { id: MAIN_SESSION, title: 'main session', state: 'idle', groupId: MAIN_SESSION, depth: 0 },
  ])
  const [active, setActive] = useState(MAIN_SESSION)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  const [queue, setQueue] = useState<QueuedPrompt[]>([])
  const [menu, setMenu] = useState<{ kind: SelectorKind; anchor: Anchor } | null>(null)
  /**
   * Выбор модели, усилия и режима. Приходит от оболочки при запуске и там же
   * сохраняется: новая вкладка, форк и следующий запуск IDE начинаются с него.
   */
  const [prefs, setPrefs] = useState({ model: '', effort: 'high', mode: 'manual' })
  const [auth, setAuth] = useState<AuthState | null>(null)
  /**
   * Разрешён ли на этом компьютере режим «без вопросов». Оболочка выясняет это у
   * самого CLI и отвечает отдельным сообщением, поэтому до ответа считаем, что
   * нет: завести человека одной клавишей в режим, который тут же откажет, хуже,
   * чем на секунду не пустить его туда вовсе.
   */
  const [bypassAvailable, setBypassAvailable] = useState(false)
  /**
   * Режимы, в которых агент уже отказал. Про auto заранее не знает никто — ни
   * панель, ни оболочка: доступен он или нет, отвечает сам агент, и отвечает
   * единственным способом — отказом на просьбу переключиться. Услышанный отказ
   * помним на всю панель: дело не во вкладке, а в машине и учётной записи.
   */
  const [refusedModes, setRefusedModes] = useState<string[]>([])
  /** Сторона экрана, к которой прижата панель — определяет, где рисовать рамку к редактору. */
  const [dockAnchor, setDockAnchor] = useState<'left' | 'right' | 'top' | 'bottom'>('right')
  const [loginWaiting, setLoginWaiting] = useState(false)
  /** Растёт, когда полю ввода нужно вернуть фокус: например после ссылки из редактора. */
  const [focusToken, setFocusToken] = useState(0)
  const [usage, setUsage] = useState<{
    session?: UsageWindow
    week?: UsageWindow
    contextWindow?: number
    todayTokens?: string
  }>({})
  /**
   * Какая из панелей-модалок открыта — одно значение, а не три независимых
   * булевых. Так они взаимоисключающие по построению: открыть плагины само
   * закрывает историю, а не оставляет её тихо висеть под новой поверх неё.
   */
  const [openPanel, setOpenPanel] = useState<'history' | 'mcp' | 'plugins' | null>(null)
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  /**
   * Завершённый агент пропадает из вкладок сам, как только на него никто не
   * смотрит (см. эффект ниже) — а не мгновенно на глазах у того, кто как раз
   * его и просматривает: тогда он держится до переключения на что-то другое.
   * clearFinishedAgents ниже дополнительно прячет всех разом перед новым
   * сообщением в main. Живёт здесь, а не в PanelState: durable-лог событий
   * ничего не теряет, скрытие — чисто отображение.
   */
  const [hiddenTaskIds, setHiddenTaskIds] = useState<Set<string>>(new Set())
  const [activeStream, setActiveStream] = useState('main')
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([])
  const [mcpLoading, setMcpLoading] = useState(false)
  const [mcpMessage, setMcpMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pluginsInstalled, setPluginsInstalled] = useState<InstalledPluginInfo[]>([])
  const [pluginsAvailable, setPluginsAvailable] = useState<AvailablePluginInfo[]>([])
  const [marketplaces, setMarketplaces] = useState<PluginMarketplaceInfo[]>([])
  const [pluginsLoading, setPluginsLoading] = useState(false)
  const [pluginMessage, setPluginMessage] = useState<{ ok: boolean; text: string } | null>(null)
  /** Файлы проекта для подсказки "@" — приходят сами, панель ничего не просит. */
  const [files, setFiles] = useState<string[]>([])
  /** Описание и синтаксис аргумента слэш-команд — той же природы, что и files. */
  const [commandHints, setCommandHints] = useState<Record<string, { description: string; argumentHint: string }>>({})

  const feedRef = useRef<HTMLElement | null>(null)
  const [selection, clearSelection] = useSelection(feedRef)
  const cards = useCardState()

  const panel = panels[active] ?? initialPanelState
  const draft = drafts[active] ?? EMPTY_DRAFT
  const running = panel.status === 'running'
  const imageBaseCount = useMemo(() => countSessionImages(panel, queue), [panel, queue])

  // Stop честно ждёт подтверждения; если оно не пришло дольше разумного,
  // предлагаем убить процесс насильно, а не стоять с крутящейся кнопкой вечно.
  const stopStalled = Boolean(
    running && panel.stopRequestedAt && Date.now() - panel.stopRequestedAt > STOP_GRACE_MS,
  )

  // Один источник правды на кнопку и на меню: пока агент не подтвердил смену,
  // показываем выбранное, дальше — то, что он реально применил.
  const mode = panel.pendingMode ?? panel.permissionMode ?? prefs.mode

  // Что из необязательного доступно кругу Shift+Tab: разрешение на bypass приходит
  // от оболочки, а остальное вычёркивают отказы самого агента.
  const availableModes = useMemo(
    () => ({
      bypass: bypassAvailable && !refusedModes.includes('bypassPermissions'),
      auto: !refusedModes.includes('auto'),
    }),
    [bypassAvailable, refusedModes],
  )

  // То же самое для модели, но с поправкой на то, что её подтверждение всегда
  // отстаёт на один ход (см. комментарий у pendingModel) — без pendingModel
  // выбор снаружи выглядел бы применившимся через раз.
  const model = panel.pendingModel ?? panel.model ?? prefs.model

  const editDraft = useCallback(
    (session: string, change: Partial<Draft>) => {
      setDrafts((current) => ({
        ...current,
        [session]: { ...(current[session] ?? EMPTY_DRAFT), ...change },
      }))
    },
    [],
  )

  useEffect(() => {
    send({ type: 'ready' })
  }, [])

  /**
   * Длительность бегущих инструментов иначе стоит на месте до самого результата —
   * рядом с готовыми карточками, которые появляются мгновенно, это читается как
   * зависание. Ref вместо зависимости эффекта от panels: иначе каждый тик пересоздавал
   * бы интервал.
   */
  const panelsRef = useRef(panels)
  panelsRef.current = panels

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
  }

  /**
   * Фоновый агент, за которым сейчас никто не следит, прячется сразу же, как
   * закончил — незачем ждать следующего сообщения в main, чтобы не занимал
   * место вкладкой. Тот, что просматривается прямо сейчас (activeStream), не
   * трогаем: работу нельзя выдёргивать из-под курсора — спрячется сам, как
   * только просмотр переключится на что-то другое (эффект перезапустится по
   * activeStream и подберёт его).
   */
  useEffect(() => {
    const finishedIds = panel.items
      .filter((item): item is TaskItem => item.kind === 'task' && !item.pending && item.id !== activeStream)
      .map((item) => item.id)
    if (finishedIds.length === 0) return

    setHiddenTaskIds((current) => {
      let changed = false
      const next = new Set(current)
      for (const id of finishedIds) {
        if (next.has(id)) continue
        next.add(id)
        changed = true
      }
      return changed ? next : current
    })
  }, [panel.items, activeStream])

  useEffect(() => {
    const id = setInterval(() => {
      for (const sessionId of Object.keys(panelsRef.current)) {
        const panel = panelsRef.current[sessionId]
        // Тикаем и пока ждём подтверждения Stop: иначе «висит уже подозрительно
        // долго» некому будет пересчитать, если в этот момент ничего не «выполняется».
        if (Object.keys(panel.startedAt).length > 0 || panel.stopRequestedAt) {
          dispatchPanel({ session: sessionId, action: { kind: 'tick' } })
        }
      }
    }, 1000)

    return () => clearInterval(id)
  }, [])

  useEffect(
    () =>
      subscribe((message) => {
        switch (message.type) {
          case 'init':
            if (message.preferences) {
              setPrefs((current) => ({
                model: message.preferences?.model || current.model,
                effort: message.preferences?.effort || current.effort,
                mode: normalizeMode(message.preferences?.mode || current.mode),
              }))
            }
            dispatchPanel({
              session: MAIN_SESSION,
              action: {
                kind: 'init',
                project: {
                  name: message.projectName,
                  workingDirectory: message.workingDirectory,
                  gitBranch: message.gitBranch,
                },
              },
            })
            break

          case 'project':
            dispatchPanel({
              session: MAIN_SESSION,
              action: {
                kind: 'project',
                gitBranch: message.gitBranch,
                pullRequest: message.pullRequest,
                pullRequestUrl: message.pullRequestUrl,
              },
            })
            break

          case 'sessions':
            setSessions(
              message.sessions.map((info) => ({
                id: info.id,
                title: info.title,
                state: 'idle' as const,
                groupId: info.id,
                depth: 0,
              })),
            )
            break

          case 'status':
            dispatchPanel({ session: message.sessionId, action: { kind: 'status', status: message.state } })
            break

          case 'error':
            dispatchPanel({ session: message.sessionId, action: { kind: 'error', message: message.message } })
            break

          case 'agent':
            dispatchPanel({ session: message.sessionId, action: { kind: 'agent', event: message.event } })
            break

          case 'processExited':
            dispatchPanel({
              session: message.sessionId,
              action: { kind: 'processExited', exitCode: message.exitCode },
            })
            break

          case 'picked':
            setDrafts((current) => {
              const session = current[activeRef.current] ?? EMPTY_DRAFT
              return {
                ...current,
                [activeRef.current]: {
                  ...session,
                  tokens: appendChip(session.tokens, { kind: message.kind, value: message.value }),
                },
              }
            })
            break

          case 'history':
            setHistory(message.conversations)
            break

          case 'mcpServers':
            setMcpServers(message.servers)
            setMcpLoading(false)
            break

          case 'mcpActionResult':
            setMcpMessage({ ok: message.ok, text: message.message })
            break

          case 'plugins':
            setPluginsInstalled(message.installed)
            setPluginsAvailable(message.available)
            setPluginsLoading(false)
            break

          case 'pluginActionResult':
            setPluginMessage({ ok: message.ok, text: message.message })
            break

          case 'marketplaces':
            setMarketplaces(message.marketplaces)
            break

          case 'files':
            setFiles(message.files)
            break

          case 'commandHints':
            setCommandHints(message.hints)
            break

          case 'dockAnchor':
            setDockAnchor(message.anchor)
            break

          case 'typography':
            applyTypography(message.monoFamily, message.uiFamily, message.lineHeight)
            break

          case 'usage':
            // Приходит двумя независимыми путями (расход разговора и отдельно
            // скан транскриптов на todayTokens) — сливаем, а не заменяем целиком,
            // иначе один обнулял бы то, что уже узнали через другой.
            setUsage((current) => ({
              session: message.session ?? current.session,
              week: message.week ?? current.week,
              // ?? тут не годится — 0 не nullish, застрял бы в state навсегда
              // и датчик контекста ниже намертво делился бы на ноль.
              contextWindow:
                message.contextWindow && message.contextWindow > 0 ? message.contextWindow : current.contextWindow,
              todayTokens: message.todayTokens ?? current.todayTokens,
            }))
            break

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

          case 'auth':
            setAuth({
              installed: message.installed,
              loggedIn: message.loggedIn,
              email: message.email,
              plan: message.plan,
            })
            if (message.loggedIn) setLoginWaiting(false)
            break

          case 'modeAvailability':
            setBypassAvailable(message.bypassPermissions)
            break

          case 'mode':
            if (!message.applied) setRefusedModes((current) => withRefusedMode(current, message.mode))
            dispatchPanel({
              session: message.sessionId,
              action: {
                kind: 'modeApplied',
                mode: normalizeMode(message.mode),
                applied: message.applied,
                error: message.error,
              },
            })
            break

          case 'selection':
            // Ссылка на кусок файла из редактора: текст не тащим, агент прочитает
            // файл сам и увидит его целиком. Абсолютный путь — исключение: его
            // просят затем, чтобы видеть и скопировать буквально, поэтому он идёт
            // обычным текстом, а не чипом с укороченной подписью.
            setDrafts((current) => {
              const session = current[activeRef.current] ?? EMPTY_DRAFT
              return {
                ...current,
                [activeRef.current]: {
                  ...session,
                  tokens: message.asPlainText
                    ? appendText(session.tokens, `@${message.path}`)
                    : appendChip(session.tokens, referenceChip(message)),
                },
              }
            })
            setFocusToken((current) => current + 1)
            break
        }
      }),
    [],
  )

  /** Подписка живёт один раз, а активная вкладка меняется — держим её в ссылке. */
  const activeRef = useRef(active)
  useEffect(() => {
    activeRef.current = active
  }, [active])

  // Открытый стрим принадлежит той вкладке, где его открыли: у другой сессии
  // агента с таким id почти наверняка нет. Без сброса переключение вкладки
  // могло бы унести orphaned activeStream в чужую панель и упереться в пустой
  // экран без дропдауна и без пути назад на main.
  useEffect(() => {
    setActiveStream('main')
  }, [active])

  // Очередь разбирается сама, как только агент освободился: ровно это обещает подпись.
  useEffect(() => {
    if (running || queue.length === 0) return

    const [next, ...rest] = queue
    if (!next) return

    clearFinishedAgents(active)
    setActiveStream('main')
    setQueue(rest)
    dispatchPanel({
      session: active,
      // Кладём в ленту то же, что набирали, а не готовую строку: иначе вложения
      // отправленного из очереди сообщения исчезают из истории сессии, и
      // countSessionImages перестаёт их видеть — следующая картинка снова
      // становится первой.
      action: { kind: 'prompt', tokens: next.tokens, quotes: [] },
    })
    send({ type: 'prompt', sessionId: active, text: next.text, images: next.images })
  }, [running, queue, active])

  /**
   * Режим меняет оболочка управляющим сообщением: агент применяет его к следующим
   * же вызовам инструментов, перезапускать разговор не нужно.
   */
  const setMode = useCallback(
    (next: string) => {
      send({ type: 'setMode', sessionId: active, mode: next })
      setPrefs((current) => ({ ...current, mode: next }))
      dispatchPanel({ session: active, action: { kind: 'modeRequested', mode: next } })
    },
    [active],
  )

  /**
   * Решение по карточке плана — единая точка для обеих кнопок: помечает план
   * решённым (карточка после этого не рисуется, см. Feed) и меняет режим тем же
   * управляющим сообщением, что и обычный переключатель режима.
   */
  const decidePlan = useCallback(
    (itemId: string, decision: 'approve' | 'keepPlanning') => {
      cards.decidePlan(itemId, decision)
      setMode(decision === 'approve' ? 'bypassPermissions' : 'plan')
    },
    [cards, setMode],
  )

  /** Ответ на вопрос агента уходит как обычное следующее сообщение — как и говорит подсказка на карточке. */
  const sendAnswers = useCallback(
    (itemId: string, answers: string[]) => {
      // Помечаем отвеченной в любом случае — иначе карточка без единого
      // вопроса (например от пустого/сбойного вызова инструмента) не может
      // закрыться в принципе: слать action-то нечего, а кнопка тогда
      // навсегда ничего не делает.
      cards.answerAsk(itemId)

      const text = answers.filter(Boolean).join('\n')
      if (!text) return

      send({ type: 'prompt', sessionId: active, text })
      dispatchPanel({
        session: active,
        action: { kind: 'prompt', tokens: [{ kind: 'text', value: text }], quotes: [] },
      })
    },
    [cards, active],
  )

  const decidePermission = useCallback(
    (id: string, decision: 'once' | 'always' | 'deny') => {
      send({ type: 'permissionDecision', id, decision })
      dispatchPanel({ session: active, action: { kind: 'permissionResolved', id, decision } })
    },
    [active],
  )

  // Shift+Tab гоняет по кругу режимов — та же привычка и тот же круг, что в терминале.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Инструменты разработчика живут на клавише, а не на кнопке: место в шапке
      // они не стоят, а без них панель не отладить.
      if (event.code === 'KeyD' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        send({ type: 'openDevTools' })
        return
      }

      // Escape = Stop, пока агент реально работает — тот же жест, что в терминале
      // (Ctrl+C) и та же честность про статус, что и у самой кнопки: не идле не
      // подставляем «свободен» сами, а ждём настоящего события. Composer сам
      // гасит это событие (stopPropagation), пока Escape занят своим — закрывает
      // подсказку команд/файлов, — сюда оно долетает только когда сверху уже
      // нечего закрывать.
      if (event.key === 'Escape') {
        if (!running) return
        event.preventDefault()
        send({ type: 'stop', sessionId: active })
        dispatchPanel({ session: active, action: { kind: 'stopRequested' } })
        return
      }

      if (event.key !== 'Tab' || !event.shiftKey) return

      event.preventDefault()
      setMode(nextMode(mode, availableModes))
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, availableModes, setMode, running, active])

  /**
   * Форк от выделенного куска: агент получает всю переписку до этой точки, но
   * продолжает в новом разговоре — исходный остаётся каким был. Выделенное едет с
   * ним цитатой над полем ввода: она не редактируется и не забивает само поле.
   */
  const fork = useCallback(
    (quote = '') => {
      const short = quote.length > 48 ? `${quote.slice(0, 48)}…` : quote
      const id = `branch-${Date.now()}`
      const parent = sessions.find((session) => session.id === active)
      const parentTitle = parent?.title ?? 'main session'

      // Форк остаётся в группе своего разговора — и форк форка тоже. Так вкладки
      // одной темы держатся вместе и отличаются от чужих одним взглядом.
      const groupId = parent?.groupId ?? MAIN_SESSION
      const depth = (parent?.depth ?? 0) + 1
      const inGroup = sessions.filter((session) => session.groupId === groupId).length

      setSessions((current) => {
        const next = [...current]
        // Ставим сразу после последней вкладки своей группы, а не в конец списка.
        const lastOfGroup = next.map((session) => session.groupId).lastIndexOf(groupId)
        next.splice(lastOfGroup + 1, 0, { id, title: `fork ${inGroup}`, state: 'idle', groupId, depth })
        return next
      })

      send({ type: 'newSession', kind: 'branch', sessionId: id, parentId: active, title: short, quote })

      if (quote) {
        setDrafts((current) => ({
          ...current,
          [id]: { ...EMPTY_DRAFT, quotes: [{ id: `q-${Date.now()}`, text: quote }] },
        }))
      }

      dispatchPanel({
        session: id,
        action: { kind: 'checkpoint', chip: 'FORK', target: `continues ${parentTitle} · nothing here goes back` },
      })

      setActive(id)
      setFocusToken((current) => current + 1)
    },
    [active, sessions],
  )

  /**
   * Новая вкладка с нуля — и обычная, кнопкой «+», и та единственная, что
   * встречает пользователя после того, как он закрыл вообще все.
   */
  const startSession = useCallback((id: string) => {
    setSessions((current) => [...current, { id, title: 'new session', state: 'idle', groupId: id, depth: 0 }])
    setActive(id)
    send({ type: 'newSession', kind: 'main', sessionId: id, title: 'new session' })
  }, [])

  /** Прошлый разговор продолжается в своей вкладке: панель проиграет его переписку. */
  const resume = useCallback((entry: HistoryEntry) => {
    const id = `resumed-${entry.id.slice(0, 8)}`
    const title = entry.title.length > 40 ? `${entry.title.slice(0, 40)}…` : entry.title

    setOpenPanel(null)
    setHistory(null)
    setSessions((current) =>
      current.some((session) => session.id === id)
        ? current
        : [...current, { id, title, state: 'idle', groupId: id, depth: 0 }],
    )
    setActive(id)
    send({ type: 'resumeSession', sessionId: id, conversationId: entry.id })
  }, [])

  const runLocal = useCallback(
    (name: string) => {
      if (name === 'login') {
        send({ type: 'login' })
        setLoginWaiting(true)
        return
      }

      if (name === 'logout') {
        send({ type: 'logout' })
        return
      }

      if (name === 'resume') {
        setOpenPanel('history')
        send({ type: 'history' })
        return
      }

      if (name === 'fork') fork()
    },
    [fork],
  )

  /** ⌥B из меню выделения. Клавиша нарисована в меню, значит обязана работать. */
  useEffect(() => {
    if (!selection) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'KeyB' || !event.altKey) return

      event.preventDefault()
      fork(selection.text)
      clearSelection()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selection, fork, clearSelection])

  const submit = useCallback((overrideText?: string) => {
    // Команды панели агенту не уходят: вход и выход в потоковом режиме ему
    // недоступны, а ветвление вообще про устройство панели.
    // Цитаты и вложения команде не мешают: они останутся в поле и уедут со
    // следующим сообщением — терять их из-за одной команды было бы обидно.
    // Строгая проверка типом, а не просто "overrideText !== undefined": эта
    // функция передаётся напрямую в onClick кнопки отправки, а React зовёт
    // обработчик клика с объектом события первым аргументом — сравнение с
    // undefined приняло бы событие за подменённый текст.
    const isOverride = typeof overrideText === 'string'
    const tokens = isOverride ? [{ kind: 'text' as const, value: overrideText }] : draft.tokens
    const quotes = isOverride ? [] : draft.quotes

    const local = localCommand(plainText(tokens))
    if (local) {
      runLocal(local)
      if (!isOverride) editDraft(active, { tokens: [] })
      return
    }

    const text = isOverride ? overrideText : composePrompt(draft, imageBaseCount)
    if (!text) return

    const images = isOverride ? [] : imageAttachments(draft.tokens)
    const attachCount = isOverride ? 0 : draft.tokens.filter((token) => token.kind === 'chip').length

    if (running) {
      setQueue((current) => [
        ...current,
        {
          id: `q-${Date.now()}`,
          text,
          attach: attachCount ? `${attachCount} refs` : '',
          tokens,
          images,
        },
      ])
      if (!isOverride) setDrafts((current) => ({ ...current, [active]: EMPTY_DRAFT }))
      return
    }

    clearFinishedAgents(active)
    setActiveStream('main')

    dispatchPanel({
      session: active,
      action: { kind: 'prompt', tokens, quotes: quotes.map((quote) => quote.text) },
    })

    send({ type: 'prompt', sessionId: active, text, images })
    if (!isOverride) setDrafts((current) => ({ ...current, [active]: EMPTY_DRAFT }))
  }, [draft, running, active, runLocal, editDraft, imageBaseCount])

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

  // Тот же приём, что и выше: харнесс имитирует настоящий клик по кнопке
  // карточки плана (не только реакцию бэкенда на него), чтобы пошаговая
  // прокрутка чекпоинтов сама показывала исчезновение карточки.
  useEffect(() => {
    if (!import.meta.env.DEV) return

    window.__accHarnessResolvePlan = decidePlan
    return () => {
      window.__accHarnessResolvePlan = undefined
    }
  }, [decidePlan])

  /**
   * Reconnect/enable/disable одного MCP-сервера — своей управляющей команды для
   * них в CLI нет, только слэш-команда внутри разговора, поэтому шлём её обычным
   * промптом в активную вкладку — тем же путём, что и любое сообщение.
   */
  const runMcpCommand = useCallback(
    (args: string) => {
      const text = `/mcp ${args}`

      if (running) {
        setQueue((current) => [
          ...current,
          { id: `q-${Date.now()}`, text, attach: '', tokens: [{ kind: 'text', value: text }], images: [] },
        ])
      } else {
        clearFinishedAgents(active)
        setActiveStream('main')
        dispatchPanel({
          session: active,
          action: { kind: 'prompt', tokens: [{ kind: 'text', value: text }], quotes: [] },
        })
        send({ type: 'prompt', sessionId: active, text })
      }

      setMcpMessage({ ok: true, text: `Sent "${text}" — see the chat for the result.` })
    },
    [running, active],
  )

  const agentTabs = useMemo(
    () => buildAgentTabs(panel, cards.answeredAsks, hiddenTaskIds),
    [panel, cards.answeredAsks, hiddenTaskIds],
  )
  const mainStatus = useMemo(() => mainStatusOf(panel, cards.answeredAsks), [panel, cards.answeredAsks])

  // activeStream переживает переключение сессии/`/clear` на один кадр раньше,
  // чем эффект успевает сбросить его на 'main' (а после /clear эффект вообще
  // не сработает — active не поменялся). Раз задача, на которую он указывает,
  // в этой панели не найдена — считаем это main, а не рисуем пустой экран.
  const activeTask = panel.items.find((item): item is TaskItem => item.kind === 'task' && item.id === activeStream)
  const resolvedStream = activeStream === 'main' || activeTask ? activeStream : 'main'
  const commands = useMemo(
    () => buildCommands(panel.slashCommands, commandHints),
    [panel.slashCommands, commandHints],
  )
  const tabs = useMemo(
    () => sessions.map((session) => ({ ...session, state: sessionState(panels[session.id]) })),
    [sessions, panels],
  )

  // Без входа поле ввода бессмысленно: агент ответит на любой вопрос строкой про
  // /login, а сама эта команда в потоковом режиме недоступна.
  if (!auth || !auth.loggedIn) {
    return (
      <div className={s.panel} data-anchor={dockAnchor}>
        <LoginGate
          auth={auth}
          waiting={loginWaiting}
          onLogin={() => {
            send({ type: 'login' })
            setLoginWaiting(true)
          }}
          onRecheck={() => send({ type: 'checkAuth' })}
        />
      </div>
    )
  }

  return (
    <div className={s.panel} data-anchor={dockAnchor}>
      <Header
        sessions={tabs}
        activeSession={active}
        onPickSession={setActive}
        onCloseSession={(id) => {
          // Любая вкладка закрывается как обычная, включая последнюю — тогда
          // показывать нечего, но хедер и его кнопки (история, MCP, плагины)
          // остаются: они не привязаны к тому, есть ли открытый разговор.
          send({ type: 'closeSession', sessionId: id })
          const next = sessions.filter((session) => session.id !== id)
          setSessions(next)
          if (active === id) setActive(next[0]?.id ?? MAIN_SESSION)
        }}
        onNewSession={() => startSession(`session-${Date.now()}`)}
        onOpenHistory={() => {
          if (openPanel === 'history') {
            setOpenPanel(null)
            setHistory(null)
            return
          }
          setOpenPanel('history')
          send({ type: 'history' })
        }}
        onOpenMcp={() => {
          if (openPanel === 'mcp') {
            setOpenPanel(null)
            return
          }
          setOpenPanel('mcp')
          setMcpLoading(true)
          setMcpMessage(null)
          send({ type: 'mcpList' })
        }}
        onOpenPlugins={() => {
          if (openPanel === 'plugins') {
            setOpenPanel(null)
            return
          }
          setOpenPanel('plugins')
          setPluginsLoading(true)
          setPluginMessage(null)
          send({ type: 'pluginList' })
          send({ type: 'marketplaceList' })
        }}
      />

      {openPanel === 'history' ? (
        <History
          conversations={history ?? []}
          loading={history === null}
          onOpen={resume}
          onClose={() => {
            setOpenPanel(null)
            setHistory(null)
          }}
        />
      ) : null}

      {openPanel === 'mcp' ? (
        <Mcp
          servers={mcpServers}
          loading={mcpLoading}
          message={mcpMessage}
          onRefresh={() => {
            setMcpLoading(true)
            setMcpMessage(null)
            send({ type: 'mcpList' })
          }}
          onReconnect={(name) => runMcpCommand(`reconnect ${name}`)}
          onEnable={(name) => runMcpCommand(`enable ${name}`)}
          onDisable={(name) => runMcpCommand(`disable ${name}`)}
          onRemove={(name) => {
            setMcpMessage(null)
            send({ type: 'mcpRemove', name })
          }}
          onAdd={(name, command, transport) => {
            setMcpMessage(null)
            send({ type: 'mcpAdd', name, command, transport })
          }}
          onClose={() => setOpenPanel(null)}
        />
      ) : null}

      {openPanel === 'plugins' ? (
        <Plugins
          installed={pluginsInstalled}
          available={pluginsAvailable}
          marketplaces={marketplaces}
          loading={pluginsLoading}
          message={pluginMessage}
          onRefresh={() => {
            setPluginsLoading(true)
            setPluginMessage(null)
            send({ type: 'pluginList' })
            send({ type: 'marketplaceList' })
          }}
          onInstall={(plugin) => {
            setPluginMessage(null)
            send({ type: 'pluginInstall', plugin })
          }}
          onUninstall={(plugin) => {
            setPluginMessage(null)
            send({ type: 'pluginUninstall', plugin })
          }}
          onEnable={(plugin) => {
            setPluginMessage(null)
            send({ type: 'pluginEnable', plugin })
          }}
          onDisable={(plugin) => {
            setPluginMessage(null)
            send({ type: 'pluginDisable', plugin })
          }}
          onAddMarketplace={(source) => {
            setPluginMessage(null)
            send({ type: 'marketplaceAdd', source })
          }}
          onRemoveMarketplace={(name) => {
            setPluginMessage(null)
            send({ type: 'marketplaceRemove', name })
          }}
          onDismissMessage={() => setPluginMessage(null)}
          onClose={() => setOpenPanel(null)}
        />
      ) : null}

      {sessions.length === 0 ? (
        <div className={s.emptyState}>
          <p className={s.gateTitle}>No open chats</p>
          <button type="button" className={s.gateButton} onClick={() => startSession(MAIN_SESSION)}>
            New chat
          </button>
        </div>
      ) : (
        <>
        <StreamSwitcher tabs={agentTabs} mainStatus={mainStatus} active={resolvedStream} onPick={setActiveStream} />

        <div className={s.body}>
          {resolvedStream === 'main' ? (
            <Feed
              items={panel.items}
              streamingText={panel.streamingText}
              streamingId={panel.streamingId}
              streamingThinking={panel.streamingThinking}
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
            <AgentStreamView item={activeTask} />
          )}

          {selection && resolvedStream === 'main' ? (
            <SelectionMenu
              selection={selection}
              onFork={() => {
                fork(selection.text)
                clearSelection()
              }}
              onQuote={() => {
                // Плашкой прямо в поле ввода — как файл или картинка, а не отдельным
                // блоком над ним: цитата из вывода агента ничем не хуже вложения.
                const ordinal = draft.tokens.filter((token) => token.kind === 'chip' && token.chip.kind === 'quote').length + 1
                editDraft(active, {
                  tokens: appendChip(draft.tokens, { kind: 'quote', value: `ref${ordinal}`, text: selection.text }),
                })
                clearSelection()
                setFocusToken((current) => current + 1)
              }}
              onCopy={() => {
                void navigator.clipboard?.writeText(selection.text)
                clearSelection()
              }}
            />
          ) : null}
        </div>

        <div className={composer.dock}>
          <PermissionPanel item={pendingPermission(panel.items, resolvedStream)} onDecide={decidePermission} />

          <AskPanel
            key={pendingAsk(panel.items, cards.answeredAsks, resolvedStream)?.id ?? 'none'}
            item={pendingAsk(panel.items, cards.answeredAsks, resolvedStream)}
            onSubmit={sendAnswers}
          />

          <TaskListPanel item={latestTodo(panel.items)} />

          <Queue
            items={queue}
            onReorder={(from, to) =>
              setQueue((current) => {
                const next = [...current]
                const [moved] = next.splice(from, 1)
                if (moved) next.splice(to, 0, moved)
                return next
              })
            }
            onRemove={(id) => setQueue((current) => current.filter((item) => item.id !== id))}
          />

          <Quotes
            items={draft.quotes}
            onRemove={(id) =>
              editDraft(active, { quotes: draft.quotes.filter((quote) => quote.id !== id) })
            }
          />

          <Composer
            sessionId={active}
            tokens={draft.tokens}
            streaming={running}
            planMode={mode === 'plan'}
            commands={commands}
            files={files}
            imageBaseCount={imageBaseCount}
            focusToken={focusToken}
            onTokensChange={(tokens) => editDraft(active, { tokens })}
            onAttach={() => send({ type: 'pick' })}
            onSubmit={submit}
            stopStalled={stopStalled}
            onStop={() => {
              // В idle не спешим: статус honestly ждём от настоящего события, а не
              // подставляем сами — иначе Stop может соврать «свободен» ровно тогда,
              // когда агент на самом деле завис.
              send({ type: 'stop', sessionId: active })
              dispatchPanel({ session: active, action: { kind: 'stopRequested' } })
            }}
            onForceStop={() => {
              send({ type: 'kill', sessionId: active })
              dispatchPanel({ session: active, action: { kind: 'status', status: 'idle' } })
            }}
          />

          <StatusBar
            gitBranch={panels[MAIN_SESSION]?.project?.gitBranch}
            pullRequest={panels[MAIN_SESSION]?.project?.pullRequest}
            onOpenPullRequest={() => {
              const url = panels[MAIN_SESSION]?.project?.pullRequestUrl
              if (url) send({ type: 'openExternal', url })
            }}
            contextPercent={contextUsage(panel.usage, usage.contextWindow)}
            contextTokens={`${formatTokens(
              panel.usage.input_tokens +
                panel.usage.cache_read_input_tokens +
                panel.usage.cache_creation_input_tokens,
            )} of ${formatTokens(usage.contextWindow ?? 200_000)}`}
            todayTokens={usage.todayTokens ?? '…'}
            usage={usage}
            model={model}
            effort={prefs.effort}
            mode={mode}
            onOpen={(kind, anchor) => setMenu({ kind, anchor })}
          />
        </div>
        </>
      )}

      {menu ? (
        <Menu
          {...menuProps(menu.kind, model, prefs.effort, mode)}
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          onPick={(id) => {
            setMenu(null)

            if (menu.kind === 'model') {
              setPrefs((current) => ({ ...current, model: id }))
              dispatchPanel({ session: active, action: { kind: 'modelRequested', model: id } })
              send({ type: 'setModel', sessionId: active, model: id })
            }
            if (menu.kind === 'effort') {
              setPrefs((current) => ({ ...current, effort: id }))
              send({ type: 'setEffort', sessionId: active, effort: id })
            }
            if (menu.kind === 'mode') setMode(id)
          }}
        />
      ) : null}
    </div>
  )
}

// --- Состояние сессий -------------------------------------------------------

type PanelsState = Record<string, PanelState>

interface PanelsAction {
  session: string
  action: Parameters<typeof reducePanel>[1]
}

const panelsReducer = (state: PanelsState, { session, action }: PanelsAction): PanelsState => ({
  ...state,
  [session]: reducePanel(state[session] ?? initialPanelState, action),
})

/**
 * Что показывает кружок вкладки. Крах процесса важнее всего: ход прерван не по
 * своей воле, и об этом обязана сказать даже вкладка, на которую сейчас не
 * смотрят. Дальше — ожидание человека, и лишь потом обычная работа.
 */
const sessionState = (panel?: PanelState): SessionState => {
  if (!panel) return 'idle'

  if (panel.crashed) return 'crashed'

  // Непрочитанная ошибка в фоновой вкладке иначе не видна вообще — точка на
  // вкладке молчала бы, пока туда не зайдёшь сам.
  const waiting = panel.errors.length > 0 || panel.items.some((item) => item.kind === 'perm' && item.decision === null)

  if (waiting) return 'attention'
  if (panel.status === 'running') return 'running'

  // Законченным считаем разговор, в котором агент хотя бы раз довёл ход до конца:
  // отметка о ветвлении сама по себе ещё не работа.
  return panel.items.some((item) => item.kind === 'meta') ? 'done' : 'idle'
}

// --- Производные данные -----------------------------------------------------

/**
 * Сколько картинок уже ушло агенту раньше в этой же сессии — отправленными
 * сообщениями и тем, что уже стоит в очереди. Продолжаем нумерацию от этого
 * числа, а не с нуля на каждом сообщении: иначе «Image #1» повторяется в
 * каждой реплике подряд, и по номеру уже не понять, о какой картинке речь,
 * если их несколько за разговор.
 */
const countSessionImages = (panel: PanelState, queue: QueuedPrompt[]): number => {
  const sent = panel.items.reduce(
    (sum, item) =>
      item.kind === 'user'
        ? sum + item.tokens.filter((token) => token.kind === 'chip' && token.chip.kind === 'img' && Boolean(token.chip.data)).length
        : sum,
    0,
  )
  const queued = queue.reduce((sum, item) => sum + item.images.length, 0)
  return sent + queued
}

/**
 * Пока висит неотвеченный запрос разрешения или вопрос ГЛАВНОГО потока, ход
 * на деле не думает — он стоит и ждёт решения человека. «Claude is thinking»
 * в этот момент было бы неправдой. Решение конкретного агента сюда не
 * считается: за него отвечает статус в дропдауне и его собственная вкладка —
 * если бы главная строка статуса реагировала и на них, она бы сама стала той
 * самой нечестной подписью, ради ухода от которой затевался весь редизайн.
 */
const streamStatus = (panel: PanelState, cards: CardState): string => {
  if (panel.compacting) return 'Compacting context…'

  const awaitingDecision = panel.items.some(
    (item) =>
      (item.kind === 'perm' && item.decision === null && item.taskId === undefined) ||
      (item.kind === 'ask' && item.taskId === undefined && !cards.answeredAsks.includes(item.id)),
  )
  if (awaitingDecision) return 'Waiting for you'

  const last = panel.items.at(-1)
  const working = last?.kind === 'toolGroup' && last.pending && last.tools.length > 0
  return working ? 'Claude is working' : 'Claude is thinking'
}

/** Последний присланный агентом список задач — панель над полем ввода зеркалит только его. */
const latestTodo = (items: FeedItem[]): TodoItem | undefined =>
  [...items].reverse().find((item): item is TodoItem => item.kind === 'todo')

/**
 * Чей это, собственно, стрим. taskId без задачи, на которую он ссылается
 * (например если совпадение agent_id/task_id однажды перестанет быть верным
 * на новой версии CLI), — не повод спрятать решение насовсем: без этого оно
 * не показалось бы нигде и тихо истекло по таймауту. Считаем такое главным
 * потоком, а не отдельным несуществующим стримом.
 */
const ownerStream = (taskId: string | undefined, items: FeedItem[]): string => {
  if (taskId === undefined) return 'main'
  const known = items.some((item) => item.kind === 'task' && item.id === taskId)
  return known ? taskId : 'main'
}

/** Последний заданный агентом вопрос в текущем стриме, на который ещё не отвечено. */
const pendingAsk = (items: FeedItem[], answered: string[], stream: string): AskItem | undefined =>
  [...items]
    .reverse()
    .find(
      (item): item is AskItem =>
        item.kind === 'ask' && !answered.includes(item.id) && ownerStream(item.taskId, items) === stream,
    )

/** Последний вызов текущего стрима, который всё ещё ждёт решения по разрешению. */
const pendingPermission = (items: FeedItem[], stream: string): PermItem | undefined =>
  [...items]
    .reverse()
    .find(
      (item): item is PermItem =>
        item.kind === 'perm' && item.decision === null && ownerStream(item.taskId, items) === stream,
    )

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
      percent: task.percent,
      duration: task.duration,
    }))

const menuProps = (
  kind: SelectorKind,
  model: string,
  effort: string,
  mode: string,
): { title: string; hint: string; width: number; options: MenuOption[]; selected: string } => {
  if (kind === 'model') {
    return {
      title: 'MODEL',
      hint: '/model',
      width: 344,
      options: MODEL_OPTIONS,
      selected: MODEL_OPTIONS.find((option) => model.includes(option.id))?.id ?? '',
    }
  }

  if (kind === 'effort') {
    return {
      title: 'EFFORT',
      hint: 'reasoning budget',
      width: 320,
      options: EFFORT_OPTIONS,
      selected: effort,
    }
  }

  return {
    title: 'PERMISSION MODE',
    hint: 'shift+tab cycles the first three',
    width: 372,
    options: MODE_OPTIONS,
    selected: mode,
  }
}
