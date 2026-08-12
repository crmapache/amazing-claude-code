import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { send, subscribe } from './bridge'
import {
  DEFAULT_MODEL,
  EFFORT_OPTIONS,
  MODE_OPTIONS,
  modelMenu,
  nextMode,
  switchedModel,
  normalizeMode,
  withRefusedMode,
} from './catalog'
import { AgentStreamView } from './components/AgentStreamView'
import { AskPanel } from './components/AskPanel'
import { Composer } from './components/Composer'
import { Confirm } from './components/Confirm'
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
import { Sounds } from './components/Sounds'
import { StatusBar, UsageMeters, type Anchor, type SelectorKind } from './components/StatusBar'
import { StreamSwitcher, type AgentStatus, type AgentTab } from './components/StreamSwitcher'
import { TaskListPanel } from './components/TaskListPanel'
import composer from './components/composer.module.css'
import s from './components/shell.module.css'
import { bashCommand, shellText, type ShellRun } from './feed/bash'
import { contextOf, initialPanelState, reducePanel, type PanelState } from './feed/build'
import { referenceChip } from './feed/reference'
import { deriveSessionTitle } from './feed/title'
import { appendChip, appendText, buildCommands, localCommand, plainText, type LocalCommand } from './feed/slash'
import { composePrompt, imageAttachments, tokensText, trimTrailingSpace } from './feed/tokens'
import type { AskItem, FeedItem, PermItem, PlanItem, TaskItem, TodoItem, UserToken } from './feed/types'
import type {
  AvailablePluginInfo,
  HistoryEntry,
  InstalledPluginInfo,
  McpServerInfo,
  ModelInfo,
  PluginMarketplaceInfo,
  SoundId,
  UsageWindow,
} from './protocol'
import {
  NO_SOUND_PREFS,
  isMuted,
  rememberPanel,
  setVolume,
  soundForPanel,
  toggleSound,
  volumeOf,
  type SoundMemory,
  type SoundPrefs,
} from './sounds'
import { useCardState, type CardState } from './hooks/useCardState'
import { moveGroup } from './tabs'
import { useSelection } from './hooks/useSelection'

const MAIN_SESSION = 'main'

/** Заглушка заголовка вкладки — до первого сообщения и сразу после /clear. */
const defaultTitle = (sessionId: string): string => (sessionId === MAIN_SESSION ? 'main session' : 'new session')

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
 * Через сколько загруженный список MCP-серверов или плагинов пора освежить.
 *
 * Открыли вкладку, закрыли, открыли снова — спрашивать заново незачем: меняется
 * этот список редко (и правки из самой вкладки обновляют его сами), а стоит
 * запрос дорого — `claude mcp list` честно поднимает каждый сервер, каталог
 * плагинов обходит маркетплейсы, это секунды. Зато вернувшись к вкладке позже,
 * человек увидит настоящее положение дел, даже если конфиг правили из терминала.
 */
const LIST_STALE_MS = 60_000

/** Сколько ждать конца возни с ползунком громкости, прежде чем записать выбор. */
const SOUND_SAVE_DELAY_MS = 250

/**
 * Сколько после нажатия «выйти» пропажа входа считается собственным действием, а
 * не новостью. С запасом на сам выход: он идёт через терминал IDE, где человеку
 * ещё предстоит увидеть, чем всё кончилось.
 */
