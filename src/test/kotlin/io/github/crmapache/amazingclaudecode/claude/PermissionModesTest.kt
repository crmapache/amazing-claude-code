package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals

class PermissionModesTest {

    @Test
    fun `старое имя режима приводится к тому, что понимает CLI`() {
        // У флага запуска значения "default" нет вовсе — режим зовётся "manual".
        assertEquals("manual", PermissionModes.normalize("default"))
    }

    @Test
    fun `остальные режимы не трогаются`() {
        for (mode in listOf("acceptEdits", "plan", "auto", "dontAsk", "bypassPermissions")) {
            assertEquals(mode, PermissionModes.normalize(mode))
        }
    }

    @Test
    fun `невыбранный режим становится самым строгим, а не отдаётся на откуп конфигу`() {
        // Иначе панель показывает «Ask», а процесс поднимается с permissions.defaultMode
        // из личного конфига — вплоть до bypassPermissions.
        assertEquals("manual", PermissionModes.resolve(""))
    }

    @Test
    fun `выбранный режим сохраняется как есть`() {
        assertEquals("bypassPermissions", PermissionModes.resolve("bypassPermissions"))
        assertEquals("manual", PermissionModes.resolve("default"))
    }
}
