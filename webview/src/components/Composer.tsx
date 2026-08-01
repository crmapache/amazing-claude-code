import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { matchFiles } from '../feed/files'
import { chipLabel } from '../feed/reference'
import {
  argumentQuery,
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
import { SlashSuggest } from './SlashSuggest'
import s from './composer.module.css'

const CHIP_GLYPH: Record<ChipKind, string> = { file: '▤', img: '▣', dir: '▸', cmd: '/', ref: '⟨⟩', quote: '"' }

const CHIP_STYLE: Record<ChipKind, { background: string; borderColor: string; color: string }> = {
  file: { background: 'var(--acc-accent-12)', borderColor: 'var(--acc-accent-32)', color: 'var(--acc-accent-light)' },
  img: { background: 'var(--acc-agent-12)', borderColor: 'var(--acc-agent-32)', color: 'var(--acc-agent-light)' },
  dir: { background: 'var(--acc-ok-12)', borderColor: 'var(--acc-ok-32)', color: 'var(--acc-ok-light)' },
  cmd: { background: 'var(--acc-warn-12)', borderColor: 'var(--acc-warn-32)', color: 'var(--acc-warn-light)' },
  ref: { background: 'var(--acc-branch-12)', borderColor: 'var(--acc-branch-32)', color: 'var(--acc-branch-light)' },
  quote: { background: 'var(--acc-quote-12)', borderColor: 'var(--acc-quote-32)', color: 'var(--acc-quote)' },
}

/** Чей это узел: чтобы забрать байты картинки обратно, строку с DOM не парсим. */
const chipByNode = new WeakMap<HTMLElement, Chip>()

interface ComposerProps {
  /** Чья это вкладка — история отмены своя у каждой, а не одна на все сразу. */
  sessionId: string
  /** Текст и вложения одной последовательностью — в том порядке, в каком их вставили. */
  tokens: UserToken[]
  streaming: boolean
  planMode: boolean
  /** Команды панели и агента одним списком. */
  commands: CommandEntry[]
  /** Файлы проекта для подсказки "@" — от корня рабочей директории. */
  files: string[]
  /** Сколько картинок уже ушло раньше в этой сессии — нумерация новых продолжает отсюда. */
  imageBaseCount: number
  /** Панель просит сфокусировать поле, например после ссылки из редактора. */
  focusToken: number
  onTokensChange: (tokens: UserToken[]) => void
  onAttach: () => void
  onSubmit: () => void
  onStop: () => void
  /** Stop не подтвердился дольше разумного — предлагаем убить процесс насильно. */
  stopStalled: boolean
  onForceStop: () => void
}

export const Composer = ({
  sessionId,
  tokens,
  streaming,
  planMode,
  commands,
  files,
  imageBaseCount,
  focusToken,
  onTokensChange,
  onAttach,
  onSubmit,
  onStop,
  stopStalled,
  onForceStop,
}: ComposerProps) => {
  const [focused, setFocused] = useState(false)
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

  useEffect(() => {
    const root = input.current
    if (!root || tokens === lastReported.current) return

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

  // Слэш-команда осмысленна, только пока в поле вообще нет вложений — команда
  // с приложенным файлом попросту не имеет смысла.
  const plain = useMemo(
    () => (tokens.some((token) => token.kind === 'chip') ? null : plainText(tokens)),
    [tokens],
  )

  const query = plain === null ? null : slashQueryFromText(plain)

  const commandMatches = useMemo(
    () => (query === null || dismissed ? [] : matchCommands(commands, query)),
    [commands, query, dismissed],
  )

  // Название команды уже набрано и дальше идёт её аргумент — второй шаг
  // подсказки, ровно как в терминале: сперва команда, потом её значение.
  const argument = useMemo(
    () => (plain === null || dismissed || commandMatches.length > 0 ? null : argumentQuery(plain)),
    [plain, dismissed, commandMatches],
  )

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
    if (plain === null || dismissed || commandMatches.length > 0 || argument) return null
    const name = commandNameBeforeArgument(plain)
    return name ? (commands.find((command) => command.id === name) ?? null) : null
  }, [plain, dismissed, commandMatches, argument, commands])

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

    rebuildDom(root, next)
    // Читаем поле обратно, а не докладываем next как есть: картинок могло стать
    // меньше (вырезали кусок вместе с одной из них), и подписи оставшихся должны
    // сдвинуться — иначе в поле останется «Image #2», который уйдёт агенту первым.
    report(readTokens(root), true)
  }

  /** Восстановление шагом истории — само по себе новой границей истории не является. */
  const restoreTokens = (next: UserToken[]) => {
    const root = input.current
    if (root) rebuildDom(root, next)
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

    report(next)
  }

  // Команды панели вставляем без хвостового пробела: у них нет аргументов, и
  // отправлять их можно сразу. У команды с аргументом (/model, /effort) после
  // выбора имени сразу же откроется вторая подсказка — уже по значению.
  const insert = (command: CommandEntry) => {
    const text = argument
      ? `/${argument.command} ${command.id}`
      : command.local
        ? `/${command.id}`
        : `/${command.id} `

    applyTokens([{ kind: 'text', value: text }])
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
    const node = renderChipNode(chip, () => onChipRemoved(root, node))
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

  /** Курсор в поле — или его конец, если фокус потерян и его по-честному нет. */
  const currentRange = (root: HTMLElement): Range => {
    const selection = window.getSelection()
    return selection && selection.rangeCount > 0 && root.contains(selection.getRangeAt(0).startContainer)
      ? selection.getRangeAt(0)
      : endRange(root)
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

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

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

    const node = renderChipNode(chip, () => onChipRemoved(root, node))
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

    for (const token of next) {
      if (token.kind === 'text') {
        const text = document.createTextNode(token.value)
        range.insertNode(text)
        range.setStartAfter(text)
      } else {
        const node: HTMLElement = renderChipNode(token.chip, () => onChipRemoved(root, node))
        range.insertNode(node)
        range.setStartAfter(node)
      }
      range.collapse(true)
    }

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

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
      if (text) insertTextAtCursor(text)
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

  const placeholder = tokens.length
    ? ''
    : planMode
      ? 'Describe what to plan…'
      : 'Ask, or describe a change… @ for files, / for commands'

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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

    // Своя история отмены — родной Cmd+Z браузера про наши чипы ничего не
    // знает и восстановит их некорректно, поэтому перехватываем полностью.
    if (event.metaKey && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
      return
    }

    if (event.metaKey && !event.shiftKey && event.key.toLowerCase() === 'y') {
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
      if (tokens.length > 0) sentHistory.current.push(tokens)
      historyIndex.current = null
      historyDraft.current = null
      onSubmit()
      return
    }

    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault()
      // Не execCommand('insertText', ..., '\n') — здесь он не кладёт литеральный
      // символ строки в текстовый узел, а расщепляет поле на отдельный <div> под
      // вторую строку (проверено живьём). Такой <div> излечение токенов не
      // понимает и молча теряет целиком — вторая строка не доходила до отправки.
      // insertTextAtCursor вставляет тем же самым текстовым узлом напрямую через
      // Range API, без риска, что браузер сам решит расщепить его на блоки.
      insertTextAtCursor('\n')
    }
  }

  return (
    <div className={s.boxWrap}>
      {suggesting ? (
        <SlashSuggest
          commands={suggestionItems}
          highlight={highlight}
          onPick={isFileSuggest ? (picked) => insertFileReference(picked.id) : insert}
          onHighlight={setHighlight}
          showSlash={showSlash}
        />
      ) : null}

      <div className={`${s.box} ${focused ? s.boxFocused : ''}`} ref={box}>
        {ghostHint && ghostRect ? (
          <span
            className={s.ghostHint}
            style={{ left: ghostRect.left, top: ghostRect.top, lineHeight: `${ghostRect.height}px` }}
            aria-hidden="true"
          >
            {ghostHint}
          </span>
        ) : null}

        <div
          ref={input}
          className={s.field}
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          onInput={handleInput}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPaste={handlePaste}
          onCopy={(event) => copySelection(event, false)}
          onCut={(event) => copySelection(event, true)}
          onKeyDown={handleKeyDown}
        />

        <div className={s.tools}>
          {/* Одна кнопка на все вложения: файл, картинка и папка выбираются одним
              и тем же диалогом, а разницу видно по самому пути. */}
          <button type="button" className={s.attach} title="Attach files or folders" onClick={onAttach}>
            <span className={s.attachGlyph}>@</span>
            <span className={s.attachLabel}>attach</span>
          </button>
          {/* Кнопка не открывает каталог, а ставит слэш в поле: дальше команду
              набирают, и список сужается сам. Пока в поле уже что-то есть, слэш
              посреди текста не запускает подсказку — кнопка прячется, чтобы не
              звать на бесполезное нажатие. */}
          {tokens.length === 0 ? (
            <button
              type="button"
              className={s.attach}
              title="Slash commands"
              onClick={() => {
                insertTextAtCursor('/')
                input.current?.focus()
              }}
            >
              <span className={s.attachSlash}>/</span>
              <span className={s.attachLabel}>command</span>
            </button>
          ) : null}

          <div className={s.spacer} />

          {streaming ? (
            <button type="button" className={s.stop} onClick={onStop}>
              ■ Stop
            </button>
          ) : null}

          {/* Обычный Stop честно ждёт подтверждения. Если оно не пришло дольше
              разумного — единственный работающий выход отсюда - убить процесс. */}
          {stopStalled ? (
            <button type="button" className={s.forceStop} onClick={onForceStop} title="Claude isn't confirming the stop">
              ⚠ Not responding · Force stop
            </button>
          ) : null}

          <button
            type="button"
            className={`${s.send} ${streaming ? s.sendQueued : ''}`}
            onClick={onSubmit}
          >
            {streaming ? 'Queue' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
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

/** Пустой диапазон в самом конце содержимого — запасной вариант, если курсора нет. */
const endRange = (root: HTMLElement): Range => {
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  return range
}

const placeCaretAtEnd = (root: HTMLElement | null) => {
  if (!root) return
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(endRange(root))
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

/** Пересобирает DOM с нуля из токенов — только для программных правок, не для печати. */
const rebuildDom = (root: HTMLElement, tokens: UserToken[]) => {
  root.innerHTML = ''

  for (const token of tokens) {
    if (token.kind === 'text') {
      root.appendChild(document.createTextNode(token.value))
      continue
    }

    const node = renderChipNode(token.chip, () => onChipRemoved(root, node))
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

  return tokens
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
const renderChipNode = (chip: Chip, onRemove: () => void): HTMLElement => {
  const node = document.createElement('span')
  node.className = s.token ?? ''
  node.contentEditable = 'false'
  node.title = chip.kind === 'quote' ? (chip.text ?? '') : chip.range ? `${chip.value} ${chip.range}` : chip.value
  Object.assign(node.style, CHIP_STYLE[chip.kind])

  const glyph = document.createElement('span')
  glyph.className = s.tokenGlyph ?? ''
  glyph.textContent = CHIP_GLYPH[chip.kind]
  node.appendChild(glyph)

  node.appendChild(document.createTextNode(chipLabel(chip)))

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
