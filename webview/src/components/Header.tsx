import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { isSideComposerLayout, type ComposerLayout } from '../composerLayout'
import { BranchChip, type Anchor } from './StatusBar'
import s from './shell.module.css'

/**
 * Что происходит во вкладке: ничего, идёт работа, работа закончена или ждут
 * человека. Кружок один и тот же, отличаются цвет и дыхание — так состояние видно
 * боковым зрением, не читая подпись.
 */
export type SessionState = 'idle' | 'running' | 'done' | 'attention' | 'crashed'

/**
 * Откуда взялось название вкладки — решает, можно ли его перезаписать.
 * 'default' — ещё не сказано ни слова, стоит заглушка ('main session' /
 * 'new session'). 'heuristic' — мгновенная догадка по первому сообщению,
 * её вправе заменить пришедший следом ответ LLM. 'llm' — то, что прислала
 * генерация (см. sessionTitle в protocol.ts): следующим ответом её больше
 * не перезаписываем, только сбросом на /clear.
 */
export type TitleSource = 'default' | 'heuristic' | 'llm'

export interface Session {
  id: string
  title: string
  state: SessionState
  /** Корневой разговор: форки и форки форков носят один и тот же. */
  groupId: string
  /** Глубина ветвления: 0 — корень, 1 — форк, 2 — форк форка. */
  depth: number
  titleSource: TitleSource
}

/**
 * Цвета групп, но не просто оттенок по кругу: два соседних оттенка при одной
 * яркости/насыщенности на глаз почти не отличаются (первая попытка именно так
 * и вышла) — золотой угол между оттенками расшатывает соседство, а чередование
 * из трёх поясов яркости/насыщенности разводит по контрасту даже те пары
 * оттенков, что всё равно оказались рядом.
 *
 * Радуга на все 360° была единственным цветным шумом в панели: вкладки
 * перекрикивали ленту, ради которой панель и открывают. Теперь оттенки живут в
 * холодной дуге темы (аквамарин → лунно-голубой → ирис) — группы по-прежнему
 * различимы, но не спорят с акцентами.
 */
const GROUP_COLOR_COUNT = 18
const GOLDEN_ANGLE = 137.508
/** Холодная дуга: аквамарин → лунно-голубой → ирис. Ширина дуги 114°. */
const HUE_START = 178
const HUE_SPAN = 114
const COLOR_BANDS = [
  { s: 62, l: 70 },
  { s: 55, l: 58 },
  { s: 45, l: 78 },
]
const GROUP_COLORS = Array.from({ length: GROUP_COLOR_COUNT }, (_, index) => {
  const hue = Math.round(HUE_START + ((index * GOLDEN_ANGLE) % HUE_SPAN))
  const band = COLOR_BANDS[index % COLOR_BANDS.length]!
  return `hsl(${hue}, ${band.s}%, ${band.l}%)`
})

/**
 * Не по счёту вкладок, а от самого id группы — цвет не сползает, когда рядом
 * открываются и закрываются другие. Простое умножение на 31 плохо
 * перемешивает похожие строки (у "session-<timestamp>" отличаются только
 * последние цифры) — соседние по времени вкладки получали соседние по кругу
 * оттенки, то есть визуально одинаковые. Финализатор MurmurHash3 ниже — тот
 * самый шаг лавинного перемешивания, после которого мелкая разница на входе
 * даёт совсем другой номер цвета на выходе.
 */
const colorForGroup = (groupId: string): string => {
  let hash = 0
  for (let i = 0; i < groupId.length; i++) hash = Math.imul(hash ^ groupId.charCodeAt(i), 0x01000193)

  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35)
  hash ^= hash >>> 16

  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length] ?? GROUP_COLORS[0]!
}

