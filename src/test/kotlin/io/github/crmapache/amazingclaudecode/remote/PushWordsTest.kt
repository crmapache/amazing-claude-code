package io.github.crmapache.amazingclaudecode.remote

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PushWordsTest {

    private fun everyTitle(language: String): List<String> = listOf(
        PushWords.permission(language, ""),
        PushWords.permission(language, "rm -rf build"),
        PushWords.question(language),
        PushWords.plan(language),
        PushWords.rateLimit(language),
        PushWords.extraUsage(language),
        PushWords.trouble(language, "nimbus-checkout"),
        PushWords.turnFinished(language),
    )

    /**
     * A line left in English on a lock screen is invisible as a mistake - it simply reads as English. So
     * every language is checked against the English one, and none of these seven is a word that coincides.
     */
    @Test
    fun `no language quietly keeps the English wording`() {
        val english = everyTitle("en")

        for (language in PushWords.LANGUAGES) {
            if (language == "en") continue

            val titles = everyTitle(language)
            val same = titles.filterIndexed { index, title -> title == english[index] }

            assertTrue(same.isEmpty(), "$language repeats the English: $same")
        }
    }

    @Test
    fun `every language answers with something`() {
        for (language in PushWords.LANGUAGES) {
            for (title in everyTitle(language)) assertTrue(title.isNotBlank(), language)
        }
    }

    /** A tag we have no words for falls back to English rather than to an empty notification. */
    @Test
    fun `an unknown language falls back to English`() {
        assertEquals(everyTitle("en"), everyTitle("sv"))
    }

    /** The name it is about has to survive into the text - a notification without it says nothing. */
    @Test
    fun `the project and the target reach the words`() {
        for (language in PushWords.LANGUAGES) {
            assertTrue(PushWords.trouble(language, "nimbus-checkout").contains("nimbus-checkout"), language)
            assertTrue(PushWords.permission(language, "rm -rf build").contains("rm -rf build"), language)
        }
    }
}
