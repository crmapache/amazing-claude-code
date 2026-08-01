package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ClaudeLaunchTest {

    private fun arguments(
        settingsJson: String? = null,
        model: String = "",
        effort: String = "",
        permissionMode: String? = null,
        conversationId: String? = null,
        forkFrom: String? = null,
        allowBypassSwitch: Boolean = true,
    ) = ClaudeLaunch.arguments(
        settingsJson = settingsJson,
        model = model,
        effort = effort,
        permissionMode = permissionMode,
        conversationId = conversationId,
        forkFrom = forkFrom,
        allowBypassSwitch = allowBypassSwitch,
    )

    // Без этого ключа CLI отказывается переключаться в «без вопросов» посреди
    // разговора — а именно этим переключением заканчивается одобрение плана.
    @Test
    fun `разрешение на переход в bypass уходит при запуске`() {
        assertTrue(ClaudeLaunch.ALLOW_BYPASS_FLAG in arguments(permissionMode = "plan"))
    }

    // Неизвестный ключ CLI не игнорирует — он просто не стартует.
    @Test
    fun `старый CLI, не знающий ключа, получает командную строку без него`() {
        assertFalse(ClaudeLaunch.ALLOW_BYPASS_FLAG in arguments(allowBypassSwitch = false))
    }

    // Сам по себе ключ ничего не разрешает: разговор поднимается в том режиме,
    // который выбран в панели.
    @Test
    fun `режим передаётся всегда и под именем, понятным CLI`() {
        val plan = arguments(permissionMode = "plan")
        assertEquals("plan", plan[plan.indexOf("--permission-mode") + 1])

        // «default» — как режим звала панель раньше; CLI знает его как «manual».
        val ask = arguments(permissionMode = "default")
        assertEquals(PermissionModes.ASK, ask[ask.indexOf("--permission-mode") + 1])
    }

    @Test
    fun `поток событий запрашивается так, как того требует CLI`() {
        val args = arguments()

        assertTrue(args.containsAll(listOf("--print", "--verbose", "--include-partial-messages")))
        assertEquals("stream-json", args[args.indexOf("--output-format") + 1])
        assertEquals("stream-json", args[args.indexOf("--input-format") + 1])
    }

    @Test
    fun `продолжение разговора и ветвление не путаются`() {
        val resumed = arguments(conversationId = "разговор-1", forkFrom = "родитель-1")
        assertEquals("разговор-1", resumed[resumed.indexOf("--resume") + 1])
        assertFalse("--fork-session" in resumed)

        val forked = arguments(forkFrom = "родитель-1")
        assertEquals("родитель-1", forked[forked.indexOf("--resume") + 1])
        assertTrue("--fork-session" in forked)
    }

    @Test
    fun `настройки, модель и усилие уходят только когда они есть`() {
        val bare = arguments()
        assertFalse("--settings" in bare)
        assertFalse("--model" in bare)
        assertFalse("--effort" in bare)

        val full = arguments(settingsJson = "{}", model = "opus", effort = "xhigh")
        assertEquals("{}", full[full.indexOf("--settings") + 1])
        assertEquals("opus", full[full.indexOf("--model") + 1])
        assertEquals("xhigh", full[full.indexOf("--effort") + 1])
    }
}
