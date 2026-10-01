package io.github.crmapache.amazingclaudecode.usage

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/**
 * The features the anonymous usage report may name, and what counts as a use of each.
 *
 * Every id is decided here, by name, and nothing else is ever counted: an id this file does not know is
 * dropped at the door (see [isKnown]), so neither the panel nor a future bug can put a word of their own
 * choosing into the book - let alone into a report. The usage service holds the wording for each id and
 * its test reads this file, so a feature added here without a label there fails that build.
 *
 * Most uses are seen arriving: nearly everything a person does in the panel reaches the IDE as a message,
 * and [ofMessage] names the feature a message stands for. Only messages a person's own press sends are
 * mapped - the ones the panel sends by itself (the lists it refreshes, the drafts it saves, the tab it
 * reports as shown) would count a feature nobody used. What the panel does without the IDE hearing of it
 * (a screen of the menu opened, a message pinned) it reports itself, through the `stat` message, and only
 * with an id from [PANEL].
 */
internal object UsageFeatures {

    /** The features with a name of their own - every id the service words one by one. */
    val NAMED: Set<String> = setOf(
        "new_tab",
        "fork",
        "tab_rename",
        "tab_reorder",
        "queue",
        "queue_edit",
        "queue_reorder",
        "stop",
        "stop_task",
        "bash_mode",
        "improve_prompt",
        "model_switch",
        "effort_switch",
        "mode_switch",
        "plan_decision",
        "ask_answer",
        "subagent_window",
        "message_reuse",
        "pin",
        "open_in_editor",
        "send_selection",
        "attach_file",
        "paste_file",
        "copy",
        "history_resume",
        "search",
        "search_ai",
        "voice",
        "remote_enable",
        "remote_pairing",
        "scenarios_tab",
        "scenario_run",
        "scenario_save",
        "scenario_author",
        "scenario_schedule",
        "scenario_queue",
        "scenario_answer",
        "statistics_tab",
        "stats_share",
        "mcp_manage",
        "plugins_manage",
        "account_add",
        "account_switch",
        "design_login",
        "feedback_sent",
    )

    /**
     * The screens of the side menu, counted as "screen:<name>" when one is opened. The same list as the
     * MenuScreen union in SideMenu.tsx - a test reads that file and fails when the two part ways.
     */
    val SCREENS: Set<String> = setOf(
        "menu",
        "history",
        "mcp",
        "plugins",
        "settings",
        "appearance",
        "sounds",
        "calmColors",
        "indicators",
        "remote",
        "remoteAbout",
        "accounts",
        "newChat",
        "restoreTabs",
        "shareEditor",
        "newChatModel",
        "newChatEffort",
        "newChatMode",
        "composerLayout",
        "pasteCollapse",
        "sendKey",
        "settingSources",
        "claudeConfig",
        "improvePrompt",
        "voice",
        "voiceLanguage",
        "voiceDevice",
        "customModels",
        "language",
        "feedback",
        "feedbackLog",
        "usageStats",
        "usageStatsReport",
    )

    /** The settings, counted as "setting:<name>" when one is changed. */
    val SETTINGS: Set<String> = setOf(
        "theme",
        "text_size",
        "language",
        "layout",
        "send_key",
        "paste_collapse",
        "calm_colors",
        "indicators",
        "sounds",
        "share_editor",
        "restore_tabs",
        "improve_prompt",
        "custom_models",
        "new_chat",
        "claude_config",
        "setting_sources",
        "executable",
        "voice",
        "relay",
    )

    /**
     * What a person does from a paired phone, among the messages a phone may send at all (see
     * RemoteCommands.ALLOWED) - counted into DayRecord.phoneActions. Every allowed message is in exactly one
     * of this list and [PHONE_BACKGROUND], and UsageFeaturesTest fails until a new one is placed.
     */
    val PHONE_ACTIONS: Set<String> = setOf(
        "prompt",
        "queuePrompt",
        "unqueuePrompt",
        "reorderQueue",
        "permissionDecision",
        "planDecision",
        "askAnswer",
        "askDismiss",
        "stop",
        "kill",
        "stopTask",
        "resumeSession",
        "search",
        "searchAi",
        "newSession",
        "voiceToken",
        "setModel",
        "setEffort",
        "mcpReconnect",
        "mcpAuthenticate",
        "mcpAdd",
        "mcpRemove",
        "scenarioAnswer",
        "scenarioPause",
        "scenarioResume",
        "scenarioContinue",
        "scenarioStop",
        "scenarioSave",
        "scenarioDelete",
        "scenarioDuplicate",
        "scenarioPlace",
        "scenarioDraft",
        "scenarioDraftCancel",
        "scenarioRun",
        "scenarioSchedule",
        "scenarioUnschedule",
        "scenarioRunDelete",
        "scenarioQueue",
        "scenarioQueueRemove",
        "scenarioQueueMove",
        "scenarioQueueMode",
        "scenarioQueueGoOn",
        "scenarioQueueClear",
        "accountUse",
        "accountRename",
        "accountForget",
        "accountLogout",
    )

