import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { isBashDraft } from '../feed/bash'
import { matchFiles } from '../feed/files'
import { chipLabel, chipTitle } from '../feed/reference'
import {
  argumentOptions,
  argumentQuery,
  captureCommand,
  commandChip,
  commandNameBeforeArgument,
  matchArguments,
  matchCommands,
  plainText,
  requiresArgument,
  slashQuery as slashQueryFromText,
  type CommandEntry,
} from '../feed/slash'
import { clipboardHtml, clipboardTokens, tokensText } from '../feed/tokens'
import type { Chip, ChipKind, UserToken } from '../feed/types'
import { isSideComposerLayout, type ComposerLayout } from '../composerLayout'
import type { ModelInfo } from '../protocol'
import { SlashSuggest } from './SlashSuggest'
import { contextColor, contextGlow, Selectors, type Anchor, type SelectorKind } from './StatusBar'
import s from './composer.module.css'

/** Засечки на пятых долях — не связаны с порогами цвета, чисто масштаб шкалы. */
const CONTEXT_METER_TICKS = [20, 40, 60, 80]

/**
 * Полоска контекста в самом верху поля — единственное место, где видно, сколько
 * его занято: цифрой то же самое нигде не повторяется. Заполнение и цвет
 * читаются мельком, а точное число в этом решении («не пора ли сжать») ничего
 * не добавляет.
 */
const ContextMeter = ({ percent }: { percent: number }) => {
  const color = contextColor(percent)
  const glow = contextGlow(percent)

  return (
    // Своя строка над полем, а не слой поверх его верхнего отступа: отступ
    // прокручивается вместе с текстом, и в длинном сообщении строки заезжали
    // под шкалу — она читалась как зачёркивание. Отдельная строка физически вне
    // прокрутки, заехать под неё нечему.
    <div className={s.contextMeterRow} aria-hidden="true">
      <div className={s.contextMeter}>
        <div
          className={s.contextMeterFill}
          style={{ width: `${percent}%`, background: color, boxShadow: `0 0 8px ${glow.strong}, 0 0 16px ${glow.soft}` }}
        />
        {CONTEXT_METER_TICKS.map((tick) => (
          <span key={tick} className={s.contextMeterTick} style={{ left: `${tick}%` }} />
        ))}
      </div>
    </div>
  )
}

/** Сколько сегментов в вертикальной шкале — см. ContextMeterVertical. */
const CONTEXT_METER_SEGMENTS = 5

/**
 * То же самое, что ContextMeter, но вертикальной шкалой слева от поля — так
 * узкое поле (compact, left, right) экономит высоту, отдавая её textarea, а
 * не горизонтальной полоске над ним (см. Composer.layout).
 *
 * Сегменты зажигаются целиком, а не заливкой по проценту: с плавной заливкой,
 * обрезанной точно по percent%, самый верхний закрашенный сегмент почти
 * всегда попадал под обрез серединой — выходил на глаз короче остальных,
 * ровных. Дискретные пять делений и не обещают точности до пикселя, поэтому
 * округляем вверх — сегмент загорается, как только прогресс зашёл в его
 * долю хоть немного, тем же способом, что и стрелка индикатора заряда.
 */
