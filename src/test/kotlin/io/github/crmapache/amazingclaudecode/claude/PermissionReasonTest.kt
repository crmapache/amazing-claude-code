package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonArray

class PermissionReasonTest {

    private fun request(
        reason: String = "",
        reasonType: String = "",
        classifierApprovable: Boolean? = null,
        suppressAlwaysAllow: Boolean = false,
        matchedAskRule: PermissionChannel.AskRule? = null,
        suggestions: JsonArray = JsonArray(emptyList()),
    ) = PermissionChannel.ToolPermission(
        requestId = "запрос",
        toolName = "Bash",
        toolUseId = "toolu_1",
        input = kotlinx.serialization.json.JsonObject(emptyMap()),
        requiresUserInteraction = false,
        suggestions = suggestions,
        reason = reason,
        reasonType = reasonType,
        classifierApprovable = classifierApprovable,
        suppressAlwaysAllow = suppressAlwaysAllow,
        matchedAskRule = matchedAskRule,
    )

    private fun rule(vararg contents: String): JsonArray =
        Json.parseToJsonElement(
            """[${contents.joinToString(",") { """{"type":"addRules","rules":[{"toolName":"Bash","ruleContent":"$it"}]}""" }}]""",
        ).jsonArray

    // Обычный вопрос «режим требует спрашивать» объяснять нечем: режим и так
    // подписан в карточке, а лишняя строка была бы пустым шумом.
    @Test
    fun `про режим карточка молчит`() {
        assertEquals("", PermissionReason.text(request(reasonType = "mode")))
        assertEquals("", PermissionReason.text(request()))
    }

    // Про песочницу молчит и сам терминал: она подменяет решение, а не объясняет его.
    @Test
    fun `про песочницу карточка молчит`() {
        assertEquals("", PermissionReason.text(request(reason = "sandbox", reasonType = "sandboxOverride")))
    }

    // Именно этот вопрос человек и видит в режиме «Bypass»: опасное удаление CLI
    // не пропускает ни в одном режиме.
    @Test
    fun `проверка безопасности показывается словами самого CLI`() {
        val warning = "Dangerous rm operation detected: '/tmp/*'"

        assertEquals(warning, PermissionReason.text(request(reason = warning, reasonType = "safetyCheck")))
    }

    @Test
    fun `хук и классификатор подписаны, чтобы человек знал, кого спросили`() {
        assertEquals(
            "A hook asked to confirm this: PreToolUse сказал проверить",
            PermissionReason.text(request(reason = "PreToolUse сказал проверить", reasonType = "hook")),
        )
        assertEquals(
            "The auto-mode classifier asked to confirm this: команда трогает прод",
            PermissionReason.text(request(reason = "команда трогает прод", reasonType = "classifier")),
        )
    }

    @Test
    fun `без текста причины подпись остаётся законченной фразой`() {
        assertEquals("A hook asked to confirm this.", PermissionReason.text(request(reasonType = "hook")))
    }

    @Test
    fun `правило ask называет и себя, и слой настроек`() {
        val text = PermissionReason.text(
            request(
                reasonType = "rule",
                matchedAskRule = PermissionChannel.AskRule("projectSettings", "Bash", "git push *"),
            ),
        )

        assertEquals("An ask rule in shared project settings matched: Bash(git push *)", text)
    }

    @Test
    fun `правило на весь инструмент показывается без пустых скобок`() {
        val text = PermissionReason.text(
            request(reasonType = "rule", matchedAskRule = PermissionChannel.AskRule("session", "WebFetch", null)),
        )

        assertEquals("An ask rule in this session matched: WebFetch", text)
    }

    // Незнакомое имя слоя (новая сборка CLI) не должно превращаться в «in null».
    @Test
    fun `неизвестный слой правила просто не называется`() {
        val text = PermissionReason.text(
            request(reasonType = "rule", matchedAskRule = PermissionChannel.AskRule("новый-слой", "Bash", "ls")),
        )

        assertEquals("An ask rule matched: Bash(ls)", text)
    }

    @Test
    fun `обычный вопрос предлагает запомнить решение`() {
        assertTrue(PermissionReason.rememberable(request(suggestions = rule("npm test"))))
        // MCP и WebFetch приезжают без готовых правил, но правило для них есть —
        // сам инструмент целиком (см. PermissionChannel.rememberRules).
        assertTrue(PermissionReason.rememberable(request()))
    }

    @Test
    fun `запрет от самого CLI убирает предложение запомнить`() {
        assertFalse(PermissionReason.rememberable(request(suppressAlwaysAllow = true)))
    }

    // Опасные удаления: правило записалось бы честно, а следующий такой же вызов
    // снова упёрся бы в вопрос.
    @Test
    fun `проверка, которую правило не снимает, убирает предложение запомнить`() {
        assertFalse(
            PermissionReason.rememberable(
                request(reason = "Dangerous rm", reasonType = "safetyCheck", classifierApprovable = false),
            ),
        )
    }

    // А если CLI сам предложил правило — оно сработает, и прятать кнопку не за что:
    // так ведёт себя и терминал.
    @Test
    fun `предложенное правило оставляет кнопку на месте`() {
        assertTrue(
            PermissionReason.rememberable(
                request(
                    reason = "suspicious path",
                    reasonType = "safetyCheck",
                    classifierApprovable = false,
                    suggestions = rule("ls"),
                ),
            ),
        )
    }
}
