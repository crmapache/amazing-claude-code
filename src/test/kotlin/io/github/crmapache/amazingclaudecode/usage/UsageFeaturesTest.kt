package io.github.crmapache.amazingclaudecode.usage

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class UsageFeaturesTest {

    private fun ofMessage(type: String, vararg fields: Pair<String, Any>) =
        UsageFeatures.ofMessage(
            type,
            buildJsonObject {
                put("type", type)
                for ((name, value) in fields) {
                    when (value) {
                        is Boolean -> put(name, value)
                        else -> put(name, value.toString())
                    }
                }
            },
        )

    @Test
    fun `a press is named by the feature it stands for`() {
        assertEquals("fork", ofMessage("newSession", "kind" to "branch"))
        assertEquals("new_tab", ofMessage("newSession", "kind" to "main"))
        assertEquals("voice", ofMessage("voiceStart"))
        assertEquals("improve_prompt", ofMessage("improvePrompt", "draft" to "whatever was typed"))
        assertEquals("setting:theme", ofMessage("setTheme", "theme" to "dark"))
        assertEquals("setting:new_chat", ofMessage("setDefaultModel", "model" to "opus"))
        assertEquals("plugins_manage", ofMessage("marketplaceAdd"))
    }

    @Test
    fun `switching remote access off is not a use of it`() {
        assertEquals("remote_enable", ofMessage("setRemoteEnabled", "enabled" to true))
        assertNull(ofMessage("setRemoteEnabled", "enabled" to false))
    }

    @Test
    fun `what the panel sends by itself counts as nothing`() {
        for (type in listOf("ready", "saveDraft", "tabShown", "history", "mcpList", "pluginList", "accountList", "scenarios", "trace", "cursor", "stat", "prompt")) {
            assertNull(ofMessage(type), "$type is sent without anybody pressing anything")
        }
    }

    @Test
    fun `every feature a message can name is one the book accepts`() {
        val types = listOf(
            "newSession", "nameSession", "reorderTabs", "queuePrompt", "takeQueued", "reorderQueue", "stop",
            "stopTask", "bash", "improvePrompt", "setModel", "setEffort", "setMode", "planDecision", "askAnswer",
            "agentTranscript", "openFile", "clipboardWrite", "pick", "savePastedFile", "resumeSession", "search",
            "searchAi", "voiceStart", "startPairing", "scenarioRun", "scenarioSave", "scenarioDraft",
            "scenarioSchedule", "scenarioQueue", "scenarioAnswer", "saveImage", "mcpAdd", "pluginInstall",
            "accountAdd", "accountUse", "designLogin", "feedbackSend", "setTheme", "setTextSize", "setLanguage",
            "setComposerLayout", "setSendKey", "setPasteCollapse", "setCalmColors", "setHiddenIndicators",
            "soundSettings", "setShareEditor", "setRestoreTabs", "setImproveInstructions", "setCustomModels",
            "setDefaultModel", "setClaudeConfig", "setSettingSources", "setExecutablePath", "voiceEnabled",
            "setRelayUrl",
        )
        for (type in types) {
            val id = ofMessage(type, "enabled" to true)
            assertTrue(id != null && UsageFeatures.isKnown(id), "$type names \"$id\", which the book would drop")
        }
    }

    @Test
    fun `the panel may name only what the IDE cannot see arriving`() {
        assertTrue(UsageFeatures.isPanelFeature("pin"))
        assertTrue(UsageFeatures.isPanelFeature("screen:history"))
        // Counted at the IDE's door already - the panel naming it too would count it twice.
        assertFalse(UsageFeatures.isPanelFeature("voice"))
        assertFalse(UsageFeatures.isPanelFeature("screen:nonsense"))
        assertFalse(UsageFeatures.isPanelFeature("anything the panel likes"))
    }

    /** The screens are the side menu's own list; a screen added there and not here would not be counted. */
    @Test
    fun `the screens are the side menu's screens`() {
        val menu = File("webview/src/components/SideMenu.tsx")
        assertTrue(menu.exists(), "SideMenu.tsx not found at ${menu.absolutePath}")

        val union = menu.readText().substringAfter("export type MenuScreen =").substringBefore("\n\n")
        val screens = Regex("""'([a-zA-Z]+)'""").findAll(union).map { it.groupValues[1] }.toSet()

        assertTrue(screens.isNotEmpty(), "the MenuScreen union was not found")
        assertEquals(screens, UsageFeatures.SCREENS)
    }
}
