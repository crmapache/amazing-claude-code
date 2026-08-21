package io.github.crmapache.amazingclaudecode.project

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ProjectFactsTest {

    @Test
    fun `a plain branch without a prefix`() {
        assertEquals("main", ProjectFacts.parseHeadBranch("ref: refs/heads/main"))
    }

    @Test
    fun `keeps the prefix of a branch with one slash`() {
        assertEquals("feature/foo", ProjectFacts.parseHeadBranch("ref: refs/heads/feature/foo"))
    }

    @Test
    fun `keeps the prefix of a branch with several slashes`() {
        assertEquals("feature/nested/foo", ProjectFacts.parseHeadBranch("ref: refs/heads/feature/nested/foo"))
    }

    @Test
    fun `a detached head is a short hash`() {
        assertEquals("a1b2c3d", ProjectFacts.parseHeadBranch("a1b2c3d4e5f6789"))
    }

    @Test
    fun `contents too short give null`() {
        assertNull(ProjectFacts.parseHeadBranch("a1b"))
    }
}