const ContextMeterVertical = ({ percent }: { percent: number }) => {
  const color = contextColor(percent)
  const glow = contextGlow(percent)
  const clamped = Math.min(100, Math.max(0, percent))
  const lit = Math.ceil((clamped / 100) * CONTEXT_METER_SEGMENTS)

  return (
    <div className={s.compactMeter} aria-hidden="true">
      <div className={s.compactMeterTrack}>
        {Array.from({ length: CONTEXT_METER_SEGMENTS }, (_, index) => (
          <span
            key={index}
            className={s.compactMeterSeg}
            style={
              index < lit
                ? { background: color, boxShadow: `0 0 8px ${glow.strong}, 0 0 16px ${glow.soft}` }
                : undefined
            }
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Скрепка на кнопке вложений: она открывает обычный системный выбор файлов, а
 * «собака» обещала совсем другое — упоминание файла прямо в тексте, как в самом
 * Claude Code. Рисунком, а не символом из шрифта: типографская скрепка есть не
 * во всех начертаниях и в моноширинном ряду выглядит то крупнее, то мельче
 * соседей.
 *
 * Нарисована наискосок, а стоит вертикально: до вертикали её доворачивает стиль
 * (см. attachIcon в composer.module.css).
 */
const Paperclip = () => (
  <svg className={s.attachIcon} viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const CHIP_STYLE: Record<ChipKind, { background: string; borderColor: string; color: string }> = {
  file: { background: 'var(--acc-accent-12)', borderColor: 'var(--acc-accent-32)', color: 'var(--acc-accent-light)' },
  img: { background: 'var(--acc-agent-12)', borderColor: 'var(--acc-agent-32)', color: 'var(--acc-agent-light)' },
  dir: { background: 'var(--acc-ok-12)', borderColor: 'var(--acc-ok-32)', color: 'var(--acc-ok-light)' },
  cmd: { background: 'var(--acc-warn-12)', borderColor: 'var(--acc-warn-32)', color: 'var(--acc-warn-light)' },
  ref: { background: 'var(--acc-branch-12)', borderColor: 'var(--acc-branch-32)', color: 'var(--acc-branch-light)' },
  quote: { background: 'var(--acc-quote-12)', borderColor: 'var(--acc-quote-32)', color: 'var(--acc-quote)' },
  // Вставка из буфера — единственная плашка без своей сущности за спиной: это
  // просто текст, который свернули. Поэтому и цвет у неё нейтральный, а не
  // очередной цветной: она не встаёт в один ряд с файлом, картинкой и командой.
  paste: { background: 'var(--acc-paste-12)', borderColor: 'var(--acc-paste-32)', color: 'var(--acc-paste)' },
}

/** Чей это узел: чтобы забрать байты картинки обратно, строку с DOM не парсим. */
const chipByNode = new WeakMap<HTMLElement, Chip>()

/** Подсветка плашки, до которой дошли стрелкой (см. .tokenSelected в стилях). */
const SELECTED_CHIP_CLASS = s.tokenSelected ?? ''

/** Клавиши, которые сами по себе ничего не набирают и ничего не двигают. */
const MODIFIER_KEYS = ['Shift', 'Meta', 'Control', 'Alt', 'CapsLock']

interface ComposerProps {
  /** Чья это вкладка — история отмены своя у каждой, а не одна на все сразу. */
  sessionId: string
  /** Текст и вложения одной последовательностью — в том порядке, в каком их вставили. */
  tokens: UserToken[]
  streaming: boolean
  planMode: boolean
  /** То же число, что "ctx" в строке статуса — красит полоску контекста в поле. */
  contextPercent: number
  /** Команды панели и агента одним списком. */
  commands: CommandEntry[]
  /** Каталог моделей от CLI — из него подсказка значений для `/model`. */
  models: ModelInfo[] | null
  /** Строка расхода (ctx/5h/wk/tok) — стоит в нижнем ряду поля, см. UsageMeters. */
  meters: ReactNode
  /** Файлы проекта для подсказки "@" — от корня рабочей директории. */
  files: string[]
  /** Сколько картинок уже ушло раньше в этой сессии — нумерация новых продолжает отсюда. */
  imageBaseCount: number
  /** Панель просит сфокусировать поле, например после ссылки из редактора. */
  focusToken: number
  onTokensChange: (tokens: UserToken[]) => void
  onAttach: () => void
  /** Файлы и папки, брошенные в поле: плашки из них соберёт оболочка (см. protocol). */
  onDropFiles: (paths: string[]) => void
  /**
   * Над панелью держат файл, о котором знает только оболочка: перетаскивание
   * внутри IDE в страницу не приходит вовсе (см. fileDrag). Подсветка от него
   * та же, что и от переноса, который поле видит само.
   */
  fileDragOver?: boolean
  /**
   * Отдаёт наружу вставку в место курсора — ею панель кладёт в поле то, что
   * пришло из IDE: ссылку из редактора, выбранный диалогом файл, брошенную
   * мышью папку. Дописывать такое в конец состояния нельзя: место курсора живёт
   * в самом поле, и снаружи его попросту не видно.
   */
  registerInsert: (insert: ((token: UserToken) => void) | null) => void
  /** Отправить сейчас: занятому агенту сообщение дойдёт на ближайшем его шаге. */
  onSubmit: () => void
  /** Отложить: агент возьмёт это следующим, когда закончит начатое. */
  onQueue: () => void
  /** Есть ли что отправлять — текст, вложение или цитата. */
  canSubmit: boolean
  onStop: () => void
  /** Stop не подтвердился дольше разумного — предлагаем убить процесс насильно. */
  stopStalled: boolean
  onForceStop: () => void
  /**
   * Где сидит поле ввода — та же раскладка, что и у всей панели (см. App.tsx).
   * compact сжимает сам ряд: полоска контекста уходит налево вертикальной
   * шкалой, а MODEL/EFFORT/MODE встают рядом с полем — своей строки статуса
   * под ним в compact не бывает. left/right тоже сжимают ряд и полоску, но
   * MODEL/EFFORT/MODE с кнопками уезжают в боковую рельсу на всю высоту
   * панели (см. railContainer) — своей строки статуса тоже нет (см. App.tsx).
   */
  layout?: ComposerLayout
  /**
   * Для compact и left/right: строки статуса под полем в этих раскладках нет
   * (см. App.tsx), и MODEL/EFFORT/MODE переезжают в сам композер (compact)
   * или в боковую рельсу (left/right) — тем же колбэком, что открывает и
   * остальные меню.
   */
  model?: string
  effort?: string
  mode?: string
  onOpenSelector?: (kind: SelectorKind, anchor: Anchor) => void
  /**
   * Узел боковой рельсы left/right (см. App.tsx) — MODEL/EFFORT/MODE, расход
   * и кнопки уходят туда порталом, а не рендерятся прямо здесь: рельсе нужна
   * вся высота панели, от верха ленты до низа поля, а сам композер стоит
   * только рядом с полем, гораздо ниже. Состояние и обработчики при этом
   * остаются в композере — портал переносит только разметку.
   * null/undefined — ещё не примонтирован либо раскладка не left/right.
   */
  railContainer?: HTMLElement | null
}

export const Composer = ({
  sessionId,
  tokens,
  streaming,
  planMode,
  contextPercent,
  commands,
  models,
  meters,
  files,
  imageBaseCount,
  focusToken,
  onTokensChange,
  onAttach,
  onDropFiles,
  fileDragOver = false,
  registerInsert,
  onSubmit,
  onQueue,
  canSubmit,
  onStop,
  stopStalled,
  onForceStop,
  layout = 'bottom',
  model,
  effort,
  mode,
  onOpenSelector,
  railContainer,
}: ComposerProps) => {
  const compact = layout === 'compact'
  const rail = isSideComposerLayout(layout)
  const [focused, setFocused] = useState(false)
  /**
   * Над полем висит перетаскиваемый файл — подсвечиваем, куда его бросят. Это
   * перенос, который видит сама страница (обычный браузер, харнесс); тот, что
   * ведёт IDE, приходит отдельным пропом (см. fileDragOver).
   */
  const [dropping, setDropping] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const input = useRef<HTMLDivElement>(null)
  /** Начало координат для наложенного хинта аргумента — сам хинт не часть поля. */
  const box = useRef<HTMLDivElement>(null)
  const [ghostRect, setGhostRect] = useState<{ left: number; top: number; height: number } | null>(null)

  /**
   * Последнее, что панель сама сообщила наружу. Если входящие tokens — ровно
   * это же значение, значит правку вызвали мы сами (обычная печать), и DOM уже
   * верный: перестраивать его — только терять место курсора. А вот если tokens
   * пришли снаружи (переключили вкладку, прикрепили файл через диалог IDE,
   * выбрали слэш-команду) — DOM отстал, и его нужно перестроить.
   */
  const lastReported = useRef<UserToken[] | null>(null)

  /**
   * Плашка, до которой дошёл курсор стрелкой. Она неделима, и перешагивать её
   * молча, как это делает браузер, нельзя: тогда единственный способ убрать
   * вложение с клавиатуры — угадать, с какой стороны стоит курсор, и надеяться,
   * что backspace снесёт именно её. Пока плашка выделена, backspace убирает
   * ровно её, а следующая стрелка в ту же сторону проходит дальше — тот же
   * жест, что и в самом Claude Code.
   *
   * Ссылка, а не состояние: плашки живут в DOM мимо React (см. renderChipNode),
   * и перерисовывать из-за подсветки нечего — класс ставится прямо на узел.
   */
  const selectedChip = useRef<HTMLElement | null>(null)

  const clearChipSelection = () => {
    if (SELECTED_CHIP_CLASS) selectedChip.current?.classList.remove(SELECTED_CHIP_CLASS)
    selectedChip.current = null
  }

  const selectChip = (node: HTMLElement) => {
    clearChipSelection()
    if (SELECTED_CHIP_CLASS) node.classList.add(SELECTED_CHIP_CLASS)
    selectedChip.current = node
  }

  useEffect(() => {
    const root = input.current
    if (!root || tokens === lastReported.current) return

    // Поле пересобирается целиком — выделенного узла сейчас не станет.
    clearChipSelection()
    rebuildDom(root, tokens)
    // Черновик мог быть отложен с подписями, которые с тех пор устарели, —
    // показываем номера по факту, а состояние догонит первой же правкой.
    relabelImages(root, imageBaseCount)
    lastReported.current = tokens
  }, [tokens])

  /**
   * Своя история отмены: родной undo браузера чипы не видит — они вставляются
   * напрямую через Range, а не через execCommand, и для контента с картинками
   * native Cmd+Z попросту нечего восстанавливать. Печать коалесцируем по
   * времени, как это делает и сам браузер, а вложения и программные правки —
   * всегда отдельным шагом: вставил картинку, одним Cmd+Z её и вернул.
   *
   * Стек свой у каждой вкладки: одна и та же панель редактирует то одну
   * сессию, то другую, и чужую историю подмешивать в Cmd+Z нельзя.
   */
  const undoStack = useRef<UserToken[][]>([])
  const redoStack = useRef<UserToken[][]>([])
  const lastEditAt = useRef(0)
  const sessionRef = useRef(sessionId)

  /**
   * Отправленные сообщения этой вкладки — по ним ходят стрелки вверх/вниз, как
   * в терминале. Черновик на момент начала пролистывания запоминаем отдельно:
   * стрелка вниз после самого нового сообщения обязана вернуть именно его, а
   * не пустое поле, если человек успел что-то напечатать перед тем как начал
   * листать историю с середины.
   */
  const sentHistory = useRef<UserToken[][]>([])
  const historyIndex = useRef<number | null>(null)
  const historyDraft = useRef<UserToken[] | null>(null)

  useEffect(() => {
    if (sessionRef.current === sessionId) return
    sessionRef.current = sessionId
    undoStack.current = []
    redoStack.current = []
    sentHistory.current = []
    historyIndex.current = null
    historyDraft.current = null
  }, [sessionId])

  useEffect(() => {
    if (focusToken > 0) input.current?.focus()
  }, [focusToken])

  // Любая правка снова открывает подсказку и возвращает выбор в начало: список
  // стал другим, и держать в нём прежнее место незачем.
  useEffect(() => {
    setDismissed(false)
    setHighlight(0)
  }, [tokens])

  /**
   * Команда, уже ставшая плашкой. Дальше в поле идёт только её аргумент, поэтому
   * обе подсказки — и по значению, и по синтаксису — берут имя отсюда, а не
   * вычитывают его из текста заново.
   */
  const command = commandChip(tokens)
  const argumentText = command === null ? '' : plainText(tokens.slice(1))

  // Слэш-команда осмысленна, только пока в поле вообще нет вложений — команда
  // с приложенным файлом попросту не имеет смысла.
  const plain = useMemo(
    () => (tokens.some((token) => token.kind === 'chip') ? null : plainText(tokens)),
    [tokens],
  )

  const query = plain === null ? null : slashQueryFromText(plain)

  /**
   * Набрана команда терминала, а не сообщение агенту (см. feed/bash). Поле от
   * этого меняет вид: уходит она не туда, куда обычно, и понять это нужно до
   * нажатия, а не по появившейся в ленте карточке.
   */
  const bash = isBashDraft(tokens)

  const commandMatches = useMemo(
    () => (query === null || dismissed ? [] : matchCommands(commands, query)),
    [commands, query, dismissed],
  )

  // Название команды уже набрано и дальше идёт её аргумент — второй шаг
  // подсказки, ровно как в терминале: сперва команда, потом её значение.
  const argument = useMemo(() => {
    if (dismissed || commandMatches.length > 0) return null

    if (command !== null) {
      const options = argumentOptions(command, models)
      const value = argumentText.trim()
      // Пробел внутри значения означает, что аргумент уже не одно слово из
      // списка, а свободный текст — выбирать там нечего.
      return options && !/\s/.test(value) ? { command, query: value, options } : null
    }

    return plain === null ? null : argumentQuery(plain, models)
  }, [plain, dismissed, commandMatches, command, argumentText, models])

  const argumentMatches = useMemo(
    () => (argument ? matchArguments(argument.options, argument.query) : []),
    [argument],
  )

  const matches: CommandEntry[] =
    commandMatches.length > 0
      ? commandMatches
      : argumentMatches.map((option) => ({ ...option, group: 'built-in' as const }))

  /**
   * Синтаксис аргумента статичным текстом сразу после названия команды — тот же
   * шаг, что и argument выше, но для команд без перечислимых значений (не
   * model/effort, у которых есть свой список вариантов): просто напоминание
   * формата, как в терминале, а не список для выбора.
   */
  const ghostCommand = useMemo(() => {
    if (dismissed || commandMatches.length > 0 || argument) return null

    // Слот аргумента ещё пуст — у плашки это пустой хвост за ней, у набранного
    // руками текста то же самое место сразу за именем команды.
    const name =
      command !== null
        ? (argumentText.trim() === '' ? command : null)
        : plain === null
          ? null
          : commandNameBeforeArgument(plain)

    return name ? (commands.find((entry) => entry.id === name) ?? null) : null
  }, [plain, dismissed, commandMatches, argument, commands, command, argumentText])

  const ghostHint = ghostCommand?.argumentHint || null

  useEffect(() => {
    if (!ghostHint) {
      setGhostRect(null)
      return
    }

    const root = input.current
    const origin = box.current
    if (!root || !origin) return

    const update = () => setGhostRect(caretRect(root, origin))
    update()

    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [ghostHint, tokens])

  /**
   * "@" ищет файл от места курсора, а не от начала поля целиком — в отличие от
   * слэш-команды его можно набрать посреди предложения, как в терминале. Пока
   * активна слэш-подсказка, своей ему не бывать: два списка сразу — это шум.
   */
  const atQuery = matches.length > 0 || dismissed ? null : (input.current ? atQueryAt(input.current) : null)
  const fileMatches = atQuery ? matchFiles(files, atQuery.query) : []
  const isFileSuggest = matches.length === 0 && fileMatches.length > 0

  const suggestionItems: CommandEntry[] = isFileSuggest
    ? fileMatches.map((path) => ({ id: path, hint: '', group: 'project' as const }))
    : matches

  const suggesting = suggestionItems.length > 0
  const showSlash = argument === null && !isFileSuggest

  const UNDO_COALESCE_MS = 700

  /** Подряд идущую печать сливаем в один шаг отмены; всё остальное — своей границей. */
  const commitHistory = (before: UserToken[], boundary: boolean) => {
    const now = Date.now()
    const coalesce = !boundary && undoStack.current.length > 0 && now - lastEditAt.current < UNDO_COALESCE_MS
    if (!coalesce) undoStack.current.push(before)
    lastEditAt.current = now
    redoStack.current = []
  }

  /** DOM уже наш — сообщаем наружу и запоминаем, чтобы эффект её не перестраивал. */
  const report = (next: UserToken[], boundary = false) => {
    commitHistory(tokens, boundary)
    lastReported.current = next
    onTokensChange(next)
    // Любая правка может увести курсор за край поля — оно ограничено по высоте
    // и дальше прокручивается (см. scrollCaretIntoView).
    if (input.current) scrollCaretIntoView(input.current)
  }

  /**
   * Читает поле и заодно приводит подписи картинок в соответствие их порядку:
   * номер в плашке обязан совпадать с [Image #N], который увидит агент.
   */
  const readTokens = (root: HTMLElement): UserToken[] => {
    relabelImages(root, imageBaseCount)
    return extractTokens(root)
  }

  /**
   * Картинки этой сессии пересчитали (ушло сообщение, разобралась очередь) —
   * значит и подписи в поле сдвинулись. Историю отмены таким обновлением не
   * трогаем: человек ничего не редактировал, поменялся лишь номер.
   */
  useEffect(() => {
    const root = input.current
    if (!root || !relabelImages(root, imageBaseCount)) return

    const next = extractTokens(root)
    lastReported.current = next
    onTokensChange(next)
  }, [imageBaseCount])

  /** Программная правка всего содержимого: DOM меняем сами, а не ждём эффекта. */
  const applyTokens = (next: UserToken[]) => {
    const root = input.current
    if (!root) {
      report(next, true)
      return
    }

    clearChipSelection()
    rebuildDom(root, next)
    // Читаем поле обратно, а не докладываем next как есть: картинок могло стать
    // меньше (вырезали кусок вместе с одной из них), и подписи оставшихся должны
    // сдвинуться — иначе в поле останется «Image #2», который уйдёт агенту первым.
    report(readTokens(root), true)
  }

  /** Восстановление шагом истории — само по себе новой границей истории не является. */
  const restoreTokens = (next: UserToken[]) => {
    const root = input.current
    if (root) {
      clearChipSelection()
      rebuildDom(root, next)
      scrollCaretIntoView(root)
    }
    lastReported.current = next
    onTokensChange(next)
  }

  const undo = () => {
    const previous = undoStack.current.pop()
    if (previous === undefined) return
    redoStack.current.push(tokens)
    restoreTokens(previous)
  }

  const redo = () => {
    const next = redoStack.current.pop()
    if (next === undefined) return
    undoStack.current.push(tokens)
    restoreTokens(next)
  }

  const handleInput = () => {
    const root = input.current
    if (!root) return

    const next = readTokens(root)

    // Стерев весь текст выделением или подряд идущими backspace, Chromium
    // оставляет одинокий <br> вместо по-настоящему пустого узла — из-за него
    // placeholder (css :empty) не появляется. Раз токенов не осталось, а узел
    // не пуст буквально — подчищаем сами.
    if (next.length === 0 && root.childNodes.length > 0) root.innerHTML = ''

    // Дописали имя команды и поставили пробел — она становится плашкой прямо на
    // ходу, не дожидаясь выбора из подсказки.
    const captured = captureCommand(next, commands)
    if (captured) {
      applyTokens(captured)
      placeCaretAtEnd(root)
      return
    }

    report(next)
  }

  /**
   * Выбор из подсказки. Сама команда становится плашкой — как файл или картинка,
   * и по той же причине: это не набранный текст, а выбранная сущность, и
   * случайно испортить её половинной правкой быть не должно. Аргумент за ней
   * остаётся обычным текстом: он у каждой команды свой.
   */
  const insert = (picked: CommandEntry) => {
    const chip: UserToken = { kind: 'chip', chip: { kind: 'cmd', value: argument ? argument.command : picked.id } }

    // Выбрали значение аргумента — плашка команды уже стоит, дописываем значение;
    // выбрали саму команду — за плашкой остаётся место под её аргумент.
    const tail = argument ? ` ${picked.id}` : ' '

    applyTokens([chip, { kind: 'text', value: tail }])
    setDismissed(true)
    placeCaretAtEnd(input.current)
    input.current?.focus()
  }

  /**
   * Выбор файла из подсказки "@" — набранное от "@" до курсора заменяется
   * плашкой, а не остаётся текстом рядом с ней: то же самое вложение, что и у
   * ссылки из редактора, просто выбранное прямо в поле, а не контекстным меню.
   */
  const insertFileReference = (path: string) => {
    const root = input.current
    if (!root || !atQuery) return

    const range = document.createRange()
    range.setStart(atQuery.node, atQuery.start)
    range.setEnd(atQuery.node, atQuery.end)
    range.deleteContents()

    const chip: Chip = { kind: path.endsWith('/') ? 'dir' : 'file', value: path }
    const node = chipNodeIn(root, chip)
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)

    // Курсору есть, где печатать дальше, не слипаясь с плашкой — как и после
    // вложения из буфера обмена.
    const space = document.createTextNode(' ')
    range.insertNode(space)
    range.setStartAfter(space)
    range.collapse(true)

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    report(readTokens(root), true)
  }

  /**
   * Курсор в поле — или конец набранного, если фокус потерян и курсора
   * по-честному нет.
   *
   * Конец именно набранного, а не содержимого: последним в поле может стоять
   * перевод строки, за которым человек как раз и собирался писать дальше.
   * endRange поставил бы вложение ЗА него, добавив пустую строку, которой в
   * поле не было; padTrailingBreak возвращает то самое место на пустой
   * последней строке, где стоял бы курсор.
   */
  const currentRange = (root: HTMLElement): Range => {
    const selection = window.getSelection()
    return selection && selection.rangeCount > 0 && root.contains(selection.getRangeAt(0).startContainer)
      ? selection.getRangeAt(0)
      : (padTrailingBreak(root) ?? endRange(root))
  }

  /** "/" от кнопки — туда же, где курсор, не стирая уже напечатанное. */
  const insertTextAtCursor = (text: string) => {
    const root = input.current
    if (!root) return

    const range = currentRange(root)
    range.deleteContents()

    const node = document.createTextNode(text)
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)

    // Вставленное могло кончаться переводом строки — скопированная из терминала
    // строка обычно им и кончается. Курсору на этой строке нужно место.
    const padded = node === root.lastChild ? padTrailingBreak(root) : null

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(padded ?? range)

    report(readTokens(root), true)
  }

  /**
   * Картинка из буфера — сюда же, где стоял курсор в момент вставки, и с
   * пробелом по каждую сторону: без него текст перед вложением и после него
   * слипается с ним в одно нечитаемое слово, которое видит агент.
   */
  const insertChipAtCursor = (chip: Chip) => {
    const root = input.current
    if (!root) return

    const range = currentRange(root)
    range.deleteContents()

    // Перед вложением — только если там уже стоит непробельный символ: пустое
    // начало поля не нуждается в пробеле перед собой, добавлять там нечего.
    if (needsLeadingSpace(charBefore(range))) {
      const space = document.createTextNode(' ')
      range.insertNode(space)
      range.setStartAfter(space)
      range.collapse(true)
    }

    const node = chipNodeIn(root, chip)
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)

    // После — всегда: курсору нужно на что-то встать, чтобы печатать дальше,
    // не слипаясь с чипом, даже если картинка легла в самый конец поля.
    if (needsTrailingSpace(charAfter(range))) {
      const space = document.createTextNode(' ')
      range.insertNode(space)
      range.setStartAfter(space)
      range.collapse(true)
    }

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    report(readTokens(root), true)
  }

  /**
   * Возвращает в поле последовательность, скопированную из него же.
   *
   * Плашки пересобираем настоящими узлами, а не разметкой из буфера: связь
   * «узел — вложение» живёт по идентичности узла, и у клона из буфера её нет —
   * вставленная как разметка плашка выглядела бы как надо, но для отправки не
   * значила бы ничего.
   */
  const insertTokensAtCursor = (next: UserToken[]) => {
    const root = input.current
    if (!root) return

    const range = currentRange(root)
    range.deleteContents()

    let tail: Node | null = null

    for (const token of next) {
      if (token.kind === 'text') {
        const text = document.createTextNode(token.value)
        range.insertNode(text)
        range.setStartAfter(text)
        tail = text
      } else {
        const node = chipNodeIn(root, token.chip)
        range.insertNode(node)
        range.setStartAfter(node)
        tail = node
      }
      range.collapse(true)
    }

    // Вернулось в конец поля и кончается переносом — курсору нужна строка, на
    // которой он встанет (см. padTrailingBreak).
    const padded = tail && tail === root.lastChild ? padTrailingBreak(root) : null

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(padded ?? range)

    report(readTokens(root), true)
  }

  /**
   * Копирование и вырезание из поля.
   *
   * Отдать это браузеру нельзя: вложения тут не текст, а плашки, и он положил бы
   * в буфер их видимую надпись вместе со значком и крестиком кнопки удаления —
   * ровно ту бессмысленную строку, которая потом и вставлялась обратно вместо
   * картинки. Кладём сами: читаемый текст — как его увидит агент, и рядом полное
   * описание вложений с байтами, по которому плашка восстанавливается живой
   * (см. feed/tokens).
   */
  const copySelection = (event: ClipboardEvent<HTMLDivElement>, cut: boolean) => {
    const root = input.current
    const selection = window.getSelection()
    if (!root || !selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    if (range.collapsed || !root.contains(range.commonAncestorContainer)) return

    const { picked, rest, caret } = splitTokens(root, range)
    if (picked.length === 0) return

    event.preventDefault()
    event.clipboardData.setData('text/plain', tokensText(picked))
    event.clipboardData.setData('text/html', clipboardHtml(picked))

    // Вырезаем не через deleteContents: выделение могло начаться или кончиться
    // внутри плашки, и браузер выпотрошил бы её, оставив половину узлов. Что
    // остаётся — уже посчитано, поэтому просто пересобираем поле из остатка и
    // возвращаем курсор туда, где резали.
    if (cut) {
      applyTokens(rest)
      placeCaretBefore(root, caret)
    }
  }

  /**
   * Скриншот из буфера обмена вставляем как настоящую картинку прямо в позицию
   * курсора, а не как её имя файла текстом и не в конец: агент должен увидеть
   * вложение там же, где оно стояло в предложении, а не оторванным от контекста.
   *
   * Обычный текст тоже перехватываем: дефолтная вставка в contentEditable тащит
   * с собой чужую разметку. execCommand('insertText') с этим справляется не
   * всегда — при вставке НЕСКОЛЬКИХ строк браузер может завернуть вторую и
   * далее в свои <div>, а не оставить их символом переноса в одном текстовом
   * узле. Разбор DOM обратно в токены понимает только простой текст и наши же
   * чипы — такой <div> он тихо теряет целиком, и сообщение обрезается ровно по
   * первой строке. Вставляем текстовым узлом напрямую — тем же путём, что и
   * кнопка «/» — там такой развилки у браузера нет в принципе.
   */
  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.clipboardData?.items ?? [])
    const images = items.filter((item) => item.type.startsWith('image/'))

    event.preventDefault()

    // Своё же содержимое, скопированное из поля, возвращаем живыми плашками — с
    // байтами картинок, а не надписью с них. Проверяем первым: скопированная
    // плашка картинкой в буфере не лежит, и обычные ветки её не узнают.
    const restored = clipboardTokens(event.clipboardData?.getData('text/html') ?? '')
    if (restored) {
      insertTokensAtCursor(restored)
      return
    }

    if (images.length === 0) {
      const text = event.clipboardData?.getData('text/plain') ?? ''
      if (!text) return

      // Многострочное — плашкой, как файл или картинка: вставленная простыня
      // выталкивала из поля всё остальное, и своё же сообщение приходилось
      // прокручивать, чтобы увидеть, что вокруг неё написано. Однострочное
      // остаётся текстом: короткую вставку правят прямо в поле, а плашка это
      // как раз запрещает.
      if (isMultiline(text)) insertChipAtCursor({ kind: 'paste', value: 'pasted', text })
      else insertTextAtCursor(text)
      return
    }

    for (const item of images) {
      const file = item.getAsFile()
      if (!file) continue

      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result !== 'string') return

        const root = input.current
        // Номер по факту картинок, которые уже реально стоят в поле — а не по
        // тому, сколько раз вставляли: одну и ту же могли уже удалить.
        const count = (root ? extractTokens(root) : []).filter(
          (token) => token.kind === 'chip' && token.chip.kind === 'img' && Boolean(token.chip.data),
        ).length

        insertChipAtCursor({ kind: 'img', value: `Image #${imageBaseCount + count + 1}`, data: reader.result })
      }
      reader.readAsDataURL(file)
    }
  }

  /**
   * Вставка от панели — ссылка из редактора, файл из диалога, брошенная папка.
   * Живёт в ссылке, а не в пропе: подписка на сообщения оболочки ставится один
   * раз на всю жизнь панели и свежую функцию каждого рендера всё равно бы не
   * увидела.
   */
  const insertFromShell = useRef<(token: UserToken) => void>(() => {})
  insertFromShell.current = (token: UserToken) => {
    if (token.kind === 'chip') insertChipAtCursor(token.chip)
    else insertTextAtCursor(token.value)

    // Фокус — сразу после вставки, а не до: курсор уже стоит за плашкой, и
    // печатать можно не целясь мышью в поле. Раньше — сбило бы место вставки:
    // фокус на пустом поле ставит курсор в его начало.
    input.current?.focus()
  }

  useEffect(() => {
    registerInsert((token) => insertFromShell.current(token))
    return () => registerInsert(null)
  }, [registerInsert])

  /**
   * Файл или папку, брошенные в поле, забираем себе: без этого встроенный
   * браузер попросту открыл бы файл вместо страницы панели. Само содержимое
   * нам не нужно — только путь, по нему оболочка и соберёт плашку.
   */
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(event.dataTransfer)) return

    event.preventDefault()
    setDropping(false)

    const paths = droppedPaths(event.dataTransfer)
    if (paths.length > 0) onDropFiles(paths)
  }

  const placeholder = tokens.length
    ? ''
    : planMode
      ? 'Describe what to plan…'
      : 'Ask, or describe a change…'

  /**
   * Курсор упёрся в плашку и остановился на ней, не перешагнув: дальше по ней
   * работают backspace (убрать) и та же стрелка (пройти мимо).
   *
   * Отдельной веткой до всего остального в обработчике: пока плашка выделена,
   * клавиши принадлежат ей — ровно как список подсказок забирает себе стрелки,
   * пока открыт.
   */
  const handleChipKey = (event: KeyboardEvent<HTMLDivElement>): boolean => {
    const root = input.current
    if (!root) return false

    // Сам по себе зажатый модификатор ещё ничего не делает — снимать из-за него
    // выделение значило бы терять его от одного намерения набрать заглавную.
    if (MODIFIER_KEYS.includes(event.key)) return false

    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      clearChipSelection()
      return false
    }

    const selected = selectedChip.current

    if (selected) {
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        // Курсор на место убранной плашки: продолжают печатать там же, где
        // только что стёрли, а не в конце поля.
        placeCaretBeside(selected, 'before')
        clearChipSelection()
        // Тем же путём, что и крестик на плашке: правка поля обязана пройти
        // через handleInput, иначе мимо пройдут и его доделки — подчистка
        // одинокого <br> (без неё не появляется подсказка в пустом поле), и
        // превращение дописанного имени команды в плашку.
        onChipRemoved(root, selected)
        return true
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        placeCaretBeside(selected, event.key === 'ArrowLeft' ? 'before' : 'after')
        clearChipSelection()
        return true
      }

      // Всё прочее (печать, Enter, Escape) выделение просто снимает и работает
      // как обычно: удерживать его после того, как человек занялся другим, незачем.
      clearChipSelection()
      return false
    }

    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false

    const chip = chipBesideCaret(root, event.key === 'ArrowLeft' ? 'backward' : 'forward')
    if (!chip) return false

    event.preventDefault()
    selectChip(chip)
    return true
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (handleChipKey(event)) return

    // JCEF не пробрасывает нативные для macOS сочетания «по строке» —
    // Cmd+Backspace и Cmd+стрелка молчат в contentEditable, хотя Option+стрелка
    // (по слову) работает штатно. Реализуем их сами через Selection.modify: это
    // чисто DOM API в обход тех самых нативных key bindings, которые здесь
    // ненадёжны.
    if (event.metaKey && (event.key === 'Backspace' || event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault()
      const selection = window.getSelection()
      if (!selection) return

      if (event.key === 'Backspace') {
        selection.modify('extend', 'backward', 'word')
        document.execCommand('delete')
        return
      }

      const direction = event.key === 'ArrowRight' ? 'forward' : 'backward'
      selection.modify(event.shiftKey ? 'extend' : 'move', direction, 'lineboundary')
      return
    }

    // Своя история отмены — родной Cmd+Z/Ctrl+Z браузера про наши чипы ничего
    // не знает и восстановит их некорректно, поэтому перехватываем полностью.
    // Ctrl нужен и на Mac: Chromium внутри JCEF откликается на Ctrl+Z своим
    // отменённым undo независимо от хостовой ОС, и без перехвата это
    // выглядело бы как случайный «чужой» undo поверх поля ввода.
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
      return
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'y') {
      event.preventDefault()
      redo()
      return
    }

    // Пока открыт список команд или файлов, стрелки и ввод принадлежат ему.
    if (suggesting) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlight((current) => (current + 1) % suggestionItems.length)
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlight((current) => (current - 1 + suggestionItems.length) % suggestionItems.length)
        return
      }

      // Команда или аргумент уже набраны целиком — второй раз подставлять
      // незачем, ввод должен отправлять. Но не голое имя команды с аргументом:
      // без значения её отправлять нельзя, Enter обязан довести до подсказки
      // по самому аргументу. У файла такого случая нет — выбор всегда явный.
      const exact = isFileSuggest
        ? false
        : argument
          ? argumentMatches.length === 1 && argumentMatches[0]?.id === argument.query
          : matches.length === 1 && matches[0]?.id === query && !requiresArgument(matches[0].id)

      if ((event.key === 'Enter' && !exact) || event.key === 'Tab') {
        event.preventDefault()
        const picked = suggestionItems[highlight] ?? suggestionItems[0]
        if (picked) {
          if (isFileSuggest) insertFileReference(picked.id)
          else insert(picked)
        }
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        // Подсказку закрыли — этого достаточно: не даём Escape провалиться
        // выше и заодно ещё и остановить агента (см. глобальный обработчик в App).
        event.stopPropagation()
        setDismissed(true)
        return
      }
    }

    // Стрелки вверх/вниз — история отправленных сообщений, как в терминале.
    // Вверх работает, только если поле пустое или уже листаем историю: иначе
    // это просто движение курсора по многострочному черновику, не листание.
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const browsing = historyIndex.current !== null
      const empty = tokens.length === 0

      if (event.key === 'ArrowUp' && (empty || browsing) && sentHistory.current.length > 0) {
        event.preventDefault()
        if (historyIndex.current === null) historyDraft.current = tokens
        historyIndex.current = Math.max(0, (historyIndex.current ?? sentHistory.current.length) - 1)
        applyTokens(sentHistory.current[historyIndex.current] ?? [])
        return
      }

      if (event.key === 'ArrowDown' && browsing) {
        event.preventDefault()
        const nextIndex = (historyIndex.current ?? 0) + 1

        if (nextIndex >= sentHistory.current.length) {
          historyIndex.current = null
          applyTokens(historyDraft.current ?? [])
          historyDraft.current = null
        } else {
          historyIndex.current = nextIndex
          applyTokens(sentHistory.current[nextIndex] ?? [])
        }
        return
      }
    }

    // isComposing: подтверждение варианта у IME тоже приходит Enter'ом — это
    // не отправка, а часть набора текста.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      // Enter — это кнопка Send, поэтому и молчит он ровно тогда же, когда она
      // погашена: отправлять нечего.
      if (!canSubmit) return
      if (tokens.length > 0) sentHistory.current.push(tokens)
      historyIndex.current = null
      historyDraft.current = null
      onSubmit()
      return
    }

    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault()
      // Перенос строки — insertLineBreak, родная команда браузера ровно для
      // этого. Соседние варианты не годятся: insertText с '\n' расщепляет поле
      // на отдельный <div> под вторую строку (проверено живьём), а свой
      // текстовый узел через Range теряет курсор.
      //
      // Курсор терялся так: перевод строки в самом конце содержимого браузер не
      // рисует — по правилам переноса пустая последняя строка не занимает места,
      // — и курсору на ней встать негде. Он схлопывался в конец предыдущей
      // строки, и следующая буква печаталась ПЕРЕД переносом: первое нажатие
      // выглядело как несработавшее, второе будто бы «наконец переносило».
      //
      // insertLineBreak знает про этот случай и держит в конце поля запасной
      // перевод строки, пока на пустой последней строке стоит курсор; первая же
      // напечатанная буква его забирает. Дальше поле остаётся плоским текстом,
      // каким его и читает разбор токенов.
      document.execCommand('insertLineBreak')
    }
  }

  /* Одна кнопка на все вложения: файл, картинка и папка выбираются одним
     и тем же диалогом, а разницу видно по самому пути. Подсказка разворачивается
     вверх: ряд стоит у нижнего края панели, и вниз ей некуда. */
  const attachButton = (
    <button
      type="button"
      className={s.attach}
      data-tooltip="Attach files or folders"
      data-tooltip-at="top"
      aria-label="Attach files or folders"
      onClick={onAttach}
    >
      <Paperclip />
    </button>
  )

  /* Кнопка не открывает каталог, а ставит слэш в поле: дальше команду
     набирают, и список сужается сам. Пока в поле уже что-то есть, слэш
     посреди текста не запускает подсказку — кнопка становится disabled, чтобы
     не звать на бесполезное нажатие. */
  const slashDisabled = tokens.length > 0
  const slashButton = (
    <button
      type="button"
      className={s.attach}
      data-tooltip="Slash commands"
      data-tooltip-at="top"
      aria-label="Slash commands"
      disabled={slashDisabled}
      onClick={() => {
        insertTextAtCursor('/')
        input.current?.focus()
      }}
    >
      <span className={s.attachSlash}>/</span>
    </button>
  )

  const stopButton = streaming ? (
    <button type="button" className={s.stop} onClick={onStop}>
      ■ Stop
    </button>
  ) : null

  // Обычный Stop честно ждёт подтверждения. Если оно не пришло дольше
  // разумного — единственный работающий выход отсюда - убить процесс.
  const forceStopButton = stopStalled ? (
    <button
      type="button"
      className={s.forceStop}
      onClick={onForceStop}
      data-tooltip="Claude isn't confirming the stop"
      data-tooltip-at="top"
    >
      ⚠ Not responding · Force stop
    </button>
  ) : null

  /* Две отдельные кнопки, а не одна с двумя лицами: пока агент занят, у
     сообщения есть выбор — дойти до него сейчас, посреди работы, или
     дождаться своей очереди. Send работает всегда, Queue осмысленна только
     при занятом агенте: свободному ждать нечего.

     У команды терминала очереди не бывает вовсе: её выполняет сама панель, и
     ждать освобождения агента ей незачем. */
  const queueButton = bash ? null : (
    <button
      type="button"
      className={`${s.send} ${s.sendQueued}`}
      onClick={onQueue}
      disabled={!canSubmit || !streaming}
      data-tooltip="Send after the current run finishes"
      data-tooltip-at="top"
    >
      Queue
    </button>
  )

  const sendButton = (
    <button
      type="button"
      className={`${s.send} ${bash ? s.sendRun : ''}`}
      onClick={onSubmit}
      disabled={!canSubmit}
      data-tooltip={bash ? 'Run in your shell — Claude sees the output with your next message' : undefined}
      data-tooltip-at="top"
    >
      {bash ? 'Run' : 'Send'}
    </button>
  )

  /**
   * Ряд кнопок под полем: расход, вложения, команды, отправка. Один и тот же
   * набор детей и в обычной раскладке (своя строка `.tools` внутри box), и в
   * compact (вторая строка колонки справа от box, см. ниже) — поведение кнопок
   * раскладке не подчиняется, меняется лишь то, куда ряд встаёт и в каком
   * порядке он их читает. В left/right расход стоит отдельной строкой над
   * этим рядом, в боковой рельсе (см. .railMeters ниже) — сюда бы он полез
   * той же кучей, что толкает Send/Queue при появлении Stop.
   *
   * Порядок различается перестановкой самих детей в разметке, а не CSS
   * `order`: клавиатурная табуляция идёт по порядку в DOM и не следит за
   * визуальным `order`, так что перестановка через CSS расходилась бы с тем,
   * что видно на экране.
   */
  const toolsRow = compact ? (
    <>
      {/* В compact кнопки — самое важное на строке (расход уже виден строкой
          выше, в кольцах), поэтому Send и Queue идут первыми, а расход —
          последним, за иконками. Send и Queue — обычные действия, поэтому
          стоят первыми; Stop и Force stop прерывают агента, поэтому едут
          следом за ними, а не разрывают пару Send/Queue. .spacer перед
          расходом прижимает кнопки к левому краю: без него они висят в общей
          группе с расходом, которую .compactToolsRow (justify-content:
          flex-end) целиком гонит к правому краю, — и в первый миг после
          старта плагина, пока расход ещё пустой и узкий, кнопки едут вправо
          вместе с ним. */}
      {sendButton}
      {queueButton}
      {stopButton}
      {forceStopButton}
      {attachButton}
      {slashButton}
      <div className={s.spacer} />
      {meters}
    </>
  ) : rail ? (
    <>
      {sendButton}
      {queueButton}
      {stopButton}
      {forceStopButton}
      {attachButton}
      {slashButton}
    </>
  ) : (
    <>
      {/* Расход — слева, на месте, где раньше стояли кнопки вложения и команд:
          сюда смотрят, решая, что писать дальше, и цифры должны быть под
          рукой, а не строкой ниже. Сами кнопки уехали вправо, к Send. */}
      {meters}
      <div className={s.spacer} />
      {attachButton}
      {slashButton}
      {stopButton}
      {forceStopButton}
      {queueButton}
      {sendButton}
    </>
  )

  const ghostHintNode =
    ghostHint && ghostRect ? (
      <span
        className={s.ghostHint}
        style={{ left: ghostRect.left, top: ghostRect.top, lineHeight: `${ghostRect.height}px` }}
        aria-hidden="true"
      >
        {ghostHint}
      </span>
    ) : null

  const fieldNode = (
    <div
      ref={input}
      className={`${s.field} ${compact ? s.fieldCompact : rail ? s.fieldRail : ''}`}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={handleInput}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        // Подсветка обещает, что следующий backspace уберёт эту плашку, —
        // а с ушедшим из поля фокусом она уже ничего не обещает.
        clearChipSelection()
      }}
      // Курсор поставили мышью — с плашкой, до которой дошли стрелками,
      // это никак не связано.
      onMouseDown={clearChipSelection}
      onPaste={handlePaste}
      onCopy={(event) => copySelection(event, false)}
      onCut={(event) => copySelection(event, true)}
      onKeyDown={handleKeyDown}
    />
  )

  const boxClassName = (extra: string) =>
    `${s.box} ${extra} ${focused ? s.boxFocused : ''} ${dropping || fileDragOver ? s.boxDropping : ''} ${bash ? s.boxBash : ''}`

  const suggestNode = suggesting ? (
    <SlashSuggest
      commands={suggestionItems}
      highlight={highlight}
      onPick={isFileSuggest ? (picked) => insertFileReference(picked.id) : insert}
      onHighlight={setHighlight}
      showSlash={showSlash}
    />
  ) : null

  if (compact) {
    return (
      <div className={s.boxWrap}>
        {suggestNode}

        <div className={s.compactRow}>
          <div
            className={boxClassName(s.boxCompact)}
            ref={box}
            onDragOver={(event) => {
              if (!hasFiles(event.dataTransfer)) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
              setDropping(true)
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
              setDropping(false)
            }}
            onDrop={handleDrop}
          >
            <ContextMeterVertical percent={contextPercent} />
            {ghostHintNode}
            {fieldNode}
          </div>

          {/*
           * MODEL/EFFORT/MODE и кнопки — раньше в отдельной строке статуса под
           * полем (см. StatusBar), но у compact своей строки статуса нет: обе
           * строки переехали сюда, в колонку рядом с полем, чтобы под ленту
           * осталось как можно больше высоты.
           */}
          <div className={s.compactControls}>
            <div className={s.compactSelectors}>
              <Selectors
                model={model}
                effort={effort ?? ''}
                mode={mode ?? ''}
                auto
                onOpen={(kind, anchor) => onOpenSelector?.(kind, anchor)}
              />
            </div>

            <div className={s.compactToolsRow}>{toolsRow}</div>
          </div>
        </div>
      </div>
    )
  }

  if (rail) {
    return (
      <div className={s.boxWrap}>
        {suggestNode}

        <div className={s.railRow}>
          <div
            className={boxClassName(s.boxRail)}
            ref={box}
            onDragOver={(event) => {
              if (!hasFiles(event.dataTransfer)) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
              setDropping(true)
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
              setDropping(false)
            }}
            onDrop={handleDrop}
          >
            <ContextMeterVertical percent={contextPercent} />
            {ghostHintNode}
            {fieldNode}
          </div>
        </div>

        {/*
         * MODEL/EFFORT/MODE и кнопки — своей строки статуса под полем в
         * left/right нет: через портал уходят в боковую рельсу на всю высоту
         * панели (см. railContainer и App.tsx). Состояние и обработчики
         * остаются здесь, в композере, разметка лишь рисуется в другом месте
         * DOM. Пока узел ещё не примонтирован (первый рендер), не рисуем
         * вовсе — идти в portal(null-контейнер) React не даст.
         */}
        {railContainer
          ? createPortal(
              <>
                <div className={s.railSelectors}>
                  <Selectors
                    model={model}
                    effort={effort ?? ''}
                    mode={mode ?? ''}
                    auto
                    onOpen={(kind, anchor) => onOpenSelector?.(kind, anchor)}
                  />
                </div>

                {/* Расход — сразу под селекторами, своей строкой: ни он от
                    появления Stop/Queue ниже, ни они от роста колец расхода
                    после того, как придут данные, теперь не двигаются. */}
                <div className={s.railMeters}>{meters}</div>

                <div className={layout === 'left' ? `${s.railToolsRow} ${s.railToolsRowLeft}` : s.railToolsRow}>
                  {toolsRow}
                </div>
              </>,
              railContainer,
            )
          : null}
      </div>
    )
  }

  return (
    <div className={s.boxWrap}>
      {suggestNode}

      <div
        className={boxClassName('')}
        ref={box}
        onDragOver={(event) => {
          if (!hasFiles(event.dataTransfer)) return
          // Без preventDefault браузер считает, что бросать сюда нельзя, и до
          // onDrop дело не доходит вовсе.
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setDropping(true)
        }}
        // Переход между детьми поля браузер тоже считает уходом — гасим подсветку
        // только когда курсор действительно покинул рамку.
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
          setDropping(false)
        }}
        onDrop={handleDrop}
      >
        <ContextMeter percent={contextPercent} />
        {ghostHintNode}
        {fieldNode}

        <div className={s.tools}>{toolsRow}</div>
      </div>
    </div>
  )
}

