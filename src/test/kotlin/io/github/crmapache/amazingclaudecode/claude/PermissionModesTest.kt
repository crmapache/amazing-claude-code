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
    fun `невыбранный режим берёт умолчание, а не тайное значение из конфига`() {
        // Умолчание панель вычисляет сама (см. PermissionDefaultMode) и передаёт
        // флагом: селектор обязан показывать тот же режим, с которым поднялся
        // процесс. Без переданного умолчания — самый строгий режим.
        assertEquals("manual", PermissionModes.resolve(""))
        assertEquals("auto", PermissionModes.resolve("", fallback = "auto"))
    }

    @Test
    fun `выбранный режим умолчание не перебивает`() {
        assertEquals("plan", PermissionModes.resolve("plan", fallback = "auto"))
    }

    @Test
    fun `выбранный режим сохраняется как есть`() {
        assertEquals("bypassPermissions", PermissionModes.resolve("bypassPermissions"))
        assertEquals("manual", PermissionModes.resolve("default"))
    }
}
