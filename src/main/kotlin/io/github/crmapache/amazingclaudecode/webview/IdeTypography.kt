package io.github.crmapache.amazingclaudecode.webview

import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.util.ui.JBFont

/**
 * Шрифты IDE в том виде, в каком их понимает страница панели.
 *
 * Панель по духу и есть терминал, поэтому её содержимое рисуется тем же шрифтом,
 * что и консоль: имя, размер и межстрочное расстояние берём из схемы цветов
 * («Editor | Color Scheme | Console Font») — именно её показывает встроенный
 * терминал, в котором человек и видел настоящий Claude Code. Обвязка вокруг
 * содержимого (шапка, поле ввода, селекторы) — интерфейсным шрифтом IDE, как у
 * любого нативного тулвиндоу.
 *
 * Размер приходит не числом для CSS, а множителем: страница целиком
 * масштабируется зумом встроенного браузера, и вся вёрстка — отступы, плашки,
 * иконки — растёт вместе с текстом. Пересчитывать сотню размеров в стилях для
 * этого не нужно, а координаты всплывающих меню остаются согласованными с
 * окном (в отличие от CSS-зума, который сдвинул бы их относительно позиций,
 * посчитанных в JavaScript).
 */
internal data class IdeTypography(
    val monoFamily: String,
    val uiFamily: String,
    /** Множитель межстрочного расстояния, как в настройках консоли. */
    val lineHeight: Float,
    /** Во сколько раз страницу нужно увеличить относительно её собственного макета. */
    val scale: Double,
) {
    internal companion object {
        /**
         * Размер основного текста в макете панели. Всё остальное в стилях
         * отмерено относительно него на глаз, поэтому он же и точка отсчёта: при
         * консольном шрифте того же размера панель выглядит ровно так, как
         * нарисована, без масштабирования.
         */
        private const val DESIGN_BASE_PX = 13.0

        /** Разумные пределы, чтобы случайный шрифт в 4 или 40 пунктов не разнёс панель. */
        private const val MIN_SCALE = 0.6
        private const val MAX_SCALE = 2.5

        fun read(): IdeTypography {
            val scheme = EditorColorsManager.getInstance().globalScheme
            val consoleSize = scheme.consoleFontSize2D.toDouble()

            return IdeTypography(
                monoFamily = scheme.consoleFontName,
                uiFamily = JBFont.label().family,
                lineHeight = scheme.consoleLineSpacing,
                scale = (consoleSize / DESIGN_BASE_PX).coerceIn(MIN_SCALE, MAX_SCALE),
            )
        }
    }
}