// --- Перетаскивание файлов --------------------------------------------------

/**
 * Тащат файл, а не кусок текста. Проверяем по типам переноса, а не по списку
 * файлов: во время перетаскивания браузер прячет сами файлы (их видно только в
 * момент броска), и списка тут ещё нет ни при каком раскладе.
 */
const hasFiles = (transfer: DataTransfer | null): boolean =>
  Array.from(transfer?.types ?? []).some((type) => type === 'Files' || type === 'text/uri-list')

/** file:///путь → обычный путь; всё, что не путь на диске, отбрасываем. */
const filePath = (value: string): string | null => {
  if (value.startsWith('file://')) {
    try {
      return decodeURIComponent(new URL(value).pathname) || null
    } catch {
      return null
    }
  }

  return value.startsWith('/') ? value : null
}

/**
 * Пути брошенного: их кладёт и системный проводник, и дерево проекта IDE —
 * списком URI, по одному на строку. Строки с решёткой в этом формате
 * комментарии, а не адреса.
 */
const droppedPaths = (transfer: DataTransfer | null): string[] => {
  if (!transfer) return []

  const list = transfer.getData('text/uri-list') || transfer.getData('text/plain')

  return list
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map(filePath)
    .filter((path): path is string => path !== null)
}

// --- DOM поля ввода: текст и вложения вперемешку, как одна лента символов ---

