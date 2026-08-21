package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals

class PermissionModesTest {

    @Test
    fun `the mode's old name is brought to the one the CLI understands`() {
        // The launch flag has no value "default" at all - the mode is called "manual".
        assertEquals("manual", PermissionModes.normalize("default"))
    }

    @Test
    fun `the other modes are left alone`() {
        for (mode in listOf("acceptEdits", "plan", "auto", "dontAsk", "bypassPermissions")) {
            assertEquals(mode, PermissionModes.normalize(mode))
        }
    }

    @Test
    fun `an unchosen mode takes the default rather than a hidden value from a config`() {
        // The panel works the default out itself (see PermissionDefaultMode) and passes it as a flag:
        // the selector has to show the same mode the process came up with. With no default passed - the
        // strictest mode.
        assertEquals("manual", PermissionModes.resolve(""))
        assertEquals("auto", PermissionModes.resolve("", fallback = "auto"))
    }

    @Test
    fun `a chosen mode is not overridden by the default`() {
        assertEquals("plan", PermissionModes.resolve("plan", fallback = "auto"))
    }

    @Test
    fun `a chosen mode is kept as it is`() {
        assertEquals("bypassPermissions", PermissionModes.resolve("bypassPermissions"))
        assertEquals("manual", PermissionModes.resolve("default"))
    }
}