    /**
     * What a phone sends by itself: catching up on joining, refreshing a list or a page, reading a run's
     * record, and the name it guesses for a tab after its first message. None of it is somebody pressing
     * anything, and counted it would make every phone left on a screen look busy.
     */
    val PHONE_BACKGROUND: Set<String> = setOf(
        "ready",
        "history",
        "historyPage",
        "searchCancel",
        "renameSession",
        "mcpList",
        "pluginList",
        "marketplaceList",
        "scenarios",
        "scenarioFetch",
        "scenarioOpen",
        "scenarioLog",
        "accountList",
    )

    fun isPhoneAction(type: String): Boolean = type in PHONE_ACTIONS

    /** What the panel may report through `stat` - the uses the IDE cannot see arriving. */
    private val PANEL: Set<String> = setOf("pin", "message_reuse", "statistics_tab", "scenarios_tab")

    fun isKnown(id: String): Boolean = when {
        id.startsWith(SCREEN) -> id.removePrefix(SCREEN) in SCREENS
        id.startsWith(SETTING) -> id.removePrefix(SETTING) in SETTINGS
        else -> id in NAMED
    }

    /** Whether the panel may report this one itself. */
    fun isPanelFeature(id: String): Boolean = id in PANEL || (id.startsWith(SCREEN) && isKnown(id))

    /**
     * The feature a message from a person's own screen stands for, or null for one that stands for none.
     *
     * The payload is read for two things only: which kind of tab was asked for, and whether remote access
     * was switched on rather than off. Never a word of what was typed.
     */
    fun ofMessage(type: String, payload: JsonObject): String? = when (type) {
        "newSession" -> if (payload.text("kind") == "branch") "fork" else "new_tab"
        "nameSession" -> "tab_rename"
        "reorderTabs", "reorderGroups" -> "tab_reorder"
        "queuePrompt" -> "queue"
        "takeQueued" -> "queue_edit"
        "reorderQueue" -> "queue_reorder"
        "stop" -> "stop"
        "stopTask" -> "stop_task"
        "bash" -> "bash_mode"
        "improvePrompt" -> "improve_prompt"
        "setModel" -> "model_switch"
        "setEffort" -> "effort_switch"
        "setMode" -> "mode_switch"
        "planDecision" -> "plan_decision"
        "askAnswer" -> "ask_answer"
        "agentTranscript" -> "subagent_window"
        "openFile" -> "open_in_editor"
        "clipboardWrite" -> "copy"
        "pick", "dropped" -> "attach_file"
        "savePastedFile" -> "paste_file"
        "resumeSession" -> "history_resume"
        "search" -> "search"
        "searchAi" -> "search_ai"
        "voiceStart" -> "voice"
        "setRemoteEnabled" -> if ((payload["enabled"] as? JsonPrimitive)?.booleanOrNull == true) "remote_enable" else null
        "startPairing" -> "remote_pairing"
        "scenarioRun" -> "scenario_run"
        "scenarioSave" -> "scenario_save"
        "scenarioDraft" -> "scenario_author"
        "scenarioSchedule" -> "scenario_schedule"
        "scenarioQueue" -> "scenario_queue"
        "scenarioAnswer" -> "scenario_answer"
        "saveImage" -> "stats_share"
        "mcpAdd", "mcpRemove", "mcpReconnect", "mcpAuthenticate" -> "mcp_manage"
        "pluginInstall", "pluginUninstall", "pluginEnable", "pluginDisable", "marketplaceAdd", "marketplaceRemove" ->
            "plugins_manage"
        "accountAdd" -> "account_add"
        "accountUse" -> "account_switch"
        "designLogin" -> "design_login"
        "feedbackSend" -> "feedback_sent"
        else -> settingOf(type)?.let { SETTING + it }
    }

    private fun settingOf(type: String): String? = when (type) {
        "setTheme" -> "theme"
        "setTextSize" -> "text_size"
        "setLanguage" -> "language"
        "setComposerLayout" -> "layout"
        "setSendKey" -> "send_key"
        "setPasteCollapse" -> "paste_collapse"
        "setCalmColors" -> "calm_colors"
        "setHiddenIndicators" -> "indicators"
        "soundSettings" -> "sounds"
        "setShareEditor" -> "share_editor"
        "setRestoreTabs" -> "restore_tabs"
        "setImproveInstructions" -> "improve_prompt"
        "setCustomModels" -> "custom_models"
        "setDefaultModel", "setDefaultEffort", "setDefaultMode" -> "new_chat"
        "setClaudeConfig" -> "claude_config"
        "setSettingSources" -> "setting_sources"
        "setExecutablePath" -> "executable"
        "voiceEnabled", "voiceKey", "voiceLanguage", "voiceDevice", "voiceCaptureHotkey", "voiceClearHotkey" -> "voice"
        "setRelayUrl" -> "relay"
        else -> null
    }

    private fun JsonObject.text(name: String): String = (this[name] as? JsonPrimitive)?.contentOrNull.orEmpty()

    const val SCREEN = "screen:"

    const val SETTING = "setting:"
}