/**
 * Экранные координаты курсора относительно origin — чтобы напечатать статичный
 * хинт аргумента ровно там же, где стоял бы следующий символ, не трогая сам DOM
 * поля: хинт наложенный слой, а не часть содержимого, и в токены не попадает.
 */
const caretRect = (root: HTMLElement, origin: HTMLElement): { left: number; top: number; height: number } | null => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null

  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer)) return null

  const rect = range.getBoundingClientRect()
  // Пустой прямоугольник в (0,0) — диапазон не смог себя измерить (редкая
  // граница между узлами); лучше промолчать, чем поставить хинт в угол поля.
  if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) return null

  const originRect = origin.getBoundingClientRect()
  return { left: rect.left - originRect.left, top: rect.top - originRect.top, height: rect.height || 18 }
}

/**
 * Высота непрозрачной подложки под полоской контекста (см. .box::before в
 * стилях): верхние пиксели поля закрыты ею, и курсор, уехавший туда, человек
 * всё равно не увидит.
 */
const FIELD_TOP_INSET_PX = 20

/** Небольшой запас, чтобы строка с курсором не липла вплотную к краю поля. */
const CARET_MARGIN_PX = 4

/**
 * Держит курсор в поле зрения.
 *
 * Поле ограничено по высоте и дальше прокручивается внутри себя, а сам браузер
 * доводит до курсора не всегда: перенос строки в конце длинного сообщения
 * (Shift+Enter) оставлял новую пустую строку за нижним краем — печатать
 * приходилось вслепую, пока не прокрутишь поле рукой.
 */
