package io.github.crmapache.amazingclaudecode.claude

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals

class IdeLanguageTest {

    /**
     * Both sides answer "which of our languages is this tag", and neither can ask the other: this side
     * writes a push notification while nothing of the panel is running, that side writes the screen. So
     * the list is in two places, and this is what stops the two from drifting apart - a tenth language
     * added only in the panel would leave a notification in English for the person who chose it.
     */
    @Test
    fun `the panel knows the same languages, in the same order`() {
        val locales = File("webview/src/i18n/locales.ts").readText()
        val ids = Regex("\\{ id: '([a-zA-Z-]+)', native:").findAll(locales).map { it.groupValues[1] }.toList()

        assertEquals(IdeLanguage.SUPPORTED, ids)
    }

    @Test
    fun `a tag written the Java way is read`() {
        assertEquals("zh-Hans", IdeLanguage.resolve("zh_CN"))
        assertEquals("ja", IdeLanguage.resolve("ja_JP"))
        assertEquals("ko", IdeLanguage.resolve("ko_KR"))
        assertEquals("pt-BR", IdeLanguage.resolve("pt_BR"))
    }

    @Test
    fun `a tag written the web way is read`() {
        assertEquals("zh-Hans", IdeLanguage.resolve("zh-Hans-CN"))
        assertEquals("en", IdeLanguage.resolve("en-GB"))
        assertEquals("es", IdeLanguage.resolve("es-419"))
    }

    /** As in the panel: closer to a script one reads slowly than to a language one may not read at all. */
    @Test
    fun `Traditional Chinese lands on the Simplified dictionary`() {
        assertEquals("zh-Hans", IdeLanguage.resolve("zh-TW"))
        assertEquals("zh-Hans", IdeLanguage.resolve("zh_HK"))
    }

    @Test
    fun `anything unknown is English rather than half a screen`() {
        assertEquals("en", IdeLanguage.resolve("sv"))
        assertEquals("en", IdeLanguage.resolve(""))
        assertEquals("en", IdeLanguage.resolve(null))
    }

    @Test
    fun `an explicit choice outweighs the IDE, an empty one does not`() {
        assertEquals("ru", IdeLanguage.inForce("ru"))
        assertEquals("zh-Hans", IdeLanguage.inForce("zh_TW"))
        // Nothing chosen: whatever this IDE is set to, which in a test run is its default.
        assertEquals(IdeLanguage.current(), IdeLanguage.inForce(""))
        assertEquals(IdeLanguage.current(), IdeLanguage.inForce("   "))
    }
}
