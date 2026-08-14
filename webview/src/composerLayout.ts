import type { MenuOption } from './components/Menu'

/**
 * Где сидит поле ввода. bottom — снизу, во всю ширину, как раньше. compact —
 * тоже снизу, но плотная раскладка для ограниченной высоты (панель в нижнем
 * доке IDE): без отдельной строки статуса и раскрытого списка задач, максимум
 * места отдаётся ленте. left/right — узкая боковая колонка на всю высоту
 * панели с MODEL/EFFORT/MODE, расходом и кнопками (та же рельса, что и у
 * compact — см. isSideComposerLayout), лента и поле ввода — с другой стороны,
 * друг над другом.
 */
export type ComposerLayout = 'left' | 'bottom' | 'right' | 'compact'

export const COMPOSER_LAYOUT_OPTIONS: MenuOption[] = [
  { id: 'bottom', label: 'Default' },
  { id: 'compact', label: 'Compact' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
]

/** Оболочка присылает layout как есть из настроек — старое или чужое значение считаем «снизу». */
export const normalizeComposerLayout = (value: string | undefined): ComposerLayout =>
  value === 'left' || value === 'right' || value === 'compact' ? value : 'bottom'

/**
 * Боковая рельса с MODEL/EFFORT/MODE, расходом и кнопками — во всю высоту
 * панели, слева у left, справа у right (см. App.tsx и Composer.tsx). Ширина
 * колонки считается от её содержимого, а не задаётся руками — своей ручки
 * ресайза у left/right, в отличие от прежней раскладки, больше нет.
 */
export const isSideComposerLayout = (layout: ComposerLayout): boolean => layout === 'left' || layout === 'right'