const scrollCaretIntoView = (root: HTMLElement) => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return

  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer)) return

  const caret = range.getBoundingClientRect()
  const field = root.getBoundingClientRect()

  // Пустой прямоугольник — диапазон не сумел себя измерить (так бывает ровно на
  // той самой пустой последней строке). В этот момент курсор всегда в конце
  // содержимого, поэтому просто доводим поле до низа.
  if (caret.height === 0 && caret.top === 0) {
    root.scrollTop = root.scrollHeight
    return
  }

  const below = caret.bottom - field.bottom
  if (below > 0) {
    root.scrollTop += below + CARET_MARGIN_PX
    return
  }

  const above = field.top + FIELD_TOP_INSET_PX - caret.top
  if (above > 0) root.scrollTop -= above + CARET_MARGIN_PX
}

/** Пустой диапазон в самом конце содержимого — запасной вариант, если курсора нет. */
const endRange = (root: HTMLElement): Range => {
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  return range
}

/**
 * Даёт курсору место на пустой последней строке — и возвращает его туда.
 *
 * Перевод строки в самом конце поля браузер не рисует: пустая последняя строка
 * не занимает места, и встать на неё курсору негде — он схлопывается в конец
 * предыдущей, а следующий символ печатается ПЕРЕД переносом. Поэтому за таким
 * переносом держим ещё один, запасной: он и даёт ту самую строку. Ровно так же
 * поступает сам браузер, когда перенос делает insertLineBreak (Shift+Enter).
 *
 * Запасной перенос — часть разметки поля, а не сообщения: в отправленном тексте
 * его нет, пустой хвост снимает trimTrailingSpace.
 *
 * Возвращает курсор перед запасным переносом — или ничего, если поле кончается
 * не переносом и подстраховывать нечего.
 */
