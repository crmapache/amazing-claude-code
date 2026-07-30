import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { send, subscribe } from './bridge'
import { EFFORT_OPTIONS, MODEL_OPTIONS, MODE_OPTIONS } from './catalog'
import { AgentsDrawer, type AgentCard } from './components/AgentsDrawer'
import { Composer } from './components/Composer'
import { Feed } from './components/Feed'
import { Header, type Session, type SessionState } from './components/Header'
import { History } from './components/History'
import { LoginGate, type AuthState } from './components/LoginGate'
import { Mcp } from './components/Mcp'
import { Menu, type MenuOption } from './components/Menu'
import { Plugins } from './components/Plugins'
import { Queue, type QueuedPrompt } from './components/Queue'
import { Quotes, type Quote } from './components/Quotes'
import { SelectionMenu } from './components/SelectionMenu'
import { StatusBar, type Anchor, type SelectorKind } from './components/StatusBar'
import { StreamsBar, type Stream } from './components/StreamsBar'
import composer from './components/composer.module.css'
import s from './components/shell.module.css'
import { contextUsage, formatTokens, initialPanelState, reducePanel, type PanelState } from './feed/build'
import { referenceChip, referenceText } from './feed/reference'
import { appendChip, appendText, buildCommands, localCommand, plainText } from './feed/slash'
import type { TaskItem, UserToken } from './feed/types'
import type {
  AvailablePluginInfo,
  HistoryEntry,
  InstalledPluginInfo,
  McpServerInfo,
  PluginMarketplaceInfo,
  UsageWindow,
} from './protocol'
import { useCardState } from './hooks/useCardState'
import { useSelection } from './hooks/useSelection'

const MAIN_SESSION = 'main'

