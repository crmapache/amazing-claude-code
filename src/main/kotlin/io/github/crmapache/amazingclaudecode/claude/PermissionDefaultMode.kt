package io.github.crmapache.amazingclaudecode.claude

/**
 * Режим разрешений, с которого начинает разговор впервые открытая панель.
 *
 * Берётся оттуда же, откуда его берёт терминальный Claude Code, —
 * `permissions.defaultMode` в настройках (см. [ClaudeSettings]). Иначе панель и
 * терминал на одной машине начинают по-разному: человек однажды выбрал себе
 * умолчание, терминал его слушается, а панель молча открывалась в «Ask».
 *
 * Правила повторяют CLI, и оба — не придирка:
 *
 * - `auto` принимается только от политики организации и личных настроек. Настройки
 *   проекта лежат в самом репозитории, и режим, в котором вопросы решает
 *   классификатор, туда мог бы положить кто угодно с правом на правку.
 * - `bypassPermissions` не принимается, если режим запрещён настройками: CLI такой
 *   умолчание всё равно отбросит, а панель осталась бы показывать режим, которого
 *   у разговора нет.
 *
 * Незнакомое имя (чужая сборка, опечатка) тоже отбрасывается: с ним CLI просто не
 * запустится.
 */
internal object PermissionDefaultMode {

    fun of(projectDirectory: String?): String = of(
        sources = ClaudeSettings.sources(projectDirectory),
        // Только настройки: спрашивать сам CLI тут нельзя — это запуск процесса, а
        // умолчание нужно уже в первую отрисовку панели.
        bypassAllowed = PermissionBypass.allowedBySettings(projectDirectory),
    )

    fun of(sources: List<ClaudeSettings.Source>, bypassAllowed: Boolean): String {
        val (layer, mode) = sources
            .firstNotNullOfOrNull { source ->
                ClaudeSettings.permission(source.file, DEFAULT_MODE)
                    .takeIf { it.isNotEmpty() }
                    ?.let { source.layer to PermissionModes.normalize(it) }
            }
            ?: return PermissionModes.ASK

        return when {
            mode !in PermissionModes.KNOWN -> PermissionModes.ASK
            mode == PermissionModes.AUTO && layer !in TRUSTED_WITH_AUTO -> PermissionModes.ASK
            mode == PermissionModes.BYPASS && !bypassAllowed -> PermissionModes.ASK
            else -> mode
        }
    }

    /** Кому CLI верит в вопросе про `auto` — всё, что не лежит в репозитории. */
    private val TRUSTED_WITH_AUTO = setOf(ClaudeSettings.Layer.POLICY, ClaudeSettings.Layer.USER)

    private const val DEFAULT_MODE = "defaultMode"
}
