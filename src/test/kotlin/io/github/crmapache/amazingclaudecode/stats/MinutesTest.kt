package io.github.crmapache.amazingclaudecode.stats

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class MinutesTest {

    @Test
    fun `a minute marked twice counts once`() {
        val set = MinuteSet()
        set.mark(600)
        set.mark(600)
        set.mark(601)

        assertEquals(2, set.count())
        assertContentEquals(intArrayOf(600, 601), set.minutes())
    }

    @Test
    fun `minutes outside the day are ignored`() {
        val set = MinuteSet()
        set.mark(-1)
        set.mark(MinuteSet.MINUTES_PER_DAY)

        assertTrue(set.isEmpty())
    }

    @Test
    fun `the hours are read off the same bits`() {
        val set = MinuteSet()
        for (minute in 600 until 660) set.mark(minute)
        set.mark(661)

        val hours = set.hours()
        assertEquals(60, hours[10])
        assertEquals(1, hours[11])
        assertEquals(0, hours[9])
    }

    @Test
    fun `the bits survive the file`() {
        val set = MinuteSet()
        set.mark(0)
        set.mark(719)
        set.mark(1439)

        val decoded = MinuteSet.decode(set.encode())
        assertContentEquals(set.minutes(), decoded.minutes())
        assertEquals("", MinuteSet().encode())
        assertTrue(MinuteSet.decode("").isEmpty())
        assertTrue(MinuteSet.decode("not base64 at all!").isEmpty())
    }
}