/** Кончается ли узел переводом строки — текстовый; у плашки такого хвоста быть не может. */
const endsWithBreak = (node: ChildNode | null): boolean =>
  node?.nodeType === Node.TEXT_NODE && (node.textContent ?? '').endsWith('\n')

const padTrailingBreak = (root: HTMLElement): Range | null => {
  const last = root.lastChild
  if (!last || last.nodeType !== Node.TEXT_NODE) return null

  const value = last.textContent ?? ''
  if (!value.endsWith('\n')) return null

  // Запасной перевод строки может уже стоять — например, его только что поставил
  // сам браузер по Shift+Enter. Второй раз добавлять его нельзя: каждый вызов
  // отодвигал бы курсор ещё на строку вниз, и вложение вставало бы не на пустую
  // строку под текстом, а через одну от неё. Пара переводов может лежать и в
  // двух соседних узлах: браузер дробит текст поля как ему удобно.
  const padded = value.endsWith('\n\n') || (value === '\n' && endsWithBreak(last.previousSibling))
  if (!padded) last.textContent = `${value}\n`

  const range = document.createRange()
  range.setStart(last, padded ? value.length - 1 : value.length)
  range.collapse(true)
  return range
}

const placeCaretAtEnd = (root: HTMLElement | null) => {
  if (!root) return
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(padTrailingBreak(root) ?? endRange(root))
}

