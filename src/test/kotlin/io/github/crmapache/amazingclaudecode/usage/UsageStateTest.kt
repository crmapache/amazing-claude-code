package io.github.crmapache.amazingclaudecode.usage

import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class UsageStateTest {

    private val directory = Files.createTempDirectory("acc-usage-state")

    @AfterTest
    fun tearDown() {
        directory.toFile().deleteRecursively()
    }

    @Test
    fun `the state survives the file`() {
        val data = UsageState.Data(
            consent = UsageState.Consent.GRANTED,
            id = "Rk3pD9xQ2mV7tL1aZ8bN4c",
            since = "2026-09-30",
            sent = mapOf("2026-09-30" to "abc"),
            lastAttempt = 10,
            lastSent = 9,
            forget = listOf("old-identifier-000000"),
        )

        assertEquals(data, UsageState.decode(UsageState.encode(data)))
    }

    @Test
    fun `no file and a broken file both mean not asked yet`() {
        val state = UsageState(directory.resolve(UsageState.FILE_NAME))
        assertEquals(UsageState.Consent.UNKNOWN, state.read().consent)

        Files.writeString(directory.resolve(UsageState.FILE_NAME), "{ half a file")
        assertEquals(UsageState.Data(), state.read())
        assertNull(UsageState.decode("not json"))
    }

    @Test
    fun `a change is read back by another reader of the same file - another IDE`() {
        val file = directory.resolve(UsageState.FILE_NAME)
        UsageState(file).update { it.copy(consent = UsageState.Consent.DECLINED) }

        assertEquals(UsageState.Consent.DECLINED, UsageState(file).read().consent)
    }

    @Test
    fun `an identifier is random and URL-safe`() {
        val ids = (1..50).map { UsageState.newId() }.toSet()
        assertEquals(50, ids.size)
        assertTrue(ids.all { Regex("^[A-Za-z0-9_-]{22}$").matches(it) })
    }
}