const SIGN_OUT_GRACE_MS = 2 * 60 * 1000

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
    { id: MAIN_SESSION, title: defaultTitle(MAIN_SESSION), state: 'idle', groupId: MAIN_SESSION, depth: 0, titleSource: 'default' },
  ])
  const [active, setActive] = useState(MAIN_SESSION)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  const [queue, setQueue] = useState<QueuedPrompt[]>([])
  /**
   * Что человек успел выполнить в bash-режиме с прошлого своего сообщения — по
   * вкладкам, у каждой свой разговор.
   *
   * Уезжает агенту приложением к следующему сообщению, как это делает и сам
   * Claude Code: собственного хода такая команда не стоит (иначе «!git status»
   * гонял бы модель ради двух строк), но и пропадать её вывод не должен — без
   * него следующая просьба вроде «почини вот это» повисает в воздухе.
   */
  const [shellRuns, setShellRuns] = useState<Record<string, ShellRun[]>>({})
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
  const [openPanel, setOpenPanel] = useState<'history' | 'mcp' | 'plugins' | 'sounds' | null>(null)
  /** Галочки и громкость звуковых оповещений — см. sounds.ts. */
  const [soundPrefs, setSoundPrefs] = useState<SoundPrefs>(NO_SOUND_PREFS)
  /** Прошлые разговоры проекта: null — список ещё не приходил (см. стартовые запросы). */
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  /**
   * Работа, которую попросили прибить крестиком на чипе, — пока без ответа на
   * «точно?». Спрашиваем, потому что промах по крестику стоит дорого: у агента
   * это десятки минут работы, у фоновой команды — живой процесс вроде сервера.
   */
  const [stopping, setStopping] = useState<{ id: string; title: string; subject: string } | null>(null)
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
  /**
   * Списки MCP-серверов и плагинов: null — ещё ни разу не приходили, пустой
   * массив — пришли и правда пусты. Разница видна на глаз: в первом случае
   * вкладка показывает скелет, во втором — честное «ничего не настроено».
   *
   * Оба списка спрашиваем сразу при запуске, не дожидаясь, пока их вкладку
   * откроют (см. эффект со стартовыми запросами): каждый такой запрос — это
   * отдельный запуск claude на несколько секунд, и ждать их по клику незачем.
   */
  const [mcpServers, setMcpServers] = useState<McpServerInfo[] | null>(null)
  const [mcpLoading, setMcpLoading] = useState(true)
  const [mcpFetchedAt, setMcpFetchedAt] = useState(0)
  const [mcpMessage, setMcpMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pluginsInstalled, setPluginsInstalled] = useState<InstalledPluginInfo[] | null>(null)
  const [pluginsAvailable, setPluginsAvailable] = useState<AvailablePluginInfo[] | null>(null)
  const [marketplaces, setMarketplaces] = useState<PluginMarketplaceInfo[] | null>(null)
  const [pluginsLoading, setPluginsLoading] = useState(true)
  const [pluginsFetchedAt, setPluginsFetchedAt] = useState(0)
  const [pluginMessage, setPluginMessage] = useState<{ ok: boolean; text: string } | null>(null)
  /**
   * Каталог моделей от самого CLI: null — ещё не приехал, тогда меню показывает
   * встроенный список (см. modelOptions). Свой список держать нельзя — доступные
   * модели зависят от учётной записи и политики организации.
   */
  const [models, setModels] = useState<ModelInfo[] | null>(null)
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
  /**
   * Датчик контекста: цифра приходит от самого CLI, а расчёт по usage остаётся
   * запасным на случай, когда её ещё нет (см. contextOf).
   */
  const context = contextOf(panel, usage.contextWindow)
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

  /**
   * Какая модель работает на самом деле. Пока агент не ответил на смену,
   * показываем выбранное — иначе выбор выглядит потерянным. Дальше идёт то,
   * что назвал сам агент: он говорит это с каждым ответом и знает правду, в том
   * числе когда сменил модель по своему усмотрению. Пока он не сказал ничего
   * (разговор ещё не начинался), разворачиваем выбор каталогом: само значение
   * бывает иносказательным («default»), а назвать модель нижняя строка должна
   * с первой секунды.
   */
  const model =
    panel.pendingModel ??
    panel.model ??
    (models?.find((option) => option.value === (prefs.model || DEFAULT_MODEL))?.resolved || prefs.model)

  /**
   * Разговор ушёл на другую модель не по нашей воле — см. switchedModel. Живёт
   * во вкладке, а не в общей настройке: у соседней свой разговор и своя модель.
   */
  const switched = switchedModel(models, prefs.model, panel.model)

  const editDraft = useCallback(
    (session: string, change: Partial<Draft>) => {
      setDrafts((current) => ({
        ...current,
        [session]: { ...(current[session] ?? EMPTY_DRAFT), ...change },
      }))
    },
    [],
  )

  /**
   * Спросить списки заново. Тихо — когда на экране уже есть что показать: тогда
   * вкладка открывается мгновенно на готовом, а свежее подъезжает само, без
   * скелета и без «Refreshing…» на кнопке.
   */
  const loadMcp = useCallback(
    (quiet = false) => {
      if (!quiet) setMcpLoading(true)
      // Спрашиваем у разговора: серверы держит его процесс, и живое их
      // состояние знает только он (см. mcpList в протоколе).
      send({ type: 'mcpList', sessionId: activeRef.current })
    },
    [],
  )

  const loadPlugins = useCallback((quiet = false) => {
    if (!quiet) setPluginsLoading(true)
    send({ type: 'pluginList' })
    send({ type: 'marketplaceList' })
  }, [])

  // Прошлые разговоры, MCP-серверы и плагины — сразу на старте, вместе с
  // готовностью панели: к тому времени, как их вкладку откроют, они уже
  // загружены.
  useEffect(() => {
    send({ type: 'ready' })
    send({ type: 'history' })
    loadMcp()
    loadPlugins()
  }, [loadMcp, loadPlugins])

  /**
   * Курсор под мышью — оболочке, чтобы она поставила его окну IDE.
   *
   * Своими силами страница этого не может: встроенный браузер рисуется офскрин,
   * в отдельном процессе (см. protocol, сообщение cursor), и указатель, который
   * просит CSS, до окна не доходит — над кнопками оставалась бы обычная стрелка.
   *
   * По mouseover, а не по каждому движению: курсор меняется на границе
   * элементов, а не внутри одного. Значение наследуемое, поэтому спрашиваем его
   * у самого узла под мышью — у подписи внутри кнопки он тот же, что у кнопки.
   */
  useEffect(() => {
    let last = ''

    const report = (cursor: string) => {
      if (cursor === last) return
      last = cursor
      send({ type: 'cursor', cursor })
    }

    const onOver = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      report(target ? getComputedStyle(target).cursor : 'default')
    }
    // Мышь ушла из панели совсем — курсор дальше не наш.
    const onLeave = () => report('default')

    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseleave', onLeave)

    return () => {
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  /**
   * Запущенные команды bash-режима по их номеру: ответ оболочки приносит только
   * вывод, а агенту нужна и сама команда. Вкладку помним рядом с командой —
   * по ней вычёркиваем всё, что не должно пережить `/clear` или закрытие
   * разговора. Ссылка, а не состояние: от неё ничего не перерисовывается, и
   * подписка на сообщения оболочки, живущая один раз на всю панель, свежего
   * состояния всё равно бы не увидела.
   */
  const shellCommands = useRef<Record<string, { session: string; command: string }>>({})

  /** Забыть команды вкладки, которые ещё бегут: их вывод этому разговору уже не нужен. */
  const forgetShellCommands = (session: string) => {
    for (const [id, run] of Object.entries(shellCommands.current)) {
      if (run.session === session) delete shellCommands.current[id]
    }
  }
  /** Порядковый номер запуска — от него уникальность id, см. runShell. */
  const shellSeq = useRef(0)

  /**
   * Вставка в поле ввода тем, что пришло из IDE: ссылкой из редактора, файлом
   * из диалога, брошенной мышью папкой.
   *
   * Кладём в место курсора, а не в конец черновика: человек мог отбить новую
   * строку и уйти в редактор за ссылкой — она обязана встать туда, где он её
   * ждёт. Само место живёт в поле ввода, поэтому вставляет оно (см. Composer),
   * а панель только передаёт ему вложение. Пока поля нет вовсе — открыт ни один
   * чат, — дописываем в конец черновика: он дождётся первой же вкладки.
   */
  const insertIntoComposer = useRef<((token: UserToken) => void) | null>(null)
  const registerInsert = useCallback((insert: ((token: UserToken) => void) | null) => {
    insertIntoComposer.current = insert
  }, [])

  const addToDraft = (token: UserToken) => {
    const insert = insertIntoComposer.current
    if (insert) {
      insert(token)
      return
    }

    setDrafts((current) => {
      const session = current[activeRef.current] ?? EMPTY_DRAFT
      return {
        ...current,
        [activeRef.current]: {
          ...session,
          tokens:
            token.kind === 'chip'
              ? appendChip(session.tokens, token.chip)
              : appendText(session.tokens, token.value),
        },
      }
    })
  }

  /**
   * Длительность бегущих инструментов иначе стоит на месте до самого результата —
   * рядом с готовыми карточками, которые появляются мгновенно, это читается как
   * зависание. Ref вместо зависимости эффекта от panels: иначе каждый тик пересоздавал
   * бы интервал.
   */
  const panelsRef = useRef(panels)
  panelsRef.current = panels

  /**
   * Звуковые оповещения: что каждая вкладка успела рассказать наблюдателю.
   * Память между кадрами, а не состояние — от неё ничего не перерисовывается.
   */
  const soundMemory = useRef<Record<string, SoundMemory>>({})
  /** Настройку звуков читает эффект ниже, но перезапускаться из-за неё ему незачем. */
  const soundPrefsRef = useRef(soundPrefs)
  soundPrefsRef.current = soundPrefs

  /**
   * Позвать звуком, если этот повод не выключен галочкой.
   *
   * Вкладка, из которой зовут, решает, нужен ли звук вообще: за фоновой никто
   * не следит, а на открытую человек, скорее всего, смотрит прямо сейчас — и
   * звать его к тому, что у него перед глазами, незачем. «Скорее всего» уточняет
   * оболочка: панель бывает убрана с глаз, а окно IDE — свёрнуто (см. onlyIfAway).
   */
  const alert = useCallback((sound: SoundId, sessionId: string) => {
    const prefs = soundPrefsRef.current
    if (isMuted(prefs, sound)) return

    send({
      type: 'sound',
      sound,
      volume: volumeOf(prefs, sound),
      onlyIfAway: sessionId === activeRef.current,
    })
  }, [])

  /** Отложенная запись настройки звуков — см. changeSoundPrefs. */
  const soundSaveTimer = useRef<number | undefined>(undefined)

  /**
   * Показать новую настройку сразу, а записать чуть погодя.
   *
   * Ползунок громкости шлёт событие на каждый процент: без задержки одно
   * перетаскивание превратилось бы в сотню обращений к настройкам IDE.
   */
  const changeSoundPrefs = (next: SoundPrefs) => {
    setSoundPrefs(next)

    window.clearTimeout(soundSaveTimer.current)
    soundSaveTimer.current = window.setTimeout(() => {
      soundSaveTimer.current = undefined
      send({ type: 'soundSettings', muted: next.muted, volumes: next.volumes as Record<string, number> })
    }, SOUND_SAVE_DELAY_MS)
  }

  /**
   * Отложенную запись досылаем перед тем, как страница исчезнет.
   *
   * Иначе последняя четверть секунды возни с ползунком пропадала бы всякий раз,
   * когда панель перезагружают: настройка выглядела бы выставленной, а вернулась
   * бы прежней.
   */
  useEffect(() => {
    const flush = () => {
      if (soundSaveTimer.current === undefined) return

      window.clearTimeout(soundSaveTimer.current)
      soundSaveTimer.current = undefined

      const prefs = soundPrefsRef.current
      send({ type: 'soundSettings', muted: prefs.muted, volumes: prefs.volumes as Record<string, number> })
    }

    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])

  /** Был ли вход в прошлом ответе оболочки: разлогин виден только по смене. */
  const wasLoggedIn = useRef<boolean | null>(null)
  /**
   * Когда нажали «выйти»: пропажа входа сразу после этого — собственное действие,
   * а не новость. Время, а не просто отметка: выход может и не состояться (окно
   * терминала закрыли, опрос сдался), и вечная отметка проглотила бы потом
   * настоящий разлогин — ровно то единственное, ради чего звук тут и нужен.
   */
  const signedOutAt = useRef(0)

  /**
   * Звук зовёт человека от любой вкладки, а не только от открытой: у фоновой
   * есть лишь точка на ярлыке, а на неё смотрят ровно тогда, когда и так знают,
   * что там что-то происходит.
   */
  useEffect(() => {
    for (const sessionId of Object.keys(panels)) {
      const panel = panels[sessionId]
      if (!panel) continue

      const memory = soundMemory.current[sessionId]
      // Первый взгляд на вкладку — только знакомство: всё, что в ней уже лежит,
      // звучать не должно (см. rememberPanel).
      if (!memory) {
        soundMemory.current[sessionId] = rememberPanel(panel)
        continue
      }

      const sound = soundForPanel(panel, memory)
      if (sound) alert(sound, sessionId)
    }
  }, [panels, alert])

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
            if (message.sounds) {
              setSoundPrefs({
                muted: message.sounds.muted as SoundId[],
                volumes: message.sounds.volumes as Partial<Record<SoundId, number>>,
              })
            }
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
                titleSource: 'default' as const,
              })),
            )
            break

          case 'status':
            dispatchPanel({ session: message.sessionId, action: { kind: 'status', status: message.state } })
            break

          // Ответ на генерацию заголовка (см. submit): перезаписываем только
          // если вкладка ещё жива и с /clear её не переименовали обратно в
          // заглушку прямо сейчас — иначе устаревший ответ вернул бы заголовок,
          // от которого пользователь только что явно отказался.
          case 'sessionTitle':
            setSessions((current) =>
              current.map((session) =>
                session.id === message.sessionId && session.titleSource !== 'default'
                  ? { ...session, title: message.title, titleSource: 'llm' }
                  : session,
              ),
            )
            break

          case 'error':
            dispatchPanel({ session: message.sessionId, action: { kind: 'error', message: message.message } })
            break

          case 'agent':
            dispatchPanel({
              session: message.sessionId,
              action: { kind: 'agent', event: message.event, replay: message.replay },
            })
            // Разговор стёрли: вывод команд, который не успел уехать агенту, к
            // новому разговору отношения не имеет — вместе с лентой уходит и он.
            // Вместе с уже собранным забываем и то, что ещё бежит: иначе вывод
            // команды, запущенной в прошлом разговоре, приехал бы в новый и
            // уехал агенту с первым же его сообщением.
            if (message.event.type === 'conversation_reset') {
              forgetShellCommands(message.sessionId)
              setShellRuns((current) => ({ ...current, [message.sessionId]: [] }))
              // Заголовок вкладки — тоже часть того разговора, который только что
              // стёрли: без сброса он остался бы висеть от прежней темы, а
              // следующее сообщение уже не переименовало бы вкладку (см. submit).
              setSessions((current) =>
                current.map((session) =>
                  session.id === message.sessionId
                    ? { ...session, title: defaultTitle(session.id), titleSource: 'default' }
                    : session,
                ),
              )
            }
            break

          case 'processExited':
            dispatchPanel({
              session: message.sessionId,
              action: { kind: 'processExited', exitCode: message.exitCode },
            })
            break

          case 'picked':
            addToDraft({ kind: 'chip', chip: { kind: message.kind, value: message.value } })
            break

          case 'history':
            setHistory(message.conversations)
            break

          case 'mcpServers':
            setMcpServers(message.servers)
            setMcpLoading(false)
            setMcpFetchedAt(Date.now())
            break

          case 'mcpActionResult':
            setMcpMessage({ ok: message.ok, text: message.message })
            // Неудача — тоже итог: без этого не сумевший загрузиться список
            // остался бы со скелетом и погашенной кнопкой навсегда.
            if (!message.ok) setMcpLoading(false)
            break

          case 'plugins':
            setPluginsInstalled(message.installed)
            setPluginsAvailable(message.available)
            setPluginsLoading(false)
            setPluginsFetchedAt(Date.now())
            break

          case 'pluginActionResult':
            setPluginMessage({ ok: message.ok, text: message.message })
            if (!message.ok) setPluginsLoading(false)
            break

          case 'marketplaces':
            setMarketplaces(message.marketplaces)
            break

          case 'models':
            setModels(message.models)
            break

          case 'context':
            dispatchPanel({
              session: message.sessionId,
              action: { kind: 'context', used: message.used, max: message.max },
            })
            break

          case 'bashResult': {
            // В карточку — как в терминале, одним потоком: ошибки идут вперемешку
            // с обычным выводом ровно там, где их напечатала сама команда.
            const output = [message.stdout, message.stderr].filter((part) => part.trim().length > 0).join('\n')

            dispatchPanel({
              session: message.sessionId,
              action: { kind: 'bashFinished', id: message.id, output, exitCode: message.exitCode },
            })

            // Агенту — раздельно, своими тегами (см. shellText): по ним видно,
            // что команда ругалась, даже когда код возврата нулевой.
            //
            // Саму команду забираем ДО setState, а не внутри него: обновляющую
            // функцию React вызывает не ровно один раз (в строгом режиме —
            // дважды), и вычёркивание записи оттуда съедало бы собственный
            // результат — вывод не доезжал до агента вовсе.
            const ran = shellCommands.current[message.id]
            if (ran) {
              delete shellCommands.current[message.id]

              setShellRuns((current) => ({
                ...current,
                [ran.session]: [
                  ...(current[ran.session] ?? []),
                  { command: ran.command, stdout: message.stdout, stderr: message.stderr, exitCode: message.exitCode },
                ],
              }))
            }
            break
          }

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
              executablePath: message.executablePath,
              searched: message.searched,
            })
            if (message.loggedIn) setLoginWaiting(false)
            // Вход отвалился сам: пока не войдёшь заново, агент на любую просьбу
            // отвечает отпиской про /login, и заметить это стоит сразу, а не
            // через три бесполезных ответа. Про собственный выход и про самый
            // первый ответ (когда прежнего состояния ещё нет) молчим.
            // Про пропавший вход панель говорит и сама, целым экраном входа:
            // тому, кто в неё смотрит, звук тут ничего не добавит.
            if (
              !message.loggedIn &&
              wasLoggedIn.current === true &&
              Date.now() - signedOutAt.current > SIGN_OUT_GRACE_MS
            ) {
              alert('trouble', activeRef.current)
            }
            if (message.loggedIn) signedOutAt.current = 0
            wasLoggedIn.current = message.loggedIn
            break

          case 'modeAvailability':
            setBypassAvailable(message.bypassPermissions)
            break

          case 'model':
            // Настройка идёт следом за действующей моделью, а не за выбранной:
            // отвергнутая не должна ни стоять галочкой в меню, ни уехать флагом
            // в следующую вкладку — с ней процесс не поднимется вовсе.
            setPrefs((current) => ({ ...current, model: message.model }))
            dispatchPanel({
              session: message.sessionId,
              action: { kind: 'modelApplied', model: message.model, error: message.error },
            })
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
            addToDraft(
              message.asPlainText
                ? { kind: 'text', value: `@${message.path}` }
                : { kind: 'chip', chip: referenceChip(message) },
            )
            setFocusToken((current) => current + 1)
            break
        }
      }),
    [],
  )

  /**
   * Подписка живёт один раз, а активная вкладка меняется — держим её в ссылке.
   *
   * Обновляем прямо при отрисовке, а не эффектом: эффект оповещений объявлен
   * выше и в том же кадре сработал бы раньше — то есть решал бы, звучать ли, по
   * той вкладке, которая была открыта до переключения.
   */
  const activeRef = useRef(active)
  activeRef.current = active

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
   * решённым (карточка после этого не рисуется, см. Feed) и отвечает агенту,
   * который на этом самом месте и стоит.
   *
   * Режим панель здесь не выбирает сама — этим занимается оболочка (см.
   * ClaudePanel.decidePlan): одобрение переключает разговор в bypass, чтобы
   * дальнейшие шаги того же плана не спрашивали разрешения по одному; новый
   * режим приезжает обычным системным событием, как и при ручном выборе.
   */
  const decidePlan = useCallback(
    (itemId: string, decision: 'approve' | 'keepPlanning', message?: string) => {
      cards.decidePlan(itemId, decision)
      send({ type: 'planDecision', sessionId: active, id: itemId, decision, message })
    },
    [cards, active],
  )

  /**
   * Вопрос закрыли, не выбрав ни одного варианта: человек скажет своими
   * словами. Агенту это уходит отказом на его вызов — тем же путём, что и
   * «не разрешаю» у запроса разрешения: ход продолжается, а вопрос перестаёт
   * держать панель. Промолчать нельзя — агент так и ждал бы выбора.
   */
  const dismissAsk = useCallback(
    (itemId: string) => {
      cards.answerAsk(itemId)
      send({ type: 'askDismiss', sessionId: active, id: itemId })
    },
    [cards, active],
  )

  /**
   * Ответ на вопрос агента возвращается тем же вызовом инструмента, который его
   * и задал: ход стоит ровно на нём и продолжается с того же места, а не
   * начинается заново со следующего сообщения.
   *
   * В ленту ответ всё равно кладём репликой человека: иначе в переписке остался
   * бы вопрос без единого следа ответа на него.
   */
  const sendAnswers = useCallback(
    (itemId: string, answers: { question: string; answer: string }[]) => {
      // Помечаем отвеченной в любом случае — иначе карточка без единого
      // вопроса (например от пустого/сбойного вызова инструмента) не может
      // закрыться в принципе: слать action-то нечего, а кнопка тогда
      // навсегда ничего не делает.
      cards.answerAsk(itemId)

      const answered = answers.filter((entry) => entry.answer.trim().length > 0)
      if (answered.length === 0) return

      // Вопрос вместе со своим ответом, пары — через пустую строку. Одними
      // ответами подряд эта реплика в ленте не читалась вовсе: «Только
      // многострочной» без вопроса над ним не значит ничего, а вопросов в одном
      // вызове бывает до шести. Тем же текстом отвечаем и агенту, если ждать
      // ответа уже некому (см. askAnswer в protocol) — там он тоже понятнее.
      const text = answered.map((entry) => `${entry.question}\n${entry.answer}`).join('\n\n')

      send({
        type: 'askAnswer',
        sessionId: active,
        id: itemId,
        answers: Object.fromEntries(answered.map((entry) => [entry.question, entry.answer])),
        text,
      })
      dispatchPanel({
        session: active,
        action: { kind: 'prompt', tokens: [{ kind: 'text', value: text }], quotes: [], steering: true },
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
      // Мгновенная догадка по самой цитате — уже осмысленнее общего "fork N";
      // первое сообщение в форке сменит её на ответ LLM (см. sessionTitle).
      const short = deriveSessionTitle(quote, 48)
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
        next.splice(lastOfGroup + 1, 0, {
          id,
          title: short || `fork ${inGroup}`,
          state: 'idle',
          groupId,
          depth,
          titleSource: short ? 'heuristic' : 'default',
        })
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
    setSessions((current) => [
      ...current,
      { id, title: defaultTitle(id), state: 'idle', groupId: id, depth: 0, titleSource: 'default' },
    ])
    setActive(id)
    send({ type: 'newSession', kind: 'main', sessionId: id, title: defaultTitle(id) })
  }, [])

  /** Новый порядок вкладок после перетаскивания — см. moveGroup. */
  const reorderGroups = useCallback((groupId: string, beforeGroupId: string | null) => {
    setSessions((current) => moveGroup(current, groupId, beforeGroupId))
  }, [])

  /** Прошлый разговор продолжается в своей вкладке: панель проиграет его переписку. */
  const resume = useCallback((entry: HistoryEntry) => {
    const id = `resumed-${entry.id.slice(0, 8)}`
    const title = deriveSessionTitle(entry.title, 40)

    setOpenPanel(null)
    setSessions((current) =>
      current.some((session) => session.id === id)
        ? current
        : // Название уже установлено панелью истории (LLM-заголовок из кеша или
          // эвристика) — это не заглушка, которую стоит заменить первым же
          // следующим сообщением в этой вкладке.
          [...current, { id, title, state: 'idle', groupId: id, depth: 0, titleSource: 'llm' }],
    )
    setActive(id)
    send({ type: 'resumeSession', sessionId: id, conversationId: entry.id })
  }, [])

  /**
   * Выбор модели: и из меню в нижней строке, и командой в поле — одно и то же
   * действие, поэтому и путь у него один. Через оболочку, а не ходом агенту:
   * выбор достаётся новым вкладкам и переживает перезапуск IDE.
   */
  const pickModel = useCallback(
    (model: string) => {
      setPrefs((current) => ({ ...current, model }))
      send({ type: 'setModel', sessionId: active, model })
      // Пока агент не ответил, показываем выбранное — иначе выбор выглядит
      // потерянным; ответ либо подтвердит его, либо вернёт прежнюю модель.
      dispatchPanel({ session: active, action: { kind: 'modelRequested', model } })
    },
    [active],
  )

  const pickEffort = useCallback(
    (effort: string) => {
      setPrefs((current) => ({ ...current, effort }))
      send({ type: 'setEffort', sessionId: active, effort })
    },
    [active],
  )

  const runLocal = useCallback(
    ({ name, argument }: LocalCommand) => {
      if (name === 'model') {
        pickModel(argument)
        return
      }

      if (name === 'effort') {
        pickEffort(argument)
        return
      }

      if (name === 'login') {
        send({ type: 'login' })
        setLoginWaiting(true)
        return
      }

      if (name === 'logout') {
        // Вышли сами — тревожить этим звуком некого (см. обработку auth).
        signedOutAt.current = Date.now()
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
    [fork, pickModel, pickEffort],
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

  /**
   * Команда bash-режима: её выполняет оболочка в рабочей директории проекта, а
   * не агент (см. feed/bash). Карточку ставим в ленту сразу, ещё до вывода, —
   * длинная команда идёт секундами, и всё это время должно быть видно, что она
   * запущена.
   */
  const runShell = useCallback(
    (command: string) => {
      // Счётчик, а не одно только время: две команды, запущенные в одну и ту же
      // миллисекунду (так их проигрывает харнесс), получили бы один номер — а по
      // нему в ленте ищут карточку и вспоминают текст команды для агента.
      shellSeq.current += 1
      const id = `bash-${Date.now()}-${shellSeq.current}`
      shellCommands.current[id] = { session: active, command }

      dispatchPanel({ session: active, action: { kind: 'bashStarted', id, command } })
      send({ type: 'bash', sessionId: active, id, command })
    },
    [active],
  )

  /**
   * Отправка сообщения: сразу в работу или в очередь.
   *
   * «Сразу» работает и во время хода: агент запущен с потоковым вводом, и
   * дописанное в него сообщение он подхватывает на ближайшем шаге, не начиная
   * ход заново — то же самое делает Enter в терминале. Очередь — обратное:
   * явная просьба сначала доделать текущее, а это взять следующим.
   */
  const submit = useCallback((queued: boolean, overrideText?: string) => {
    // Команды панели агенту не уходят: вход и выход в потоковом режиме ему
    // недоступны, а ветвление вообще про устройство панели.
    // Цитаты и вложения команде не мешают: они останутся в поле и уедут со
    // следующим сообщением — терять их из-за одной команды было бы обидно.
    // Строгая проверка типом, а не просто "overrideText !== undefined": эта
    // функция вызывается и из обработчиков клика, куда React передаёт объект
    // события — сравнение с undefined приняло бы его за подменённый текст.
    const isOverride = typeof overrideText === 'string'
    // Пустой хвост снимаем сразу: он невидим в поле (последняя строка там не
    // занимает места, на ней стоит разве что курсор), а в ленте показался бы
    // лишней пустой строкой. Агенту его и так не отправляет composePrompt.
    const tokens = isOverride
      ? [{ kind: 'text' as const, value: overrideText }]
      : trimTrailingSpace(draft.tokens)
    const quotes = isOverride ? [] : draft.quotes

    // «!» в начале — команда терминала, а не сообщение агенту: выполняет её
    // панель и показывает вывод своей карточкой (см. runShell).
    const command = bashCommand(tokens)
    if (command) {
      runShell(command)
      if (!isOverride) editDraft(active, { tokens: [] })
      return
    }

    // Через tokensText, а не plainText: команда в поле — плашка, и голый текст
    // её не видит вовсе (см. captureCommand). Для агента она и так значит ровно
    // "/имя", им же её и узнаём.
    const local = localCommand(tokensText(tokens), models)
    if (local) {
      runLocal(local)
      if (!isOverride) editDraft(active, { tokens: [] })
      return
    }

    const written = isOverride ? overrideText : composePrompt(draft, imageBaseCount)
    if (!written) return

    // Первое сообщение этого захода вкладки — сразу ставим человекочитаемую
    // догадку вместо "new session"/"fork N", не дожидаясь ответа LLM (см.
    // sessionTitle): тот придёт следом и заменит её, если получится.
    setSessions((current) =>
      current.map((session) =>
        session.id === active && session.titleSource === 'default'
          ? { ...session, title: deriveSessionTitle(written), titleSource: 'heuristic' }
          : session,
      ),
    )

    // Вывод команд, выполненных с прошлого сообщения, уезжает впереди этого —
    // и уходит из накопителя: второй раз агенту он ни к чему. В ленту при этом
    // не попадает: там он уже стоит своей карточкой, на своём месте по времени.
    const runs = shellRuns[active] ?? []
    const text = runs.length > 0 ? `${shellText(runs)}\n\n${written}` : written
    if (runs.length > 0) setShellRuns((current) => ({ ...current, [active]: [] }))

    const images = isOverride ? [] : imageAttachments(draft.tokens)
    const attachCount = isOverride ? 0 : draft.tokens.filter((token) => token.kind === 'chip').length

    // В очередь — только пока агент занят: свободному отправляем сразу, ждать
    // ему нечего.
    if (queued && running) {
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

    /**
     * Пока карточка плана ждёт решения, ход стоит ровно на ней: агент вызвал
     * ExitPlanMode и не двинется, что ему ни пиши. Обычным сообщением такой
     * текст просто пропадал — оно уходило в стоящий процесс, и панель выглядела
     * зависшей: сообщение в ленте есть, «Claude is thinking» переливается, а не
     * происходит ничего.
     *
     * Поэтому написанное при живом плане — это и есть ответ по плану: то же
     * самое «Keep planning», только с замечанием, из-за которого план и не
     * приняли. Ровно так это работает и в терминале.
     */
    const plan = pendingPlan(panel, cards.planDecisions)
    if (plan) {
      dispatchPanel({
        session: active,
        action: { kind: 'prompt', tokens, quotes: quotes.map((quote) => quote.text), steering: true },
      })
      // Картинку ответом на разрешение не передать: туда уходит ровно одна
      // строка (см. ClaudePanel.decidePlan). Поэтому замечание со вложениями
      // идёт обычным сообщением следом — ход к этому моменту уже отпущен и
      // примет его, — а плану достаётся общее «дорабатываем». Так и текст, и
      // картинка доезжают до агента, причём каждый ровно по разу.
      if (images.length > 0) {
        decidePlan(plan.id, 'keepPlanning')
        send({ type: 'prompt', sessionId: active, text, images })
      } else {
        decidePlan(plan.id, 'keepPlanning', text)
      }

      if (!isOverride) setDrafts((current) => ({ ...current, [active]: EMPTY_DRAFT }))
      return
    }

    // Досылка продолжает начатое, поэтому лента остаётся как есть: карточки
    // субагентов этого же хода прятать не за что, они ещё в деле.
    if (!running) {
      clearFinishedAgents(active)
      setActiveStream('main')
    }

    dispatchPanel({
      session: active,
      action: { kind: 'prompt', tokens, quotes: quotes.map((quote) => quote.text), steering: running },
    })

    send({ type: 'prompt', sessionId: active, text, images })
    if (!isOverride) setDrafts((current) => ({ ...current, [active]: EMPTY_DRAFT }))
  }, [
    draft,
    running,
    active,
    runLocal,
    runShell,
    editDraft,
    imageBaseCount,
    models,
    panel,
    cards.planDecisions,
    decidePlan,
    shellRuns,
  ])

  const sendNow = useCallback(() => submit(false), [submit])
  const queueNext = useCallback(() => submit(true), [submit])

  /**
   * Есть ли что отправлять: текст, вложение или цитата. Пустое поле — обе
   * кнопки погашены, и Enter тоже ничего не делает.
   */
  const draftReady = useMemo(() => {
    if (draft.quotes.length > 0) return true
    if (draft.tokens.some((token) => token.kind === 'chip')) return true
    return plainText(draft.tokens).trim().length > 0
  }, [draft])

  // Только для локальной страницы-харнесса (webview/src/harness) — имитирует
  // настоящую отправку сообщения из поля ввода. Vite статически подставляет
  // import.meta.env.DEV в false при vite build, поэтому в собранном плагине
  // этого кода физически не будет.
  useEffect(() => {
    if (!import.meta.env.DEV) return

    window.__accHarnessSend = (text: string) => submit(false, text)
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
  /**
   * Что сейчас держит ход и ждёт человека. Обе панели считаем здесь, а не по
   * месту: цифровые хоткеи у них общие, и решить, чьи они, можно только зная
   * обе сразу.
   */
  const permission = pendingPermission(panel.items, resolvedStream)
  const ask = pendingAsk(panel.items, cards.answeredAsks, resolvedStream)
  const commands = useMemo(
    () => buildCommands(panel.slashCommands, commandHints),
    [panel.slashCommands, commandHints],
  )
  const tabs = useMemo(
    () =>
      sessions.map((session) => ({
        ...session,
        state: sessionState(panels[session.id], session.id === active, cards),
      })),
    [sessions, panels, active, cards.planDecisions, cards.answeredAsks],
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
          onSetExecutablePath={(path) => send({ type: 'setExecutablePath', path })}
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
          delete soundMemory.current[id]
          // И собранный вывод, и то, что ещё бежит: без второго пришедший позже
          // ответ оболочки завёл бы запись обратно — на разговор, которого нет.
          forgetShellCommands(id)
          setShellRuns((current) => {
            if (!(id in current)) return current
            const next = { ...current }
            delete next[id]
            return next
          })
          dispatchPanel({ session: id, closed: true })
          const next = sessions.filter((session) => session.id !== id)
          setSessions(next)
          if (active === id) setActive(next[0]?.id ?? MAIN_SESSION)
        }}
        onNewSession={() => startSession(`session-${Date.now()}`)}
        onReorderGroups={reorderGroups}
        // Открывается на том, что загружено заранее, а свежий список подъезжает
        // следом: он дешёвый (чтение файлов на диске), зато прибавляется прямо
        // во время работы — каждый новый разговор.
        onOpenHistory={() => {
          if (openPanel === 'history') {
            setOpenPanel(null)
            return
          }
          setOpenPanel('history')
          send({ type: 'history' })
        }}
        // Вкладка открывается на том, что загружено заранее. Спрашиваем заново,
        // только если прошлый запрос уже вернулся, а показанное успело устареть.
        onOpenMcp={() => {
          if (openPanel === 'mcp') {
            setOpenPanel(null)
            return
          }
          setOpenPanel('mcp')
          setMcpMessage(null)
          if (!mcpLoading && Date.now() - mcpFetchedAt > LIST_STALE_MS) loadMcp(mcpServers !== null)
        }}
        onOpenPlugins={() => {
          if (openPanel === 'plugins') {
            setOpenPanel(null)
            return
          }
          setOpenPanel('plugins')
          setPluginMessage(null)
          if (!pluginsLoading && Date.now() - pluginsFetchedAt > LIST_STALE_MS) {
            loadPlugins(pluginsInstalled !== null)
          }
        }}
        onOpenSounds={() => setOpenPanel(openPanel === 'sounds' ? null : 'sounds')}
      />

      {openPanel === 'history' ? (
        <History conversations={history} onOpen={resume} onClose={() => setOpenPanel(null)} />
      ) : null}

      {/* Прибиваем только по просьбе — саму работу останавливает CLI, а о том,
          что она кончилась, он сообщит обычным уведомлением: чип уйдёт сам, и
          подделывать его конец на своей стороне незачем. */}
      {stopping ? (
        <Confirm
          title={stopping.title}
          subject={stopping.subject}
          confirmLabel="Stop"
          onCancel={() => setStopping(null)}
          onConfirm={() => {
            send({ type: 'stopTask', sessionId: active, taskId: stopping.id })
            setStopping(null)
          }}
        />
      ) : null}

      {openPanel === 'sounds' ? (
        <Sounds
          prefs={soundPrefs}
          onToggle={(sound) => changeSoundPrefs(toggleSound(soundPrefs, sound))}
          onVolume={(sound, volume) => changeSoundPrefs(setVolume(soundPrefs, sound, volume))}
          // Отключённый звук тоже проигрывается: послушать, что именно
          // выключаешь, — ровно то, зачем на кнопку и жмут. Громкость берём
          // ту, что стоит прямо сейчас: иначе ползунок не с чем сверять.
          onPreview={(sound) => send({ type: 'sound', sound, volume: volumeOf(soundPrefs, sound) })}
          onClose={() => setOpenPanel(null)}
        />
      ) : null}

      {openPanel === 'mcp' ? (
        <Mcp
          servers={mcpServers}
          loading={mcpLoading}
          message={mcpMessage}
          onRefresh={() => {
            setMcpMessage(null)
            loadMcp()
          }}
          onReconnect={(name) => {
            setMcpMessage(null)
            send({ type: 'mcpReconnect', sessionId: active, name })
          }}
          // Адрес входа откроет оболочка в системном браузере, а код от него
          // поймает сам CLI: панели остаётся дождаться нового статуса.
          onAuthenticate={(name) => {
            setMcpMessage(null)
            send({ type: 'mcpAuthenticate', sessionId: active, name })
          }}
          onRemove={(name) => {
            setMcpMessage(null)
            send({ type: 'mcpRemove', sessionId: active, name })
          }}
          onAdd={(name, command, transport) => {
            setMcpMessage(null)
            send({ type: 'mcpAdd', sessionId: active, name, command, transport })
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
            setPluginMessage(null)
            loadPlugins()
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
        <StreamSwitcher
          tabs={agentTabs}
          background={panel.background}
          mainStatus={mainStatus}
          active={resolvedStream}
          onPick={setActiveStream}
          onStop={setStopping}
        />

        <div className={s.body}>
          {resolvedStream === 'main' ? (
            <Feed
              items={panel.items}
              streamingText={panel.streamingText}
              streamingId={panel.streamingId}
              streamingThinking={panel.streamingThinking}
              streaming={running}
              streamStatus={streamStatus(panel, cards)}
              cards={cards}
              scrollRef={(element) => {
                feedRef.current = element
              }}
              onScroll={clearSelection}
              onPlanDecision={decidePlan}
              onDismissError={(id) => dispatchPanel({ session: active, action: { kind: 'dismissError', id } })}
              onOpenLink={(url) => send({ type: 'openExternal', url })}
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
            />
          ) : null}
        </div>

        <div className={composer.dock}>
          <PermissionPanel
            item={permission}
            composerEmpty={!draftReady}
            onDecide={decidePermission}
          />

          <AskPanel
            key={ask?.id ?? 'none'}
            item={ask}
            composerEmpty={!draftReady}
            // Пока рядом висит неотвеченное разрешение, цифры принадлежат ему:
            // две панели, слушающие одну и ту же клавишу, отвечали бы обе разом.
            hotkeys={!permission}
            onSubmit={sendAnswers}
            onDismiss={dismissAsk}
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
            contextPercent={context.percent}
            commands={commands}
            models={models}
            meters={
              <UsageMeters todayTokens={usage.todayTokens ?? '…'} usage={usage} />
            }
            files={files}
            imageBaseCount={imageBaseCount}
            focusToken={focusToken}
            onTokensChange={(tokens) => editDraft(active, { tokens })}
            onAttach={() => send({ type: 'pick' })}
            // Плашки соберёт оболочка и вернёт их обычным picked — тем же путём,
            // что и выбор через диалог: файл это или папка, знает только она.
            onDropFiles={(paths) => send({ type: 'dropped', paths })}
            registerInsert={registerInsert}
            onSubmit={sendNow}
            onQueue={queueNext}
            canSubmit={draftReady}
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
          {...menuProps(menu.kind, models, prefs.model, switched, prefs.effort, mode)}
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          onPick={(id) => {
            setMenu(null)

            if (menu.kind === 'model') pickModel(id)
            if (menu.kind === 'effort') pickEffort(id)
            if (menu.kind === 'mode') setMode(id)
          }}
        />
      ) : null}
    </div>
  )
}

// --- Состояние сессий -------------------------------------------------------

type PanelsState = Record<string, PanelState>

/**
 * Обычное изменение разговора — или его закрытие: закрытая вкладка уходит из
 * состояния целиком, а не остаётся лежать со своей лентой.
 */
type PanelsAction =
  | { session: string; action: Parameters<typeof reducePanel>[1] }
  | { session: string; closed: true }

const panelsReducer = (state: PanelsState, event: PanelsAction): PanelsState => {
  /**
   * Пока закрытая вкладка оставалась в состоянии, за неё продолжали платить: всё,
   * что обходит разговоры (например, звуковые оповещения), видело её при каждом
   * обновлении — то есть на каждом кусочке ответа, печатающегося в любой другой
   * вкладке, — и заново разбиралось с лентой разговора, которого больше нет.
   */
  if ('closed' in event) {
    if (!(event.session in state)) return state

    const next = { ...state }
    delete next[event.session]
    return next
  }

  return {
    ...state,
    [event.session]: reducePanel(state[event.session] ?? initialPanelState, event.action),
  }
}

/**
 * Что показывает кружок вкладки. Крах процесса важнее всего: ход прерван не по
 * своей воле, и об этом обязана сказать даже вкладка, на которую сейчас не
 * смотрят. Дальше — ожидание человека, и лишь потом обычная работа.
 */
const sessionState = (panel: PanelState | undefined, active: boolean, cards: CardState): SessionState => {
  if (!panel) return 'idle'

  if (panel.crashed) return 'crashed'

  // Неотвеченный запрос разрешения зовёт всегда: без человека ход не сдвинется.
  if (panel.items.some((item) => item.kind === 'perm' && item.decision === null)) return 'attention'

  // Вопрос агента и показанный план держат ход ровно так же намертво, а сказать
  // об этом умела до сих пор только строка статуса открытой вкладки: фоновая
  // бесконечно крутила «работает». Смотрим лишь у идущего хода — те же карточки
  // приезжают и с перепиской, поднятой из истории, но там решать давно нечего.
  if (panel.status === 'running' && panel.items.some((item) => awaitsYou(item, cards))) return 'attention'

  /**
   * Ошибка зовёт только фоновую вкладку и только пока она последнее, что
   * случилось: на открытой вкладке человек и так видит её в ленте, а точка,
   * которая после этого пульсирует до конца разговора, — просто шум. Итог хода
   * (meta) не в счёт: он приходит следом за отказом и рассказывает про тот же
   * оборванный ход.
   */
  const last = [...panel.items].reverse().find((item) => item.kind !== 'meta')
  if (!active && last?.kind === 'error') return 'attention'

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
 * Стоит ли ход на этом элементе ленты, ожидая человека. Запрос разрешения,
 * вопрос с вариантами и показанный план держат его одинаково намертво, поэтому и
 * правило у них одно: разъехавшись, оно врало бы то строкой статуса, то точкой
 * на вкладке — смотря где про какой случай забыли.
 */
const awaitsYou = (item: FeedItem, cards: CardState): boolean =>
  (item.kind === 'perm' && item.decision === null) ||
  (item.kind === 'ask' && !cards.answeredAsks.includes(item.id)) ||
  (item.kind === 'plan' && cards.planDecisions[item.id] === undefined)

/** Главный поток, а не отдельный субагент: у того своя вкладка и свой статус. */
const ownStream = (item: FeedItem): boolean => !('taskId' in item) || item.taskId === undefined

/**
 * Пока висит неотвеченный запрос разрешения или вопрос ГЛАВНОГО потока, ход
 * на деле не думает — он стоит и ждёт решения человека. «Claude is thinking»
 * в этот момент было бы неправдой. Решение конкретного агента сюда не
 * считается: за него отвечает статус в дропдауне и его собственная вкладка —
 * если бы главная строка статуса реагировала и на них, она бы сама стала той
 * самой нечестной подписью, ради ухода от которой затевался весь редизайн.
 */
const streamStatus = (panel: PanelState, cards: CardState): string => {
  // Про сжатие говорит его собственная карточка в ленте (CONTEXT с бегущей
  // полосой) — второй подписи о том же прямо под ней быть не должно.
  if (panel.compacting) return ''

  const awaitingDecision = panel.items.some((item) => ownStream(item) && awaitsYou(item, cards))
  if (awaitingDecision) return 'Waiting for you'

  const last = panel.items.at(-1)
  const working = last?.kind === 'toolGroup' && last.pending && last.tools.length > 0
  return working ? 'Claude is working' : 'Claude is thinking'
}

/**
 * Показанный план, по которому ещё нет решения: пока он есть, ход стоит на нём.
 *
 * Только у идущего хода: карточка плана остаётся в ленте навсегда, в том числе у
 * разговора, поднятого из истории, — а там решать давно нечего, ход кончился
 * когда-то в прошлом. Без этой проверки первое же сообщение в восстановленной
 * вкладке уходило бы не промптом, а замечанием к древнему плану.
 */
const pendingPlan = (
  panel: PanelState,
  decisions: Record<string, 'approve' | 'keepPlanning'>,
): PlanItem | undefined =>
  panel.status === 'running'
    ? [...panel.items].reverse().find((item): item is PlanItem => item.kind === 'plan' && decisions[item.id] === undefined)
    : undefined

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
  // Оборванный агент — не то же самое, что отработавший: раньше и прибитый, и
  // упавший получали тот же зелёный кружок, что и дошедший до конца.
  if (!task.pending) return task.outcome === 'failed' ? 'failed' : task.outcome === 'stopped' ? 'stopped' : 'done'

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
      // Прибивать нечего у того, кто уже закончил, и нечем — пока CLI не назвал
      // задачу своим именем (см. TaskItem.taskId).
      stopId: task.pending ? task.taskId : undefined,
    }))

const menuProps = (
  kind: SelectorKind,
  models: ModelInfo[] | null,
  /** Выбранное значение, а не то, во что его развернул агент: галочка обязана стоять на выбранном. */
  selectedModel: string,
  /** Модель, на которую разговор увёл сам агент, — тогда галочка стоит на ней (см. modelMenu). */
  switched: string | undefined,
  effort: string,
  mode: string,
): { title: string; hint: string; width: number; options: MenuOption[]; selected: string } => {
  if (kind === 'model') {
    return {
      title: 'MODEL',
      hint: '/model',
      width: 344,
      ...modelMenu(models, selectedModel, switched),
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