/** Курсор вплотную к плашке — с той стороны, куда шли стрелкой. */
const placeCaretBeside = (node: HTMLElement, side: 'before' | 'after') => {
  const range = document.createRange()
  if (side === 'before') range.setStartBefore(node)
  else range.setStartAfter(node)
  range.collapse(true)

  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/** Плашка это или обычный узел: свои узнаём по той же таблице, что и разбор поля. */
const chipNodeOf = (node: Node | null | undefined): HTMLElement | null =>
  node instanceof HTMLElement && chipByNode.has(node) ? node : null

/**
 * Плашка, в которую курсор упрётся следующим шагом стрелки, — или ничего, если
 * с этой стороны от него обычный символ.
 *
 * Проверяем именно край: посреди слова слева от курсора буква, а не вложение,
 * и останавливать движение там не за что.
 */
const chipBesideCaret = (root: HTMLElement, direction: 'backward' | 'forward'): HTMLElement | null => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null

  const range = selection.getRangeAt(0)
  const { startContainer, startOffset } = range
  if (!root.contains(startContainer)) return null

  if (startContainer.nodeType === Node.TEXT_NODE) {
    const length = (startContainer.textContent ?? '').length
    if (direction === 'backward' ? startOffset > 0 : startOffset < length) return null
    return chipNodeOf(direction === 'backward' ? startContainer.previousSibling : startContainer.nextSibling)
  }

  // Курсор стоит прямо между детьми поля: смещение — номер ребёнка, а не символа.
  if (startContainer === root) {
    const children = Array.from(root.childNodes)
    return chipNodeOf(children[direction === 'backward' ? startOffset - 1 : startOffset])
  }

  return null
}

/**
 * Курсор перед ребёнком с таким номером — место, где только что вырезали.
 * Оставлять его в конце поля после Cmd+X нельзя: вырезают обычно из середины и
 * продолжают печатать там же.
 */
const placeCaretBefore = (root: HTMLElement, index: number) => {
  const node = root.childNodes[index]
  if (!node) {
    placeCaretAtEnd(root)
    return
  }

  const range = document.createRange()
  range.setStartBefore(node)
  range.collapse(true)

  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

interface AtQuery {
  /** Что набрано после "@" — по этому ищем файл. */
  query: string
  /** Текстовый узел, где стоит "@" — в нём же и курсор: посреди чипов "@" не бывает. */
  node: Text
  /** Смещение самого "@" в узле — начало диапазона на замену при выборе файла. */
  start: number
  /** Смещение курсора — конец того же диапазона. */
  end: number
}

/** "@" от начала строки или после пробела — то же самое слово, что и курсор набирает сейчас. */
const AT_QUERY = /(?:^|\s)@([^\s@]*)$/

/**
 * "@" ищет от места курсора, а не от начала поля — в отличие от слэш-команды,
 * его можно набрать посреди предложения, как в терминале ("посмотри @файл и").
 */
const atQueryAt = (root: HTMLElement): AtQuery | null => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null

  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || range.startContainer.nodeType !== Node.TEXT_NODE) return null

  const node = range.startContainer as Text
  const text = node.textContent ?? ''
  const before = text.slice(0, range.startOffset)
  const match = AT_QUERY.exec(before)
  if (!match) return null

  const start = match.index + (match[0].startsWith('@') ? 0 : 1)
  return { query: match[1] ?? '', node, start, end: range.startOffset }
}

/** Символ прямо перед схлопнутым диапазоном — пусто, если это не текстовый узел. */
const charBefore = (range: Range): string => {
  const { startContainer, startOffset } = range
  if (startContainer.nodeType !== Node.TEXT_NODE || startOffset === 0) return ''
  return (startContainer.textContent ?? '').charAt(startOffset - 1)
}

/** Символ сразу после — та же логика, для проверки, что стоит по другую сторону вложения. */
const charAfter = (range: Range): string => {
  const { startContainer, startOffset } = range
  if (startContainer.nodeType !== Node.TEXT_NODE) return ''
  return (startContainer.textContent ?? '').charAt(startOffset)
}

/**
 * Занимает ли вставленное больше одной строки. Хвостовой перевод строки не в
 * счёт: скопированная из терминала строка почти всегда кончается им, а строкой
 * от этого не перестаёт быть.
 */
const isMultiline = (text: string): boolean => text.trimEnd().includes('\n')

/** Перед вложением пробел нужен, только если там уже стоит непробельный символ — пустое начало поля не в счёт. */
const needsLeadingSpace = (char: string): boolean => char.length > 0 && !/\s/.test(char)

/** После вложения пробел нужен всегда — курсору всегда есть, где встать; повторно не добавляем. */
const needsTrailingSpace = (char: string): boolean => char.length === 0 || !/\s/.test(char)

/**
 * Крестик на чипе живёт вне React (сам узел — обычный DOM, не JSX), поэтому
 * сообщает о своём удалении так же, как о нём узнал бы браузер: обычным
 * 'input', всплывающим до обработчика на onInput.
 */
