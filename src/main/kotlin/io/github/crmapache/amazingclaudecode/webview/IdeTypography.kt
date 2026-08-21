package io.github.crmapache.amazingclaudecode.webview

import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.util.ui.JBFont

/**
 * The IDE's fonts in the shape the panel's page understands.
 *
 * In spirit the panel is a terminal, so its contents are drawn in the same font as the console: the
 * name, the size and the line spacing come from the colour scheme ("Editor | Color Scheme | Console
 * Font") - that is what the built-in terminal shows, the one where a person saw the real Claude Code.
 * What surrounds the contents (the header, the input field, the selectors) uses the IDE's interface
 * font, as any native tool window does.
 *
 * The size arrives not as a number for CSS but as a multiplier: the whole page is scaled by the
 * embedded browser's zoom, and the entire layout - paddings, chips, icons - grows along with the text.
 * There is no need to recompute a hundred sizes in the styles for that, and popup menu coordinates stay
 * consistent with the window (unlike CSS zoom, which would shift them relative to positions computed in
 * JavaScript).
 */
internal data class IdeTypography(
    val monoFamily: String,
    val uiFamily: String,
    /** The line spacing multiplier, as in the console settings. */
    val lineHeight: Float,
    /** How many times the page has to be scaled up relative to its own layout. */
    val scale: Double,
) {
    internal companion object {
        /**
         * The size of the body text in the panel's design. Everything else in the styles is measured
         * against it by eye, so it is also the point of reference: with a console font of the same size
         * the panel looks exactly as it was drawn, without any scaling.
         */
        private const val DESIGN_BASE_PX = 13.0

        /** Sensible bounds, so that an accidental 4- or 40-point font does not blow the panel apart. */
        private const val MIN_SCALE = 0.6
        private const val MAX_SCALE = 2.5

        /**
         * Below this, the console's line spacing (usually 1.0-1.2 - code in an editor is squeezed for
         * vertical density) packs wrapped lines of prose so tightly that the selection highlight between
         * them merges into one solid block. The panel is not a code editor: it needs prose spacing
         * rather than console spacing.
         */
        private const val MIN_LINE_HEIGHT = 1.4f

        fun read(): IdeTypography {
            val scheme = EditorColorsManager.getInstance().globalScheme
            val consoleSize = scheme.consoleFontSize2D.toDouble()

            return IdeTypography(
                monoFamily = scheme.consoleFontName,
                uiFamily = JBFont.label().family,
                lineHeight = scheme.consoleLineSpacing.coerceAtLeast(MIN_LINE_HEIGHT),
                scale = (consoleSize / DESIGN_BASE_PX).coerceIn(MIN_SCALE, MAX_SCALE),
            )
        }
    }
}
