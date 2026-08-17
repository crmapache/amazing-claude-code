package io.github.crmapache.amazingclaudecode.claude

/**
 * Почему у человека вообще спрашивают про этот вызов — и стоит ли предлагать ему
 * «разрешать всегда».
 *
 * Разрешения приходят не только из режима. Их поднимают проверки безопасности,
 * правила `ask` из настроек, хуки и классификатор режима `auto` — и в режимах, где
 * вопросов не ждут вовсе («Bypass», «Auto»), остаются как раз они. Без объяснения
 * такой вопрос выглядит необъяснимой приставучестью: человек выбрал «не спрашивать»,
 * а панель всё равно спрашивает.
 *
 * Отдельно от [PermissionPrompt] потому, что тот подписывает сам вызов («хочет
 * запустить команду»), а это — строка о том, кто вопрос поднял.
 */
internal object PermissionReason {

    /** Строка для карточки. Пусто — объяснять нечего, и лишней строки быть не должно. */
    fun text(request: PermissionChannel.ToolPermission): String = when (request.reasonType) {
        // Обычное «режим требует спрашивать» — в карточке и так подписан режим.
        MODE, "" -> ""
        // Про песочницу CLI молчит и в терминале: она подменяет решение, а не
        // объясняет его.
        SANDBOX -> ""
        RULE -> request.matchedAskRule?.let(::ruleText) ?: request.reason
        HOOK -> explained("A hook asked to confirm this", request.reason)
        CLASSIFIER -> explained("The auto-mode classifier asked to confirm this", request.reason)
        // safetyCheck, subcommandResults, workingDir, asyncAgent, other: CLI уже
        // сформулировал это для человека — пересказывать своими словами незачем.
        else -> request.reason
    }

    /**
     * Предлагать ли «разрешать всегда».
     *
     * Правило помогает не всегда, и терминал в таких случаях третий пункт просто
     * не показывает. Панель предлагала его везде: человек нажимал, правило честно
     * записывалось в настройки — и следующий такой же вызов снова упирался в
     * вопрос. Два случая, когда правила не будет:
     *
     * - CLI прямо просит не предлагать: правило вышло бы шире самого вопроса.
     * - Проверка безопасности требует человека ([PermissionChannel.ToolPermission.classifierApprovable]),
     *   а готового правила CLI не предложил. Таковы опасные удаления: их не
     *   отменяет ни правило, ни режим «без вопросов».
     */
    fun rememberable(request: PermissionChannel.ToolPermission): Boolean = when {
        request.suppressAlwaysAllow -> false
        request.suggestions.isEmpty() && request.classifierApprovable == false -> false
        else -> true
    }

    private fun ruleText(rule: PermissionChannel.AskRule): String {
        val target = rule.content?.let { "${rule.toolName}($it)" } ?: rule.toolName
        val source = SOURCES[rule.source]

        return if (source == null) "An ask rule matched: $target" else "An ask rule in $source matched: $target"
    }

    private fun explained(lead: String, reason: String): String =
        if (reason.isEmpty()) "$lead." else "$lead: $reason"

    /**
     * Как называть слои настроек — теми же словами, какими их называет сам CLI:
     * человеку идти правило искать, и название должно совпадать с тем, что он
     * прочитает в его сообщениях.
     */
    private val SOURCES = mapOf(
        "userSettings" to "user settings",
        "projectSettings" to "shared project settings",
        "localSettings" to "project local settings",
        "flagSettings" to "command line arguments",
        "policySettings" to "enterprise managed settings",
        "cliArg" to "a CLI argument",
        "command" to "command configuration",
        "session" to "this session",
        "mcpServerPolicy" to "MCP server policy",
    )

    private const val MODE = "mode"
    private const val SANDBOX = "sandboxOverride"
    private const val RULE = "rule"
    private const val HOOK = "hook"
    private const val CLASSIFIER = "classifier"
}
