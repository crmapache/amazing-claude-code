package io.github.crmapache.amazingclaudecode.editor

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Which of the files called by a name are the one the agent wrote - the part of opening a path that can
 * be asked without an IDE.
 *
 * The trap is the one every "ends with" has: a folder whose name merely ends the same way. `src/Button.js`
 * must not find `xsrc/Button.js`, and the pieces of a path have to be compared whole rather than as a
 * string.
 */
class OpenInEditorTest {

    private val files = listOf(
        "/app/lib/Button.js",
        "/app/src/components/Button.js",
        "/app/src/legacy/Button.js",
        "/app/xsrc/Button.js",
        "/app/src/components/Button.test.js",
    )

    @Test
    fun `a bare name finds the file in whatever folder it is in`() {
        assertEquals(
            listOf("/app/lib/Button.js", "/app/xsrc/Button.js", "/app/src/components/Button.js", "/app/src/legacy/Button.js"),
            OpenInEditor.rank("Button.js", files),
        )
    }

    @Test
    fun `the folders written in front narrow it down`() {
        assertEquals(
            listOf("/app/src/components/Button.js"),
            OpenInEditor.rank("components/Button.js", files),
        )
    }

    @Test
    fun `a folder that merely ends the same way does not count`() {
        assertEquals(
            listOf("/app/src/Button.js", "/app/legacy/src/Button.js"),
            OpenInEditor.rank("src/Button.js", listOf("/app/src/Button.js", "/app/legacy/src/Button.js", "/app/xsrc/Button.js")),
        )
    }

    @Test
    fun `with nothing under the folders written, every file of that name is offered instead`() {
        assertEquals(
            listOf("/app/lib/Button.js", "/app/xsrc/Button.js", "/app/src/components/Button.js", "/app/src/legacy/Button.js"),
            OpenInEditor.rank("moved/Button.js", files),
        )
    }

    @Test
    fun `the shallowest file comes first, then the alphabet`() {
        assertEquals(
            listOf("/app/Button.js", "/app/a/Button.js", "/app/b/Button.js", "/app/a/deep/Button.js"),
            OpenInEditor.rank("Button.js", listOf("/app/b/Button.js", "/app/a/deep/Button.js", "/app/Button.js", "/app/a/Button.js")),
        )
    }

    @Test
    fun `either separator is a separator, and a dot means here`() {
        assertEquals(
            listOf("/app/src/components/Button.js"),
            OpenInEditor.rank("./src\\components/Button.js", files),
        )
    }

    @Test
    fun `case follows the file system`() {
        assertEquals(emptyList(), OpenInEditor.rank("button.js", files, caseSensitive = true))
        assertEquals(
            listOf("/app/lib/Button.js", "/app/xsrc/Button.js", "/app/src/components/Button.js", "/app/src/legacy/Button.js"),
            OpenInEditor.rank("button.js", files, caseSensitive = false),
        )
    }

    @Test
    fun `a tail cannot climb`() {
        assertEquals(emptyList(), OpenInEditor.rank("../Button.js", files))
    }

    @Test
    fun `nothing written is nothing found`() {
        assertEquals(emptyList(), OpenInEditor.rank("", files))
        assertEquals(emptyList(), OpenInEditor.rank("/", files))
    }
}
