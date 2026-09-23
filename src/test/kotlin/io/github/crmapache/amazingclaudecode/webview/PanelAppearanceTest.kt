package io.github.crmapache.amazingclaudecode.webview

import io.github.crmapache.amazingclaudecode.claude.ClaudePreferences
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * The two halves of how the panel looks that are decided on this side: which theme its first frame is
 * painted in, and how far the page is zoomed for a text size.
 */
class PanelAppearanceTest {

    @Test
    fun `nothing chosen follows the IDE`() {
        assertEquals(ClaudePreferences.THEME_DARK, PanelTheme.resolve("", ideDark = true))
        assertEquals(ClaudePreferences.THEME_LIGHT, PanelTheme.resolve("", ideDark = false))
    }

    @Test
    fun `a choice wins over the IDE`() {
        assertEquals(ClaudePreferences.THEME_LIGHT, PanelTheme.resolve(ClaudePreferences.THEME_LIGHT, ideDark = true))
        assertEquals(ClaudePreferences.THEME_DARK, PanelTheme.resolve(ClaudePreferences.THEME_DARK, ideDark = false))
    }

    @Test
    fun `a size of its own replaces the console's`() {
        assertEquals(13.5, IdeTypography.sizeOf(13.5, ClaudePreferences.TEXT_SIZE_FOLLOW))
        assertEquals(16.0, IdeTypography.sizeOf(13.5, 16))
    }

    /* The design is drawn at 13: a panel at 13 is not zoomed at all, and the bounds hold at either end. */
    @Test
    fun `the zoom is the size over the design's thirteen, within bounds`() {
        assertEquals(1.0, IdeTypography.scaleOf(13.0))
        assertEquals(2.0, IdeTypography.scaleOf(26.0))
        assertEquals(0.6, IdeTypography.scaleOf(4.0))
        assertEquals(2.5, IdeTypography.scaleOf(60.0))
    }

    /* Every size the setting accepts is one the zoom keeps as it is - nothing chosen gets quietly clamped. */
    @Test
    fun `every size the setting accepts is drawn as chosen`() {
        for (size in ClaudePreferences.TEXT_SIZE_MIN..ClaudePreferences.TEXT_SIZE_MAX) {
            assertEquals(size / 13.0, IdeTypography.scaleOf(size.toDouble()), 1e-9)
        }
    }

    @Test
    fun `the theme rides in the address beside whatever is there`() {
        assertEquals(
            "http://acc-webview/index.html?theme=light",
            WebviewHost.withTheme("http://acc-webview/index.html", "light"),
        )
        assertEquals(
            "http://localhost:5173/?debug=1&theme=dark",
            WebviewHost.withTheme("http://localhost:5173/?debug=1", "dark"),
        )
        // A fragment ends the query: a theme written after it would never reach the page.
        assertEquals(
            "http://localhost:5173/?theme=dark#top",
            WebviewHost.withTheme("http://localhost:5173/#top", "dark"),
        )
    }
}
