package io.github.crmapache.amazingclaudecode.claude

/**
 * One and the same model, whatever it happens to be called this time.
 *
 * Three names for one model travel through the plugin at once and none of them match as strings: what a
 * person picks and the CLI is launched with (`opus`, `opus[1m]`), what the catalogue expands that into
 * (`claude-opus-5`, sometimes with a window mark), and the signature under an answer in a transcript
 * (`claude-opus-5`, and for some families with a build date - `claude-haiku-4-5-20251001`).
 *
 * The panel has had this rule from the start (`modelKey` in catalog.ts) because the bottom line kept
 * renaming itself; the IDE side had none, and compared strings. That is what made a conversation opened
 * from the history come up on a model nobody chose: its transcript signs `claude-opus-5`, the account's
 * catalogue holds `opus`, the two do not match, and the model was clamped away as one the account cannot
 * run (see ClaudeAccounts.canRun). It arrived on the default instead - and the panel, seeing the replay
 * say Opus and the live process say Sonnet, announced it as a swap by Claude Code, which is the one
 * explanation that was not true.
 *
 * This is a `Frame.kt`/`frame.ts` case: the same rule on both sides, held by a test on each of them, and
 * changed on both or on neither.
 */
internal object ModelNames {

    /**
     * The comparable key: the family and the generation, with everything else dropped.
     *
     * A window mark says nothing about which model this is - `opus[1m]` is Opus - and a build date says
     * nothing to anyone. What is left tells models genuinely apart.
     */
    fun key(model: String): String {
        val bare = model.lowercase().substringBefore('[')
        val family = FAMILIES.firstOrNull { bare.contains(it) } ?: bare.removePrefix("claude-")
        val version = versionOf(bare)

        return if (version.isEmpty()) family else "$family-$version"
    }

    /** Two names for one and the same model. */
    fun same(one: String, other: String): Boolean = key(one) == key(other)

    /**
     * Whether a set of names holds this model under any of its names.
     *
     * The plain family name and the full identifier are both accepted for each other: a catalogue that
     * knows `opus` and a transcript that says `claude-opus-5` are talking about the same thing, and the
     * generation is only meaningful when both sides name one.
     */
    fun holds(names: Collection<String>, model: String): Boolean {
        val wanted = key(model)

        return names.any { name ->
            val known = key(name)
            known == wanted || known == family(wanted) || family(known) == wanted
        }
    }

    private fun family(key: String): String = key.substringBefore('-')

    /** `claude-opus-4-8` is 4.8, `claude-haiku-4-5-20251001` is 4.5 - the dated tail is not a version. */
    private fun versionOf(model: String): String =
        model.split('-').filter { part -> part.length < 5 && part.isNotEmpty() && part.all(Char::isDigit) }.joinToString(".")

    /** Longest first: `opusplan` contains `opus`, and reading it as Opus would be another model. */
    private val FAMILIES = listOf("fable", "opusplan", "opus", "sonnet", "haiku")
}
