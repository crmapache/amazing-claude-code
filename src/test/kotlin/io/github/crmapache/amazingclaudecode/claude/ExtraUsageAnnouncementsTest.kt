package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * One crossing into extra usage is one call to the phone, whichever project happens to notice it - the
 * limit belongs to the account, while the thing watching it belongs to a project.
 */
class ExtraUsageAnnouncementsTest {

    @Test
    fun `the first project to see a window takes it, and the others stay quiet`() {
        val announcements = ExtraUsageAnnouncements()

        assertTrue(announcements.claim("five_hour", 1_700_000_000_000))
        assertFalse(announcements.claim("five_hour", 1_700_000_000_000))
        assertFalse(announcements.claim("five_hour", 1_700_000_000_000))
    }

    @Test
    fun `the next window is a new occasion, and so is another kind of window`() {
        val announcements = ExtraUsageAnnouncements()

        assertTrue(announcements.claim("five_hour", 1_700_000_000_000))
        // Five hours later: the same kind of window, a different occasion.
        assertTrue(announcements.claim("five_hour", 1_700_018_000_000))
        assertTrue(announcements.claim("seven_day", 1_700_000_000_000))
    }

    @Test
    fun `an event that names no window at all is always claimed`() {
        val announcements = ExtraUsageAnnouncements()

        // Nothing to tell one such event from the next, and a call not made is worse than one made twice.
        assertTrue(announcements.claim("", null))
        assertTrue(announcements.claim("", null))
    }
}
