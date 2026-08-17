package io.github.crmapache.amazingclaudecode.claude

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals

class PermissionDefaultModeTest {

    private fun source(layer: ClaudeSettings.Layer, content: String): ClaudeSettings.Source =
        ClaudeSettings.Source(
            layer,
            File.createTempFile("settings", ".json").apply {
                deleteOnExit()
                writeText(content)
            },
        )

    private fun mode(mode: String): String = """{"permissions": {"defaultMode": "$mode"}}"""

    @Test
    fun `без настроек начинаем с самого строгого режима`() {
        assertEquals(PermissionModes.ASK, PermissionDefaultMode.of(sources = emptyList(), bypassAllowed = true))
    }

    @Test
    fun `режим из личных настроек человека и есть умолчание панели`() {
        val sources = listOf(source(ClaudeSettings.Layer.USER, mode("acceptEdits")))

        assertEquals("acceptEdits", PermissionDefaultMode.of(sources, bypassAllowed = true))
    }

    // Так этот режим зовётся во флаге запуска, и селектор в панели знает только это имя.
    @Test
    fun `старое имя приводится к нынешнему`() {
        val sources = listOf(source(ClaudeSettings.Layer.USER, mode("default")))

        assertEquals(PermissionModes.ASK, PermissionDefaultMode.of(sources, bypassAllowed = true))
    }

    @Test
    fun `старший слой перебивает младший`() {
        val sources = listOf(
            source(ClaudeSettings.Layer.POLICY, mode("plan")),
            source(ClaudeSettings.Layer.USER, mode("acceptEdits")),
        )

        assertEquals("plan", PermissionDefaultMode.of(sources, bypassAllowed = true))
    }

    @Test
    fun `пустой файл настроек пропускается, а не отменяет остальные`() {
        val sources = listOf(
            source(ClaudeSettings.Layer.POLICY, "{}"),
            source(ClaudeSettings.Layer.USER, mode("dontAsk")),
        )

        assertEquals("dontAsk", PermissionDefaultMode.of(sources, bypassAllowed = true))
    }

    // Настройки проекта лежат в репозитории: режим, в котором вопросы решает
    // классификатор, туда мог бы положить кто угодно с правом на правку. CLI такому
    // умолчанию не верит — и панель не должна.
    @Test
    fun `auto из настроек проекта не принимается`() {
        for (layer in listOf(ClaudeSettings.Layer.PROJECT, ClaudeSettings.Layer.LOCAL)) {
            val sources = listOf(source(layer, mode("auto")))

            assertEquals(PermissionModes.ASK, PermissionDefaultMode.of(sources, bypassAllowed = true))
        }
    }

    @Test
    fun `auto из личных настроек и из политики принимается`() {
        for (layer in listOf(ClaudeSettings.Layer.USER, ClaudeSettings.Layer.POLICY)) {
            val sources = listOf(source(layer, mode("auto")))

            assertEquals("auto", PermissionDefaultMode.of(sources, bypassAllowed = true))
        }
    }

    // Запрещённый режим CLI всё равно отбросит, а панель осталась бы показывать
    // режим, которого у разговора нет.
    @Test
    fun `bypass не берётся в умолчание, когда режим запрещён`() {
        val sources = listOf(source(ClaudeSettings.Layer.USER, mode("bypassPermissions")))

        assertEquals(PermissionModes.ASK, PermissionDefaultMode.of(sources, bypassAllowed = false))
        assertEquals("bypassPermissions", PermissionDefaultMode.of(sources, bypassAllowed = true))
    }

    // С незнакомым именем CLI не запустится вовсе — панель на нём стартовать не должна.
    @Test
    fun `незнакомое имя режима отбрасывается`() {
        val sources = listOf(source(ClaudeSettings.Layer.USER, mode("yolo")))

        assertEquals(PermissionModes.ASK, PermissionDefaultMode.of(sources, bypassAllowed = true))
    }

    @Test
    fun `битые настройки не мешают взять умолчание из следующего слоя`() {
        val sources = listOf(
            source(ClaudeSettings.Layer.POLICY, "{ это не json"),
            source(ClaudeSettings.Layer.USER, mode("plan")),
        )

        assertEquals("plan", PermissionDefaultMode.of(sources, bypassAllowed = true))
    }
}
