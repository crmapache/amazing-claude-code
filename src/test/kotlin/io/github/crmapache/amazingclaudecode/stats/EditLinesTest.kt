package io.github.crmapache.amazingclaudecode.stats

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EditLinesTest {

    @Test
    fun `the matching head and tail are not part of the change`() {
        val change = EditLines.of(
            oldText = "a\nb\nc\nd",
            newText = "a\nB\nC2\nC3\nd",
        )

        assertEquals(3, change.added)
        assertEquals(2, change.removed)
        assertFalse(change.isSingleLine)
    }

    @Test
    fun `one line for one line is the surgeon's cut`() {
        val change = EditLines.of("const a = 1", "const a = 2")

        assertEquals(1, change.added)
        assertEquals(1, change.removed)
        assertTrue(change.isSingleLine)
    }

    @Test
    fun `identical texts change nothing`() {
        val change = EditLines.of("same\ntext", "same\ntext")
        assertEquals(0, change.added)
        assertEquals(0, change.removed)
    }

    @Test
    fun `a file written whole is all new lines, without a trailing empty one`() {
        assertEquals(3, EditLines.written("one\ntwo\nthree\n"))
        assertEquals(1, EditLines.written("just one"))
        assertEquals(0, EditLines.written(""))
        assertEquals(0, EditLines.written("\n\n"))
    }

    @Test
    fun `a test is known by its name or its folder`() {
        assertTrue(EditLines.isTestPath("webview/src/feed/build.test.ts"))
        assertTrue(EditLines.isTestPath("src/test/kotlin/io/Foo.kt"))
        assertTrue(EditLines.isTestPath("spec/models/user_spec.rb"))
        assertTrue(EditLines.isTestPath("app/__tests__/App.tsx"))
        assertTrue(EditLines.isTestPath("pkg/handler_test.go"))
        assertTrue(EditLines.isTestPath("tests/test_api.py"))
        assertFalse(EditLines.isTestPath("src/main/kotlin/io/Foo.kt"))
        assertFalse(EditLines.isTestPath("webview/src/feed/build.ts"))
        assertFalse(EditLines.isTestPath("contest/latest.md"))
    }
}