interface HeaderProps {
  sessions: Session[]
  activeSession: string
  onPickSession: (id: string) => void
  onCloseSession: (id: string) => void
  onNewSession: () => void
  /**
   * Порядок вкладок после перетаскивания: группу `groupId` поставить перед
   * группой `beforeGroupId` (или в конец, если её нет).
   *
   * Двигается именно группа целиком — разговор вместе со своими форками.
   * Поштучно их не растащить и чужую вкладку внутрь не вставить: группа — это
   * одна тема, и вкладка посреди чужой темы не значила бы ничего, кроме путаницы.
   */
  onReorderGroups: (groupId: string, beforeGroupId: string | null) => void
  /**
   * История, MCP, плагины, звуки и раскладка композера собраны в одно меню
   * за кнопкой-бургером справа в шапке — по одной кнопке на каждый пункт
   * места в шапке уже не хватало. Разметку самого меню рисует App.tsx, тем
   * же способом, что и MODEL/EFFORT/MODE (см. SelectorKind), сюда приходит
   * только точка открытия.
   */
  onOpenMenu: (anchor: Anchor) => void
  /**
   * Та же раскладка, что и у всей панели (см. App.tsx) — здесь важно, сжатая
   * ли она (compact и left/right — обе экономят высоту той же боковой рельсой,
   * см. isSideComposerLayout): шапка ниже (32px вместо 34px), а значки в ней —
   * меньше (26px вместо 28px). Модификатор на самой шапке, а не пропы на
   * каждой кнопке — правит один каскад в стилях, а не десяток мест здесь.
   */
  layout: ComposerLayout
  /**
   * Ветка и её PR — одно и то же место у любой раскладки: справа в шапке,
   * перед бургером. Раньше жили в трёх разных местах в зависимости от layout
   * (строка статуса, строка задач, сам композер) — теперь один источник
   * правды, не три копии, которые надо было бы держать в согласии.
   */
  gitBranch?: string
  pullRequest?: string
  onOpenPullRequest?: () => void
}

/** Дальше этого сдвига нажатие перестаёт быть кликом и становится перетаскиванием. */
const DRAG_THRESHOLD_PX = 4

/**
 * Запас, на который проверяется смена места: рука на границе дрожит, и без него
 * соседи подрагивали бы вместе с ней (см. startDrag).
 */
const SWAP_GAP_PX = 8

/** Сколько длится приземление брошенной вкладки. Столько же, сколько переход в shell.module.css. */
const LANDING_MS = 160

const DOT_CLASS: Record<SessionState, string> = {
  idle: '',
  running: s.dotRunning ?? '',
  done: s.dotDone ?? '',
  attention: s.dotAttention ?? '',
  crashed: s.dotCrashed ?? '',
}

const DOT_TITLE: Record<SessionState, string> = {
  idle: 'Idle',
  running: 'Claude is working',
  done: 'Turn finished',
  attention: 'Waiting for you',
  crashed: 'Session stopped unexpectedly',
}

/**
 * Три полоски рисунком, а не символом «☰»: у типографской версии своя посадка
 * в шрифте, она сидит ниже середины своей строки — рядом с веткой (см.
 * BranchChip), у которой центр честный, разница на глаз читалась как
 * непрокрашенный ряд. Рисунком строки стоят строго по центру viewBox, а с ним
 * и кнопки.
 */