/** По этим трём режимам ходит Shift+Tab; остальные выбираются только из меню. */
const MODE_CYCLE = ['default', 'acceptEdits', 'plan']

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
  const [prefs, setPrefs] = useState({ model: '', effort: 'high', mode: 'default' })
  const [auth, setAuth] = useState<AuthState | null>(null)
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
  const [drawerOpen, setDrawerOpen] = useState(false)
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

  // Stop честно ждёт подтверждения; если оно не пришло дольше разумного,
  // предлагаем убить процесс насильно, а не стоять с крутящейся кнопкой вечно.
  const stopStalled = Boolean(
    running && panel.stopRequestedAt && Date.now() - panel.stopRequestedAt > STOP_GRACE_MS,
  )

  // Один источник правды на кнопку и на меню: пока агент не подтвердил смену,
  // показываем выбранное, дальше — то, что он реально применил.
  const mode = panel.pendingMode ?? panel.permissionMode ?? prefs.mode

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
                mode: message.preferences?.mode || current.mode,
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

          case 'usage':
            // Приходит двумя независимыми путями (расход разговора и отдельно
            // скан транскриптов на todayTokens) — сливаем, а не заменяем целиком,
            // иначе один обнулял бы то, что уже узнали через другой.
            setUsage((current) => ({
              session: message.session ?? current.session,
              week: message.week ?? current.week,
              contextWindow: message.contextWindow ?? current.contextWindow,
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

          case 'mode':
            dispatchPanel({
              session: message.sessionId,
              action: {
                kind: 'modeApplied',
                mode: message.mode,
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

  // Очередь разбирается сама, как только агент освободился: ровно это обещает подпись.
  useEffect(() => {
    if (running || queue.length === 0) return

    const [next, ...rest] = queue
    if (!next) return

    setQueue(rest)
    dispatchPanel({
      session: active,
      action: { kind: 'prompt', tokens: [{ kind: 'text', value: next.text }], quotes: [] },
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

  // Shift+Tab гоняет по первым трём режимам — та же привычка, что в терминале.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Инструменты разработчика живут на клавише, а не на кнопке: место в шапке
      // они не стоят, а без них панель не отладить.
      if (event.code === 'KeyD' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        send({ type: 'openDevTools' })
        return
      }

      if (event.key !== 'Tab' || !event.shiftKey) return

      event.preventDefault()
      const index = MODE_CYCLE.indexOf(mode)
      setMode(MODE_CYCLE[(index + 1) % MODE_CYCLE.length] ?? 'default')
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, setMode])

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

    const text = isOverride ? overrideText : composePrompt(draft)
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
          images,
        },
      ])
      if (!isOverride) setDrafts((current) => ({ ...current, [active]: EMPTY_DRAFT }))
      return
    }

    dispatchPanel({
      session: active,
      action: { kind: 'prompt', tokens, quotes: quotes.map((quote) => quote.text) },
    })

    send({ type: 'prompt', sessionId: active, text, images })
    if (!isOverride) setDrafts((current) => ({ ...current, [active]: EMPTY_DRAFT }))
  }, [draft, running, active, runLocal, editDraft])

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

  /**
   * Reconnect/enable/disable одного MCP-сервера — своей управляющей команды для
   * них в CLI нет, только слэш-команда внутри разговора, поэтому шлём её обычным
   * промптом в активную вкладку — тем же путём, что и любое сообщение.
   */
  const runMcpCommand = useCallback(
    (args: string) => {
      const text = `/mcp ${args}`

      if (running) {
        setQueue((current) => [...current, { id: `q-${Date.now()}`, text, attach: '', images: [] }])
      } else {
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

  const streams = useMemo(() => buildStreams(panel), [panel])
  const agents = useMemo(() => buildAgents(panel), [panel])
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
      <div className={s.panel}>
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
    <div className={s.panel}>
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
          setOpenPanel('history')
          send({ type: 'history' })
        }}
        onOpenMcp={() => {
          setOpenPanel('mcp')
          setMcpLoading(true)
          setMcpMessage(null)
          send({ type: 'mcpList' })
        }}
        onOpenPlugins={() => {
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
        <StreamsBar
          streams={streams}
          activeStream={activeStream}
          runningAgents={agents.filter((agent) => agent.live).length}
          onPick={setActiveStream}
          onOpenDrawer={() => setDrawerOpen(true)}
        />

        <div className={s.body}>
          <Feed
            items={panel.items}
            streamingText={panel.streamingText}
            streaming={running}
            streamStatus={streamStatus(panel)}
            errors={panel.errors}
            cards={cards}
            scrollRef={(element) => {
              feedRef.current = element
            }}
            onScroll={clearSelection}
            onSendAnswers={(answers) => {
              const text = answers.filter(Boolean).join('\n')
              if (!text) return
              send({ type: 'prompt', sessionId: active, text })
              dispatchPanel({
                session: active,
                action: { kind: 'prompt', tokens: [{ kind: 'text', value: text }], quotes: [] },
              })
            }}
            onApprovePlan={() => setMode('acceptEdits')}
            onKeepPlanning={() => setMode('plan')}
            onPermissionDecision={(id, decision) => {
              send({ type: 'permissionDecision', id, decision })
              dispatchPanel({ session: active, action: { kind: 'permissionResolved', id, decision } })
            }}
            onDismissError={(index) => dispatchPanel({ session: active, action: { kind: 'dismissError', index } })}
          />

          {selection ? (
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
            onSendNow={(id) =>
              setQueue((current) => {
                const item = current.find((candidate) => candidate.id === id)
                return item ? [item, ...current.filter((candidate) => candidate.id !== id)] : current
              })
            }
            onRemove={(id) => setQueue((current) => current.filter((item) => item.id !== id))}
            onClear={() => setQueue([])}
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
  const waiting =
    panel.errors.length > 0 ||
    panel.items.some(
      (item) => (item.kind === 'perm' && item.decision === null) || (item.kind === 'ask' && !item.sent),
    )

  if (waiting) return 'attention'
  if (panel.status === 'running') return 'running'

  // Законченным считаем разговор, в котором агент хотя бы раз довёл ход до конца:
  // отметка о ветвлении сама по себе ещё не работа.
  return panel.items.some((item) => item.kind === 'meta') ? 'done' : 'idle'
}

// --- Производные данные -----------------------------------------------------

const composePrompt = ({ tokens, quotes }: Draft): string => {
  const parts: string[] = []

  for (const quote of quotes) parts.push(`> ${quote.text}`)

  // Номер картинки в тексте пересчитываем заново по месту в последовательности,
  // а не берём сохранённый в чипе: он мог устареть, если картинку вставили не в
  // конец, а раньше уже вставленной — иначе агенту достанутся байты в одном
  // порядке, а подписи [Image #N] в тексте — в другом, и он свяжет их неверно.
  // Байты в imageAttachments идут в том же порядке токенов, так что нумерация
  // здесь и там совпадает всегда, независимо от того, в каком порядке вставляли.
  let imageOrdinal = 0
  const body = tokens
    .map((token) => {
      if (token.kind === 'chip' && token.chip.kind === 'img' && token.chip.data) {
        imageOrdinal += 1
        return `[Image #${imageOrdinal}]`
      }
      return tokenText(token)
    })
    .join('')
    .trim()
  if (body) parts.push(body)

  return parts.join('\n')
}

/** Текст вложения внутри строки — ровно то, что видит агент на его месте. */
const tokenText = (token: UserToken): string => {
  if (token.kind === 'text') return token.value

  const { chip } = token
  if (chip.kind === 'cmd') return `/${chip.value}`
  if (chip.kind === 'ref') return referenceText(chip)
  // Цитата не путь на диске, а сам текст: агенту уходит целиком, а не то, что видно в плашке.
  if (chip.kind === 'quote') return `"${chip.text ?? ''}"`
  // Картинка из буфера обмена — см. imageOrdinal в composePrompt, сюда попадает
  // только защитный случай без байт (быть в теории не должно).
  if (chip.kind === 'img') return `[${chip.value}]`
  return `@${chip.value}`
}

/** Байты вставленных из буфера картинок — то, что реально уходит агенту как вложение. */
const imageAttachments = (tokens: UserToken[]): { mediaType: string; data: string }[] =>
  tokens.flatMap((token) => {
    if (token.kind !== 'chip' || token.chip.kind !== 'img' || !token.chip.data) return []
    const match = token.chip.data.match(/^data:([^;]+);base64,(.+)$/)
    return match ? [{ mediaType: match[1], data: match[2] }] : []
  })

const streamStatus = (panel: PanelState): string => {
  if (panel.compacting) return 'Compacting context…'

  const last = panel.items.at(-1)
  const tools = last?.kind === 'toolGroup' && last.pending ? last.tools.length : 0
  return tools > 0 ? `Claude is working · ${tools} ${tools === 1 ? 'tool' : 'tools'} this turn` : 'Claude is thinking'
}

const buildStreams = (panel: PanelState): Stream[] => {
  // Законченных агентов в строке не держим: за долгий разговор их бы накопились
  // десятки, а сам факт запуска и результат никуда не пропадают — они остаются
  // обычными карточками в ленте. Строка показывает только то, что бежит сейчас.
  const tasks = panel.items.filter((item): item is TaskItem => item.kind === 'task' && item.pending)

  return [
    { id: 'main', label: 'main', meta: '', live: panel.status === 'running', color: '#7b8cf7' },
    ...tasks.map((task) => ({
      id: task.id,
      label: `agent:${task.target}`,
      meta: '',
      live: true,
      color: '#b78cf0',
    })),
  ]
}

const buildAgents = (panel: PanelState): AgentCard[] =>
  panel.items
    .filter((item): item is TaskItem => item.kind === 'task')
    .map((task) => ({
      id: task.id,
      name: `agent:${task.target}`,
      kind: task.pending ? 'RUNNING' : 'DONE',
      live: task.pending,
      elapsed: task.duration,
      percent: task.percent,
      line: task.detail.at(-1)?.text ?? task.meta,
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
