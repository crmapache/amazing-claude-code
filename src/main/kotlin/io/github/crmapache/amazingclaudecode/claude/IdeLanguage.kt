package io.github.crmapache.amazingclaudecode.claude

import com.intellij.DynamicBundle
import java.util.Locale

/**
 * What language this IDE is set to, and which of the panel's own languages that comes out as.
 *
 * The panel's language setting is empty by default and means "whatever the IDE speaks" - so that a
 * person working in a Chinese IDE is spoken to in Chinese without first having to find a switch. That
 * promise is only worth anything if this reads the same thing the IDE's own menus read.
 *
 * [DynamicBundle.getLocale] is that thing: it is the locale a JetBrains language pack installs, which is
 * what actually changes the IDE's own words. The operating system's locale is only a fallback, and a
 * distant second on purpose - a Russian Windows running an English IDE is a person who chose English.
 */
internal object IdeLanguage {

    /**
     * The ones the panel has dictionaries for (see webview/src/i18n/locales.ts).
     *
     * Kept here as well as there because both sides answer the same question and neither can ask the
     * other: this side decides what a push notification says while the phone is asleep, and that side
     * decides what the screen says. Another language means an edit in both, and
     * [IdeLanguageTest] fails until the lists agree again.
     */
    val SUPPORTED = listOf("en", "zh-Hans", "ru", "uk", "es", "pt-BR", "de", "fr", "ja", "ko")

    const val DEFAULT = "en"

    /** The IDE's own locale, as a tag - "zh-Hans", "de", "pt-BR". */
    fun current(): String = resolve(tagOf(DynamicBundle.getLocale()))

    /**
     * The language actually in force: the person's explicit choice, or the IDE's when there is none.
     *
     * The same formula as `activeLocale` in the panel. Two copies rather than one because a push
     * notification is written while nothing of the panel is running.
     */
    fun inForce(chosen: String): String = if (chosen.isNotBlank()) resolve(chosen) else current()

    /**
     * A tag from anywhere brought to one of the ten.
     *
     * Read from the left, because the region only matters where we have two dictionaries to tell apart
     * and we have none: one Portuguese, one Chinese. Traditional Chinese lands on the Simplified
     * dictionary rather than on English for the same reason it does in the panel - the two scripts are
     * far closer to one another than either is to a language the reader may not have at all.
     */
    fun resolve(tag: String?): String {
        val normalised = tag.orEmpty().trim().lowercase(Locale.ROOT).replace('_', '-')
        if (normalised.isEmpty()) return DEFAULT

        val primary = normalised.substringBefore('-')

        if (primary == "zh") return "zh-Hans"
        if (primary == "pt") return "pt-BR"

        SUPPORTED.firstOrNull { it.lowercase(Locale.ROOT) == normalised }?.let { return it }

        return SUPPORTED.firstOrNull { it.lowercase(Locale.ROOT).substringBefore('-') == primary } ?: DEFAULT
    }

    private fun tagOf(locale: Locale?): String = locale?.toLanguageTag().orEmpty()
}
