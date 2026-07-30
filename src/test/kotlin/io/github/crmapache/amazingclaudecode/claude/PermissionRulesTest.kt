package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals

class PermissionRulesTest {

    @Test
    fun `правило для команды берёт префикс, а не всю строку`() {
        // Иначе правило совпадёт ровно один раз — с этой же командой целиком.
        assertEquals("Bash(git commit *)", PermissionRules.rule("Bash", "git commit -am \"fix\""))
        assertEquals("Bash(pnpm test *)", PermissionRules.rule("Bash", "pnpm test reconnect"))
    }

    @Test
    fun `для файловых инструментов правилом служит имя инструмента`() {
        assertEquals("Write", PermissionRules.rule("Write", "/tmp/file.txt"))
        assertEquals("WebFetch", PermissionRules.rule("WebFetch", "https://example.com"))
    }

    @Test
    fun `пустая команда не превращается в мусорное правило`() {
        assertEquals("Bash", PermissionRules.rule("Bash", "   "))
    }
}