const onChipRemoved = (root: HTMLElement, node: HTMLElement) => {
  node.remove()
  root.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Свёрнутую вставку вернули в поле обычным текстом. Тем же путём, что и
 * удаление: подменяем узел и сообщаем полю через 'input'.
 *
 * normalize() — чтобы вставший на место плашки текст слился с соседними
 * кусками в один узел: иначе разбор поля вернул бы подряд несколько текстовых
 * токенов вместо одного, и дальнейшая правка этого места считалась бы правкой
 * разных кусков.
 */
const onChipExpanded = (root: HTMLElement, node: HTMLElement, text: string) => {
  node.replaceWith(document.createTextNode(text))
  root.normalize()
  root.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Плашка вместе с её кнопками, привязанная к конкретному полю: обе кнопки
 * правят его содержимое, поэтому знать это поле обязаны обе.
 */
const chipNodeIn = (root: HTMLElement, chip: Chip): HTMLElement => {
  const node: HTMLElement = renderChipNode(
    chip,
    () => onChipRemoved(root, node),
    // Разворачивать обратно есть что только у вставки: у остальных плашек за
    // подписью стоит путь или байты, а не текст, который набирали руками.
    chip.kind === 'paste' ? () => onChipExpanded(root, node, chip.text ?? '') : undefined,
  )
  return node
}

/** Пересобирает DOM с нуля из токенов — только для программных правок, не для печати. */
const rebuildDom = (root: HTMLElement, tokens: UserToken[]) => {
  root.innerHTML = ''

  for (const token of tokens) {
    if (token.kind === 'text') {
      root.appendChild(document.createTextNode(token.value))
      continue
    }

    const node = chipNodeIn(root, token.chip)
    root.appendChild(node)
  }

  placeCaretAtEnd(root)
}

/** Читает DOM обратно в токены — вызывается после каждой печати и правки. */
const extractTokens = (root: HTMLElement): UserToken[] => {
  const tokens: UserToken[] = []

  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent ?? ''
      if (value) tokens.push({ kind: 'text', value })
      continue
    }

    if (node instanceof HTMLElement) {
      const chip = chipByNode.get(node)
      if (chip) {
        tokens.push({ kind: 'chip', chip })
        continue
      }

      // Молча терять целый узел нельзя — так раньше пропадала вторая строка,
      // если браузер вопреки нашим намерениям расщеплял поле на блоки (см.
      // handleKeyDown про Shift+Enter). Такой блок — подразумеваемый перенос
      // строки, поэтому читаем его текст как есть, с переводом строки перед ним.
      const value = node.textContent ?? ''
      if (value) tokens.push({ kind: 'text', value: tokens.length > 0 ? `\n${value}` : value })
    }
  }

  return withoutCaretLine(tokens)
}

/**
 * Убирает запасной перевод строки, на котором стоит курсор (см.
 * padTrailingBreak): он часть разметки поля, а не набранного сообщения.
 *
 * Без этого он попадал бы в состояние панели и возвращался в поле при каждом
 * восстановлении — отмена, история сообщений, переключение вкладки, — а поле
 * дописывало бы к нему запасной заново, и хвост рос бы с каждым разом.
 */
const withoutCaretLine = (tokens: UserToken[]): UserToken[] => {
  const last = tokens[tokens.length - 1]
  if (!last || last.kind !== 'text' || !last.value.endsWith('\n')) return tokens

  const value = last.value.slice(0, -1)
  return value ? [...tokens.slice(0, -1), { kind: 'text', value }] : tokens.slice(0, -1)
}

/** Место границы выделения в поле: какой ребёнок и сколько символов от его начала. */
interface Point {
  index: number
  offset: number
}

/**
 * Приводит границу выделения к плоским координатам поля.
 *
 * Дети поля плоские — текстовые узлы и плашки верхнего уровня, — а браузер
 * ставит границу где угодно: и в самом поле между детьми, и внутри текста, и
 * внутри плашки, попав в её значок или крестик. Плашка неделима, поэтому
 * границу внутри неё прижимаем к ближайшему краю: начало выделения — к левому,
 * конец — к правому. Иначе выделив плашку мышью, человек скопировал бы половину
 * её внутренностей.
 */
const pointIn = (root: HTMLElement, container: Node, offset: number, side: 'start' | 'end'): Point => {
  const children = Array.from(root.childNodes)

  // Граница прямо в поле: смещение — это номер ребёнка, а не символа.
  if (container === root) return { index: Math.min(offset, children.length), offset: 0 }

  let node: Node | null = container
  while (node && node.parentNode !== root) node = node.parentNode

  const index = node ? children.indexOf(node as ChildNode) : -1
  // Граница вообще не из этого поля — считаем, что она за его концом.
  if (index < 0) return { index: children.length, offset: 0 }

  if (node === container && container.nodeType === Node.TEXT_NODE) return { index, offset }

  return side === 'start' ? { index, offset: 0 } : { index: index + 1, offset: 0 }
}

/**
 * Делит содержимое поля по выделению: что попало в него и что осталось.
 *
 * Данные плашек берём из той же таблицы по живому узлу, что и extractTokens, —
 * поэтому байты картинок переживают копирование, хотя в самом DOM их нет.
 */
const splitTokens = (
  root: HTMLElement,
  range: Range,
): { picked: UserToken[]; rest: UserToken[]; caret: number } => {
  const start = pointIn(root, range.startContainer, range.startOffset, 'start')
  const end = pointIn(root, range.endContainer, range.endOffset, 'end')

  const picked: UserToken[] = []
  const rest: UserToken[] = []
  /** Сколько в остатке того, что стояло ДО выделения — туда же вернётся курсор. */
  let caret = 0

  const keep = (token: UserToken | null, before: boolean) => {
    if (token) rest.push(token)
    if (before) caret = rest.length
  }
  const asText = (value: string): UserToken | null => (value ? { kind: 'text', value } : null)

  /**
   * Не наш узел — тот самый подразумеваемый перенос строки, что и в
   * extractTokens: читаем текстом, с переводом строки перед ним, но только если
   * ему есть от чего отделяться.
   */
  const asBlock = (value: string, into: UserToken[]): UserToken | null =>
    asText(value && into.length > 0 ? `\n${value}` : value)

  Array.from(root.childNodes).forEach((node, index) => {
    if (node instanceof HTMLElement) {
      const chip = chipByNode.get(node)
      const raw = node.textContent ?? ''

      // Плашка занимает своё место целиком: она внутри выделения, только если
      // выделение началось не позже её и закончилось строго после неё.
      if (index >= start.index && index < end.index) {
        const token = chip ? ({ kind: 'chip', chip } as UserToken) : asBlock(raw, picked)
        if (token) picked.push(token)
        return
      }

      keep(chip ? { kind: 'chip', chip } : asBlock(raw, rest), index < start.index)
      return
    }

    const value = node.textContent ?? ''

    if (index < start.index) {
      keep(asText(value), true)
      return
    }
    if (index > end.index) {
      keep(asText(value), false)
      return
    }

    const from = index === start.index ? Math.min(start.offset, value.length) : 0
    const to = index === end.index ? Math.min(end.offset, value.length) : value.length

    const inside = asText(value.slice(from, to))
    if (inside) picked.push(inside)
    keep(asText(value.slice(0, from)), true)
    keep(asText(value.slice(to)), false)
  })

  return { picked, rest, caret }
}

/**
 * Приводит подписи картинок в соответствие их месту в поле.
 *
 * Номер в плашке раньше запоминался в момент вставки и потом врал: удалили
 * первую из двух картинок — вторая так и осталась «#2», хотя агенту она уйдёт
 * первой. Считаем номер по факту, как и текст сообщения, чтобы видимое и
 * отправленное сходились. Плашку пересобираем новым объектом, а не правим на
 * месте: тот же объект лежит в состоянии панели, и менять его исподтишка нельзя.
 */
const relabelImages = (root: HTMLElement, base: number): boolean => {
  let ordinal = base
  let changed = false

  for (const node of Array.from(root.childNodes)) {
    if (!(node instanceof HTMLElement)) continue

    const chip = chipByNode.get(node)
    if (!chip || chip.kind !== 'img' || !chip.data) continue

    ordinal += 1
    const value = `Image #${ordinal}`
    if (chip.value === value) continue

    const next: Chip = { ...chip, value }
    chipByNode.set(node, next)
    node.title = value

    const label = Array.from(node.childNodes).find((child) => child.nodeType === Node.TEXT_NODE)
    if (label) label.textContent = chipLabel(next)
    changed = true
  }

  return changed
}

/**
 * Строит плашку вложения как обычный DOM-узел, а не JSX: React не умеет мирно
 * делить содержимое contentEditable с браузером, который сам правит DOM по
 * каждой напечатанной букве — эти узлы React никогда не должен видеть.
 */
const renderChipNode = (chip: Chip, onRemove: () => void, onExpand?: () => void): HTMLElement => {
  const node = document.createElement('span')
  node.className = s.token ?? ''
  node.contentEditable = 'false'
  node.title = chipTitle(chip)
  Object.assign(node.style, CHIP_STYLE[chip.kind])

  // Значка типа вложения тут нет намеренно: он ничего не добавлял к подписи, а
  // место в начале плашки занимал. Тип и так виден по цвету и по самой подписи.
  node.appendChild(document.createTextNode(chipLabel(chip)))

  /**
   * Только у свёрнутой вставки: она единственная плашка, за которой не стоит
   * ничего кроме текста, — а значит и разворачивать обратно есть что. Знак
   * абзаца, а не стрелка: стрелок в моноширинном шрифте панели нет, они
   * подставляются из чужого и стоят рядом с крестиком чуть другого кегля.
   */
  if (onExpand) {
    const expand = document.createElement('button')
    expand.type = 'button'
    expand.className = s.tokenExpand ?? ''
    expand.textContent = '¶'
    expand.title = 'Insert as plain text'
    expand.addEventListener('click', (event) => {
      event.stopPropagation()
      onExpand()
    })
    node.appendChild(expand)
  }

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = s.tokenRemove ?? ''
  remove.textContent = '×'
  remove.addEventListener('click', (event) => {
    event.stopPropagation()
    onRemove()
  })
  node.appendChild(remove)

  chipByNode.set(node, chip)
  return node
}
