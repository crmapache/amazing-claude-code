import type { MenuOption } from './components/Menu'

/**
 * Где сидит поле ввода: слева и справа колонкой рядом с лентой, снизу — как
 * раньше, compact — тоже снизу, но плотная раскладка для ограниченной высоты
 * (панель в нижнем доке IDE): без отдельной строки статуса и раскрытого
 * списка задач, максимум места отдаётся ленте.
 */
export type ComposerLayout = 'left' | 'bottom' | 'right' | 'compact'

export const COMPOSER_LAYOUT_OPTIONS: MenuOption[] = [
  { id: 'left', label: 'Left' },
  { id: 'bottom', label: 'Bottom', tag: 'default' },
  { id: 'right', label: 'Right' },
  { id: 'compact', label: 'Compact' },
]

/**
 * Ниже этой ширины строка селекторов (MODEL/EFFORT/MODE) под полем ввода не
 * помещается в один ряд и переносится — три раза по 120px, два зазора по 4px
 * между ними, отступы .status (2px×2) и .dock (10px×2) вокруг. Небольшой запас
 * сверх точного расчёта (392px) — на случай субпиксельного округления.
 */
export const MIN_COMPOSER_WIDTH = 400
export const DEFAULT_COMPOSER_WIDTH = 440

/** Ширина самой ручки ресайза (.composerResizeHandle в shell.module.css) — ей тоже нужно место в ряду. */
const COMPOSER_HANDLE_WIDTH = 5

/**
 * Не уже минимума (влезают все селекторы) и не шире половины экрана — а когда
 * тесно и то, и другое разом (тулвиндоу уже минимума целиком), побеждает
 * реальная ширина панели: лучше отдать инпуту всё место без остатка, чем
 * растянуть его за пределы видимого и обрезать край мышью не дотянуться.
 *
 * Реальная ширина — это viewportWidth за вычетом ручки ресайза: она стоит в
 * том же ряду (flex: none, 5px) и тоже требует места. Без вычета на самой
 * узкой панели именно ручка (и с ней край дока) уезжала за viewport — обрезал
 * их уже не overflow дока, а overflow:hidden всей панели, то есть насовсем.
 */
export const clampComposerWidth = (width: number, viewportWidth: number): number => {
  const available = viewportWidth - COMPOSER_HANDLE_WIDTH
  const max = Math.min(Math.max(MIN_COMPOSER_WIDTH, Math.floor(available / 2)), available)
  return Math.min(Math.max(width, MIN_COMPOSER_WIDTH), max)
}

/** Оболочка присылает layout как есть из настроек — старое или чужое значение считаем «снизу». */
export const normalizeComposerLayout = (value: string | undefined): ComposerLayout =>
  value === 'left' || value === 'right' || value === 'compact' ? value : 'bottom'

/** Поле ввода стоит колонкой рядом с лентой (слева или справа), а не строкой сверху/снизу. */
export const isSideComposerLayout = (layout: ComposerLayout): boolean => layout === 'left' || layout === 'right'
