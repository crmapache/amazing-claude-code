package io.github.crmapache.amazingclaudecode.project

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ProjectFactsTest {

    @Test
    fun `простая ветка без префикса`() {
        assertEquals("main", ProjectFacts.parseHeadBranch("ref: refs/heads/main"))
    }

    @Test
    fun `сохраняет префикс ветки с одним слэшем`() {
        assertEquals("feature/foo", ProjectFacts.parseHeadBranch("ref: refs/heads/feature/foo"))
    }

    @Test
    fun `сохраняет префикс ветки с несколькими слэшами`() {
        assertEquals("feature/nested/foo", ProjectFacts.parseHeadBranch("ref: refs/heads/feature/nested/foo"))
    }

    @Test
    fun `отсоединённая голова — короткий хеш`() {
        assertEquals("a1b2c3d", ProjectFacts.parseHeadBranch("a1b2c3d4e5f6789"))
    }

    @Test
    fun `слишком короткое содержимое — null`() {
        assertNull(ProjectFacts.parseHeadBranch("a1b"))
    }
}
