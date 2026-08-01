package io.github.crmapache.amazingclaudecode.claude

import java.io.File
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PermissionBypassTest {

    private fun settings(vararg contents: String): List<File> = contents.map { content ->
        File.createTempFile("settings", ".json").apply {
            deleteOnExit()
            writeText(content)
        }
    }

    @Test
    fun `без ключа запуска режим недоступен, что бы ни лежало в настройках`() {
        assertFalse(PermissionBypass.isAvailable(cliKnowsFlag = false, settings = settings("{}")))
    }

    @Test
    fun `обычные настройки режим не запрещают`() {
        val files = settings("{}", """{"permissions": {"defaultMode": "plan"}}""")

        assertTrue(PermissionBypass.isAvailable(cliKnowsFlag = true, settings = files))
    }

    // Политика организации кладётся в managed-settings.json, но то же поле человек
    // может поставить и себе — CLI смотрит на объединённые настройки.
    @Test
    fun `запрет в любом из файлов настроек убирает режим`() {
        val files = settings("{}", """{"permissions": {"disableBypassPermissionsMode": "disable"}}""")

        assertFalse(PermissionBypass.isAvailable(cliKnowsFlag = true, settings = files))
    }

    @Test
    fun `отсутствующий файл настроек ничего не запрещает`() {
        val missing = File(System.getProperty("java.io.tmpdir"), "нет-такого-файла-настроек.json")

        assertTrue(PermissionBypass.isAvailable(cliKnowsFlag = true, settings = listOf(missing)))
    }

    // Разбор чужого файла не наше дело: сломанные настройки — забота самого CLI,
    // а панель не должна из-за них молча отнимать режим.
    @Test
    fun `битые настройки не запрещают режим и не роняют панель`() {
        val files = settings("{ это не json")

        assertTrue(PermissionBypass.isAvailable(cliKnowsFlag = true, settings = files))
    }

    @Test
    fun `в список настроек попадают файлы политики, пользователя и проекта`() {
        val project = File(System.getProperty("java.io.tmpdir"), "проект")
        val paths = PermissionBypass.settingsFiles(project.absolutePath).map { it.absolutePath }

        assertTrue(paths.any { it.endsWith("managed-settings.json") })
        assertTrue(paths.any { it.endsWith(File(".claude", "settings.json").path) && it.startsWith(System.getProperty("user.home")) })
        assertTrue(paths.any { it.startsWith(project.absolutePath) && it.endsWith("settings.json") })
        assertTrue(paths.any { it.endsWith("settings.local.json") })
    }
}
