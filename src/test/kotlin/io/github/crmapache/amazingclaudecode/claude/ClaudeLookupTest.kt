package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Поиск исполняемого файла ломается там, куда не дотянуться руками: чужая
 * Windows, необычное место установки, PATH оболочки IDE. Проверяем перебор
 * путей на подставленном окружении — иначе про Windows пришлось бы гадать и
 * отправлять человека проверять вслепую.
 */
class ClaudeLookupTest {

    private fun unix(
        env: Map<String, String> = emptyMap(),
        configured: String = "",
        home: String = "/Users/max",
    ) = ClaudeLookup.candidates(windows = false, home = home, env = env, configured = configured, separator = ':')

    private fun windows(
        env: Map<String, String> = emptyMap(),
        configured: String = "",
        home: String = "C:\\Users\\max",
    ) = ClaudeLookup.candidates(windows = true, home = home, env = env, configured = configured, separator = ';')

    @Test
    fun `на Windows проверяем все имена, которыми ставят CLI`() {
        // Нативный установщик кладёт exe, npm — обёртку cmd, сборки из MSYS —
        // файл без расширения вовсе.
        assertEquals(listOf("claude.exe", "claude.cmd", "claude.bat", "claude"), ClaudeLookup.executableNames(true))
        assertEquals(listOf("claude"), ClaudeLookup.executableNames(false))
    }

    @Test
    fun `каждая папка PATH проверяется всеми именами`() {
        val paths = windows(env = mapOf("Path" to "C:\\tools\\bin;C:\\other"))

        assertTrue("C:\\tools\\bin\\claude.exe" in paths)
        assertTrue("C:\\tools\\bin\\claude.cmd" in paths)
        assertTrue("C:\\other\\claude.exe" in paths)
    }

    // На Windows переменная зовётся `Path`, и карта окружения не всегда
    // регистронезависима: спросив только «PATH», мы не нашли бы ничего.
    @Test
    fun `PATH находится под любым написанием`() {
        assertEquals("A", ClaudeLookup.pathValue(mapOf("PATH" to "A")))
        assertEquals("B", ClaudeLookup.pathValue(mapOf("Path" to "B")))
        assertEquals("C", ClaudeLookup.pathValue(mapOf("path" to "C")))
    }

    @Test
    fun `npm-обёртка из APPDATA попадает в список`() {
        val paths = windows(env = mapOf("APPDATA" to "C:\\Users\\max\\AppData\\Roaming"))
        assertTrue("C:\\Users\\max\\AppData\\Roaming\\npm\\claude.cmd" in paths)
    }

    @Test
    fun `нативная установка в домашней папке проверяется на обеих системах`() {
        assertTrue("/Users/max/.local/bin/claude" in unix())
        assertTrue("C:\\Users\\max\\.local\\bin\\claude.exe" in windows())
    }

    // Человек с равной вероятностью укажет и сам файл, и папку с ним.
    @Test
    fun `указанный руками путь идёт первым — и файлом, и папкой`() {
        val paths = unix(configured = "/opt/claude")

        assertEquals("/opt/claude", paths.first())
        assertTrue("/opt/claude/claude" in paths)
    }

    @Test
    fun `тильда в указанном пути разворачивается в домашнюю папку`() {
        assertTrue("/Users/max/bin/claude" in unix(configured = "~/bin/claude"))
    }

    @Test
    fun `пустая настройка ничего не добавляет`() {
        assertFalse(unix(configured = "   ").any { it.isBlank() })
    }

    @Test
    fun `один и тот же путь не проверяется дважды`() {
        // PATH нередко содержит ту же папку, что и наш список типовых мест.
        val paths = unix(env = mapOf("PATH" to "/Users/max/.local/bin"))
        assertEquals(1, paths.count { it == "/Users/max/.local/bin/claude" })
    }
}
