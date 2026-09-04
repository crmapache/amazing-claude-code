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

    /**
     * The other half that can be asked without an IDE: `~/.claude/settings.json` is the path the agent
     * names most often outside any project, and until it was expanded it resolved from the project's root,
     * found nothing, and went looking for `settings.json` among the project's own files.
     */
    @Test
    fun `a tilde becomes the home directory`() {
        assertEquals("/home/ivan/.claude/settings.json", OpenInEditor.expandHome("~/.claude/settings.json", "/home/ivan"))
        assertEquals("/home/ivan", OpenInEditor.expandHome("~", "/home/ivan"))
        assertEquals("C:\\Users\\Ivan\\.claude", OpenInEditor.expandHome("~\\.claude", "C:\\Users\\Ivan"))
    }

    /** A home written with a separator at the end must not leave two of them in the middle. */
    @Test
    fun `the separators do not double up`() {
        assertEquals("/home/ivan/.claude", OpenInEditor.expandHome("~/.claude", "/home/ivan/"))
    }

    /**
     * Everything else is left exactly as written - including another person's home, which is not this
     * one's and is not somewhere to guess at.
     */
    @Test
    fun `only this home is expanded`() {
        assertEquals("~ivan/.claude", OpenInEditor.expandHome("~ivan/.claude", "/home/ivan"))
        assertEquals("~stuff", OpenInEditor.expandHome("~stuff", "/home/ivan"))
        assertEquals("src/App.tsx", OpenInEditor.expandHome("src/App.tsx", "/home/ivan"))
    }

    /**
     * No home to expand to is the answer for a project on a WSL share: the `~` there is the
     * distribution's, and this machine's home may well have a `.claude` of its own in it (see ClaudeHome).
     */
    @Test
    fun `without a home nothing is expanded`() {
        assertEquals("~/.claude", OpenInEditor.expandHome("~/.claude", null))
        assertEquals("~/.claude", OpenInEditor.expandHome("~/.claude", "  "))
    }
}
