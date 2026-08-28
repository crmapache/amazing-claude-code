package io.github.crmapache.amazingclaudecode.editor

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Which editors a turn writes out - the part of the decision that can be asked without an IDE.
 *
 * The trap is the neighbour with a longer name: two checkouts of the same repository sit side by side
 * all the time, and prefix matching quietly counts one as part of the other.
 */
class UnsavedEditsTest {

    @Test
    fun `a file inside the project counts`() {
        assertTrue(UnsavedEdits.under("/work/site/src/main.kt", "/work/site"))
    }

    @Test
    fun `a sibling whose name starts the same does not`() {
        assertFalse(UnsavedEdits.under("/work/site-old/src/main.kt", "/work/site"))
        assertFalse(UnsavedEdits.under("/work/sitemap.txt", "/work/site"))
    }

    @Test
    fun `a file outside the project does not`() {
        assertFalse(UnsavedEdits.under("/etc/hosts", "/work/site"))
    }

    @Test
    fun `a trailing slash on the root changes nothing`() {
        assertTrue(UnsavedEdits.under("/work/site/src/main.kt", "/work/site/"))
    }

    @Test
    fun `the root directory itself counts`() {
        assertTrue(UnsavedEdits.under("/work/site", "/work/site"))
    }

    /** A project without a directory of its own - then only the project's index can answer. */
    @Test
    fun `no root means nothing is inside it`() {
        assertFalse(UnsavedEdits.under("/work/site/src/main.kt", null))
        assertFalse(UnsavedEdits.under("/work/site/src/main.kt", ""))
        assertFalse(UnsavedEdits.under("/work/site/src/main.kt", "/"))
    }
}
