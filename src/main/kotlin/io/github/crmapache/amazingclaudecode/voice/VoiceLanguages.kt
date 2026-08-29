package io.github.crmapache.amazingclaudecode.voice

/**
 * The languages nova-3 will listen in - values for the `language` parameter, nothing else.
 *
 * Written out here rather than asked for at runtime: Deepgram has no endpoint that lists them, and a
 * screen whose list depends on the network is a screen that is empty exactly when somebody is setting
 * the feature up for the first time.
 *
 * Each entry carries its own name as well as the English one, and both go to the panel untranslated -
 * a language names itself the same way whatever the interface is set to, and "Русский" is what somebody
 * looking for Russian is scanning for.
 */
internal object VoiceLanguages {

    data class Language(val code: String, val native: String, val english: String)

    /** What a fresh install listens in until somebody says otherwise. */
    const val DEFAULT = "en"

    /**
     * The multilingual option, which follows speech that changes language mid-sentence across ten of
     * them.
     *
     * It is offered, and it is offered with a warning, because measurement disagrees with the idea:
     * next door in notastream, on identical clips, `multi` lost to a named language on single-language
     * speech (0.996 against 0.999) and lost again on mixed speech - the case it exists for - mishearing
     * "git rebase" as "gitrobase" where `ru` got it right. So it stays available for the person who
     * genuinely mixes two languages in one sentence, and the screen says plainly that it is worse for
     * everybody else.
     */
    val MULTI = Language(DeepgramStream.MULTILINGUAL, "Multilingual", "Follows a language change mid-sentence")

    val ALL: List<Language> = listOf(
        Language("ar", "العربية", "Arabic"),
        Language("be", "Беларуская", "Belarusian"),
        Language("bg", "Български", "Bulgarian"),
        Language("bn", "বাংলা", "Bengali"),
        Language("bs", "Bosanski", "Bosnian"),
        Language("ca", "Català", "Catalan"),
        Language("cs", "Čeština", "Czech"),
        Language("da", "Dansk", "Danish"),
        Language("de", "Deutsch", "German"),
        Language("de-CH", "Schweizerdeutsch", "German (Switzerland)"),
        Language("el", "Ελληνικά", "Greek"),
        Language("en", "English", "English"),
        Language("en-AU", "English (Australia)", "English (Australia)"),
        Language("en-GB", "English (UK)", "English (UK)"),
        Language("en-IN", "English (India)", "English (India)"),
        Language("en-NZ", "English (New Zealand)", "English (New Zealand)"),
        Language("en-US", "English (US)", "English (US)"),
        Language("es", "Español", "Spanish"),
        Language("es-419", "Español (Latinoamérica)", "Spanish (Latin America)"),
        Language("et", "Eesti", "Estonian"),
        Language("fa", "فارسی", "Persian"),
        Language("fi", "Suomi", "Finnish"),
        Language("fr", "Français", "French"),
        Language("fr-CA", "Français (Canada)", "French (Canada)"),
        Language("gu", "ગુજરાતી", "Gujarati"),
        Language("he", "עברית", "Hebrew"),
        Language("hi", "हिन्दी", "Hindi"),
        Language("hr", "Hrvatski", "Croatian"),
        Language("hu", "Magyar", "Hungarian"),
        Language("id", "Bahasa Indonesia", "Indonesian"),
        Language("it", "Italiano", "Italian"),
        Language("ja", "日本語", "Japanese"),
        Language("kn", "ಕನ್ನಡ", "Kannada"),
        Language("ko", "한국어", "Korean"),
        Language("lt", "Lietuvių", "Lithuanian"),
        Language("lv", "Latviešu", "Latvian"),
        Language("mk", "Македонски", "Macedonian"),
        Language("mr", "मराठी", "Marathi"),
        Language("ms", "Bahasa Melayu", "Malay"),
        Language("nl", "Nederlands", "Dutch"),
        Language("nl-BE", "Vlaams", "Flemish"),
        Language("no", "Norsk", "Norwegian"),
        Language("pl", "Polski", "Polish"),
        Language("pt", "Português", "Portuguese"),
        Language("pt-BR", "Português (Brasil)", "Portuguese (Brazil)"),
        Language("pt-PT", "Português (Portugal)", "Portuguese (Portugal)"),
        Language("ro", "Română", "Romanian"),
        Language("ru", "Русский", "Russian"),
        Language("sk", "Slovenčina", "Slovak"),
        Language("sl", "Slovenščina", "Slovenian"),
        Language("sr", "Српски", "Serbian"),
        Language("sv", "Svenska", "Swedish"),
        Language("ta", "தமிழ்", "Tamil"),
        Language("te", "తెలుగు", "Telugu"),
        Language("th", "ไทย", "Thai"),
        Language("tl", "Tagalog", "Tagalog"),
        Language("tr", "Türkçe", "Turkish"),
        Language("uk", "Українська", "Ukrainian"),
        Language("ur", "اردو", "Urdu"),
        Language("vi", "Tiếng Việt", "Vietnamese"),
        Language("zh", "中文", "Chinese (Simplified)"),
        Language("zh-HK", "中文 (香港)", "Chinese (Hong Kong)"),
        Language("zh-TW", "中文 (繁體)", "Chinese (Traditional)"),
    )

    /**
     * Guards against a code nova-3 would refuse - a settings file edited by hand, or a language dropped
     * from the model between releases. A rejected code would fail the whole dictation at the handshake,
     * which is the worst possible moment to discover a typo.
     */
    fun supported(code: String): Boolean = code == MULTI.code || ALL.any { it.code == code }

    /** The code in force: the saved one while it is still a real one, English otherwise. */
    fun sanitize(code: String): String = if (supported(code)) code else DEFAULT
}