const HamburgerIcon = () => (
  <svg className={s.menuIcon} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const Header = ({
  sessions,
  activeSession,
  onPickSession,
  onCloseSession,
  onNewSession,
  onReorderGroups,
  onOpenMenu,
  layout,
  gitBranch,
  pullRequest,
  onOpenPullRequest,
}: HeaderProps) => {
  const compact = layout === 'compact' || isSideComposerLayout(layout)
  const header = useRef<HTMLElement>(null)
  const tabs = useRef<HTMLDivElement>(null)

  /** Вкладку только что тащили — ближайший клик по ней не выбор, а хвост жеста. */
  const dragged = useRef(false)
  /** Группа, которую тащат прямо сейчас, — она едет за курсором и приподнята. */
  const [dragging, setDragging] = useState<string | null>(null)
  /** На сколько её сдвинуть: столько же, сколько прошла рука от места нажатия. */
  const [offset, setOffset] = useState(0)
  /**
   * Насколько подвинуть каждую из остальных групп, чтобы освободить место.
   *
   * Двигаем их сдвигом, а не перестановкой ряда: пока идёт жест, порядок в
   * состоянии не меняется вовсе. Перестановка на ходу порождала обратную связь —
   * сосед уезжал, геометрия менялась, условие срабатывало снова, и вкладки
   * принимались метаться. Здесь же весь расчёт идёт от одного снимка, сделанного
   * в начале жеста, и метаться нечему.
   */
  const [shifts, setShifts] = useState<Record<string, number>>({})

  /**
   * Где группы стояли на экране в тот миг, когда вкладку отпустили.
   *
   * Без этого снимка приземление дёргалось: перестановка ряда и снятие сдвигов
   * случаются в одном кадре, и браузер видел только конечную вёрстку. Вкладка
   * телепортировалась из-под руки в свой слот, а соседи вдобавок доигрывали уже
   * отменённый сдвиг — прыжок на ширину вкладки и медленный возврат назад.
   * Со снимком тот же кадр начинается с прежней картинки и доезжает до новой.
   */
  const landing = useRef<Map<string, { x: number; y: number }> | null>(null)

  /**
   * Снимок ряда: где какая группа стоит и какой она ширины.
   *
   * Снимается один раз, в начале жеста, и дальше не меняется — именно поэтому
   * расталкивание получается спокойным: все решения принимаются по неподвижной
   * картинке, а не по той, которую сами же и двигаем.
   */
  const rowSnapshot = (): { groupId: string; left: number; right: number; top: number; bottom: number }[] => {
    const root = tabs.current
    if (!root) return []

    const groups: { groupId: string; left: number; right: number; top: number; bottom: number }[] = []

    for (const node of Array.from(root.querySelectorAll<HTMLElement>('[data-group]'))) {
      const groupId = node.dataset.group
      if (!groupId) continue

      const left = node.offsetLeft
      const right = left + node.offsetWidth
      const top = node.offsetTop
      const bottom = top + node.offsetHeight
      const last = groups.at(-1)

      if (last?.groupId === groupId) {
        last.left = Math.min(last.left, left)
        last.right = Math.max(last.right, right)
        last.top = Math.min(last.top, top)
        last.bottom = Math.max(last.bottom, bottom)
        continue
      }

      groups.push({ groupId, left, right, top, bottom })
    }

    return groups
  }

  /** Вкладки по группам: у группы их столько, сколько в разговоре форков. */
  const groupNodes = (): Map<string, HTMLElement[]> => {
    const root = tabs.current
    const nodes = new Map<string, HTMLElement[]>()
    if (!root) return nodes

    for (const node of Array.from(root.querySelectorAll<HTMLElement>('[data-group]'))) {
      const groupId = node.dataset.group
      if (!groupId) continue

      const list = nodes.get(groupId)
      if (list) list.push(node)
      else nodes.set(groupId, [node])
    }

    return nodes
  }

  /**
   * На сколько вкладка сейчас смещена относительно своего места в вёрстке.
   *
   * Спрашиваем именно у браузера, а не считаем сами: если сосед в этот момент
   * ещё едет, здесь будет его настоящее положение на полпути, а не то, куда он
   * только собирается приехать. Иначе бросок посреди чужого переезда щёлкал бы
   * соседом в конечную точку.
   */
  const liveShift = (node: HTMLElement): { x: number; y: number } => {
    const transform = getComputedStyle(node).transform
    if (!transform || transform === 'none') return { x: 0, y: 0 }

    try {
      const matrix = new DOMMatrixReadOnly(transform)
      return { x: matrix.m41, y: matrix.m42 }
    } catch {
      return { x: 0, y: 0 }
    }
  }

  /**
   * Куда просится вкладка при таком сдвиге: номер места в ряду.
   *
   * Сосед уступает, когда вкладка наехала на него больше чем наполовину — то
   * есть её край перешёл середину соседа. Ответ зависит только от положения
   * руки и неподвижного снимка ряда: одна и та же рука даёт один и тот же
   * ответ, сколько раз ни спроси.
   */
  const placeFor = (
    row: { groupId: string; left: number; right: number; top: number; bottom: number }[],
    from: number,
    shift: number,
  ): number => {
    const own = row[from]
    if (!own) return from

    const left = own.left + shift
    const right = own.right + shift
    let place = from

    for (const [index, group] of row.entries()) {
      if (index === from) continue
      // Соседи из других строк не расступаются: сдвиг по горизонтали для них
      // бессмыслен, а ряд при нехватке места переносится.
      if (group.bottom <= own.top || group.top >= own.bottom) continue

      const middle = (group.left + group.right) / 2
      if (index < from && left < middle) place = Math.min(place, index)
      if (index > from && right > middle) place = Math.max(place, index)
    }

    return place
  }

  /**
   * Начало перетаскивания.
   *
   * Обычные mouse-события и слушатели на самом окне, а не pointer-события с
   * захватом: встроенный в IDE браузер рисуется офскрин и синтезирует ввод сам —
   * pointer capture там до вкладки не доходит, и перетаскивание просто не
   * начиналось. Слушатели на окне работают в обоих случаях и заодно продолжают
   * ловить мышь, когда та ушла за пределы ряда вкладок.
   *
   * preventDefault сразу: иначе браузер понимает зажатую кнопку как выделение
   * текста и вместо переезда вкладки подсвечивает её подпись.
   */
  const startDrag = (event: ReactMouseEvent<HTMLDivElement>, groupId: string) => {
    // Новое нажатие — новая история: хвост прошлого перетаскивания к нему уже не
    // относится. Снимаем именно здесь, а не в обработчике клика по вкладке: тот
    // выполняется не всегда — отпустив вкладку мимо ряда, клик приходит общему
    // предку, и поднятый флаг съедал бы следующий настоящий клик по вкладке.
    dragged.current = false

    // Тащим только левой кнопкой и только за саму вкладку: крестик закрытия
    // остаётся кнопкой, а не ручкой для перетаскивания.
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('button')) return

    event.preventDefault()

    const row = rowSnapshot()
    const from = row.findIndex((group) => group.groupId === groupId)
    if (from < 0) return

    const own = row[from]!
    const width = own.right - own.left
    const startX = event.clientX
    let started = false
    let place = from

    const onMove = (move: MouseEvent) => {
      if (!started) {
        // До порога это ещё обычный клик по вкладке, а не перетаскивание.
        if (Math.abs(move.clientX - startX) < DRAG_THRESHOLD_PX) return
        started = true
        setDragging(groupId)
      }

      const shift = move.clientX - startX
      setOffset(shift)

      /**
       * Новое место принимаем, только если оно устоит и при чуть меньшем сдвиге:
       * ровно на границе рука дрожит на пару пикселей, и без этой проверки
       * соседи начинали подрагивать туда-сюда вместе с ней.
       */
      const wanted = placeFor(row, from, shift)
      if (wanted !== place) {
        const backOff = wanted > place ? -SWAP_GAP_PX : SWAP_GAP_PX
        if (placeFor(row, from, shift + backOff) === wanted) place = wanted
      }

      /**
       * Соседи между старым местом и новым отходят на ширину вкладки — ровно
       * настолько, чтобы освободить ей место. Двигаются сдвигом, а сам ряд
       * остаётся как есть: порядок поменяется один раз, когда вкладку отпустят.
       */
      const next: Record<string, number> = {}
      for (const [index, group] of row.entries()) {
        if (index === from) continue
        if (index > from && index <= place) next[group.groupId] = -width
        if (index < from && index >= place) next[group.groupId] = width
      }
      setShifts(next)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)

      if (started) {
        // Картинка на экране перед броском — с неё начнётся приземление.
        // Вёрстка за жест не менялась, так что к местам из снимка достаточно
        // добавить сдвиг, с которым каждая группа сейчас нарисована.
        const nodes = groupNodes()
        const rendered = new Map<string, { x: number; y: number }>()
        for (const group of row) {
          const node = nodes.get(group.groupId)?.[0]
          const live = node ? liveShift(node) : { x: 0, y: 0 }
          rendered.set(group.groupId, { x: group.left + live.x, y: group.top + live.y })
        }
        landing.current = rendered

        // Место назначения в исходном ряду: уехав вправо, встаём перед той
        // группой, что шла следом за последней расступившейся.
        const before = place > from ? (row[place + 1]?.groupId ?? null) : row[place]?.groupId ?? null
        if (place !== from) onReorderGroups(groupId, before)

        // Клик после перетаскивания вкладку не переключает: рука двигала её, а
        // не выбирала. Событие click прилетит сразу за mouseup — гасим его там.
        dragged.current = true
      }

      setDragging(null)
      setOffset(0)
      setShifts({})
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  /**
   * Приземление после броска.
   *
   * Кадр, в котором меняется порядок, начинается с прежней картинки: каждая
   * группа получает короткий переезд от того места, где она была под рукой, к
   * своему новому. Соседи при этом стоят как вкопанные (переезжать им некуда —
   * они и так уже на своих местах), а брошенная вкладка спокойно доезжает
   * из-под руки в освободившийся слот.
   *
   * Обычный effect тут не годится: он сработал бы после того, как браузер уже
   * нарисовал кадр в новых местах, — то есть после самого рывка.
   */
  useLayoutEffect(() => {
    const before = landing.current
    if (!before) return
    landing.current = null

    const nodes = groupNodes()

    for (const group of rowSnapshot()) {
      const was = before.get(group.groupId)
      if (!was) continue

      const dx = was.x - group.left
      const dy = was.y - group.top

      for (const node of nodes.get(group.groupId) ?? []) {
        // Переезд именно анимацией, а не переходом: у соседей сдвиг выходит
        // нулевым, и без неё они доигрывали бы отменённый переход — прыжок на
        // ширину вкладки и медленный возврат. Анимация в каскаде выше перехода
        // и держит их на месте, пока тот доигрывает вхолостую.
        node.animate?.([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
          duration: LANDING_MS,
          easing: 'ease',
        })
      }
    }
  })

  /**
   * Вкладки при нехватке места переносятся на вторую строку — хедер растёт.
   * Оверлеи (история, MCP, плагины, меню) позиционируются от его реальной
   * высоты через переменную, а не число: иначе на второй строке они легли бы
   * поверх вкладок.
   */
  useEffect(() => {
    const element = header.current
    if (!element) return

    const updateHeight = () => {
      document.documentElement.style.setProperty('--header-height', `${element.offsetHeight}px`)
    }

    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <header className={`${s.header} ${compact ? s.headerCompact : ''}`} ref={header}>
      <div className={s.tabs} ref={tabs}>
        {sessions.map((session, index) => {
          const color = colorForGroup(session.groupId)
          // Группу отбиваем от соседней зазором: цвета мало, если вкладки слиплись.
          const startsGroup = index === 0 || sessions[index - 1]?.groupId !== session.groupId

          return (
            <div
              key={session.id}
              data-group={session.groupId}
              className={[
                s.tab,
                session.id === activeSession ? s.tabActive : '',
                startsGroup ? s.tabGroupStart : '',
                dragging === session.groupId ? s.tabDragging : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                paddingLeft: 11 + session.depth * 9,
                // Едет вся группа разом: разговор со своими форками — одно целое.
                // Остальные расступаются, освобождая ей место (см. shifts).
                ...(dragging === session.groupId
                  ? { transform: `translateX(${offset}px)` }
                  : shifts[session.groupId]
                    ? { transform: `translateX(${shifts[session.groupId]}px)` }
                    : {}),
              }}
              onMouseDown={(event) => startDrag(event, session.groupId)}
              onClick={() => {
                // Хвост перетаскивания, а не выбор вкладки — см. startDrag, там же
                // флаг и снимается со следующим нажатием.
                if (dragged.current) return
                onPickSession(session.id)
              }}
            >
              <span className={s.tabGroupBar} style={{ background: color }} />
              <span className={`${s.dot} ${DOT_CLASS[session.state]}`} title={DOT_TITLE[session.state]} />
              {session.depth > 0 ? (
                <span className={s.tabFork} style={{ color }}>
                  ⑂
                </span>
              ) : null}
              <span className={s.tabTitle}>{session.title}</span>
              <button
                type="button"
                className={s.tabClose}
                onClick={(event) => {
                  event.stopPropagation()
                  onCloseSession(session.id)
                }}
              >
                ×
              </button>
            </div>
          )
        })}

        <button type="button" className={s.tabAdd} title="New session" onClick={onNewSession}>
          +
        </button>
      </div>

      <div className={s.spacer} />

      <div className={s.headerTools}>
        <BranchChip gitBranch={gitBranch} pullRequest={pullRequest} onOpenPullRequest={onOpenPullRequest} />

        <button
          type="button"
          className={s.historyButton}
          aria-label="Menu"
          data-tooltip="Menu"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            onOpenMenu({ right: window.innerWidth - rect.right, top: rect.top, bottom: rect.bottom })
          }}
        >
          <HamburgerIcon />
        </button>
      </div>
    </header>
  )
}
