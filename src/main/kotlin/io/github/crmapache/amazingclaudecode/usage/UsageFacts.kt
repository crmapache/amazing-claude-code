package io.github.crmapache.amazingclaudecode.usage

import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.util.SystemInfo
import io.github.crmapache.amazingclaudecode.claude.ClaudePreferences
import io.github.crmapache.amazingclaudecode.claude.IdeLanguage
import io.github.crmapache.amazingclaudecode.claude.PermissionModes
import io.github.crmapache.amazingclaudecode.claude.ProjectCatalog
import io.github.crmapache.amazingclaudecode.claude.accounts.ClaudeAccounts
import io.github.crmapache.amazingclaudecode.feedback.FeedbackEnvironment
import io.github.crmapache.amazingclaudecode.remote.RemoteState

/**
 * The two parts of a report that are about the machine rather than about a day: what it runs, and how the
 * panel is set up on it.
 *
 * Every value is either a version number, one of a handful of words the plugin itself uses, a count or a
 * yes-or-no. Where a setting holds something a person typed - a model's name, the improve-prompt text, a
 * relay's address - what travels is only whether it is set.
 */
internal object UsageFacts {

    fun environment(): UsageReport.Environment {
        val info = runCatching { ApplicationInfo.getInstance() }.getOrNull()
        return UsageReport.Environment(
            plugin = ProjectCatalog.pluginVersion.orEmpty(),
            ide = info?.build?.productCode.orEmpty(),
            ideVersion = info?.let { "${it.majorVersion}.${it.minorVersionMainPart}" }.orEmpty(),
            os = when {
                SystemInfo.isMac -> "mac"
                SystemInfo.isWindows -> "windows"
                SystemInfo.isLinux -> "linux"
                else -> "other"
            },
            // The JVM's own word for it rather than the platform's CpuArch, which is marked as low-level access
            // the verifier asks about - and the two words it can say here are all this needs.
            arch = when (System.getProperty("os.arch").orEmpty().lowercase()) {
                "aarch64", "arm64" -> "arm64"
                "amd64", "x86_64" -> "x64"
                else -> "other"
            },
            cli = FeedbackEnvironment.cliNumber(),
            // "zh-Hans" and "pt-BR" travel as "zh" and "pt": the service knows the ten by their first part.
            lang = IdeLanguage.inForce(ClaudePreferences.language).substringBefore('-'),
        )
    }

    /** The panel's settings, by the short names the dashboard knows them by (see SETTING_TITLES there). */
    fun settings(): Map<String, Any> {
        val preferences = ClaudePreferences
        return linkedMapOf(
            "remote" to preferences.remoteEnabled,
            "voice" to preferences.voiceEnabled,
            "layout" to preferences.composerLayout.takeIf { it in LAYOUTS }.orEmpty().ifEmpty { "bottom" },
            "sendKey" to if (preferences.sendKey == "modEnter") "modEnter" else "enter",
            "restoreTabs" to preferences.restoreTabs,
            "shareEditor" to preferences.shareEditor,
            "calmColors" to preferences.gaugeVivid,
            "hiddenIndicators" to preferences.hiddenIndicators.size,
            "customModels" to preferences.customModels.size,
            "improveCustom" to preferences.improveInstructions.isNotBlank(),
            "theme" to preferences.theme.takeIf { it == ClaudePreferences.THEME_DARK || it == ClaudePreferences.THEME_LIGHT }.orEmpty().ifEmpty { "auto" },
            "textSize" to (preferences.textSize != ClaudePreferences.TEXT_SIZE_FOLLOW),
            "language" to preferences.language.isNotBlank(),
            "pasteCollapse" to preferences.pasteCollapse.takeIf { it.isNotEmpty() && it.all(Char::isDigit) }.orEmpty().ifEmpty { "default" },
            "accounts" to (runCatching { ClaudeAccounts.getInstance().list().size }.getOrNull() ?: 0),
            "soundsMuted" to preferences.mutedSounds.size,
            "newChatModel" to preferences.newTabModel.isNotBlank(),
            "newChatEffort" to preferences.newTabEffort.isNotBlank(),
            "newChatMode" to PermissionModes.normalize(preferences.mode).takeIf { it in PermissionModes.KNOWN }.orEmpty().ifEmpty { "default" },
            "pairedDevices" to (runCatching { RemoteState.getInstance().devices().size }.getOrNull() ?: 0),
        )
    }

    private val LAYOUTS = setOf("left", "bottom", "right", "compact")
}
