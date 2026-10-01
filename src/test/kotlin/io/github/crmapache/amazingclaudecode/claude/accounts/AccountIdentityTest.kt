package io.github.crmapache.amazingclaudecode.claude.accounts

import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject

/**
 * Who a usage question's config file says the credential belongs to, and how old that answer really is.
 *
 * The account that was lost went through exactly here: the CLI keeps the profile it fetched for a day,
 * and rewrites the file on every run. Dated by the file, a name left by the drawer's previous occupant
 * looked a second old - and the screen named somebody who was no longer in the drawer.
 */
class AccountIdentityTest {

    private val folder: File = Files.createTempDirectory("acc-identity-test").toFile()

    @AfterTest
    fun tidy() {
        folder.deleteRecursively()
    }

    private val now = 1_790_000_000_000L

    private fun config(account: String?, rest: String = "\"numStartups\":7,\"projects\":{\"/x\":{\"a\":1}}"): File {
        val file = File(folder, ".claude.json")
        val body = listOfNotNull(rest.takeIf { it.isNotEmpty() }, account?.let { "\"oauthAccount\":$it" })
        file.writeText("{${body.joinToString(",")}}")
        return file
    }

    private fun account(email: String = "me@example.com", fetchedAt: Long? = now - 1_000) =
        buildString {
            append("{\"emailAddress\":\"$email\",\"organizationUuid\":\"org-1\",\"organizationName\":\"Org\"")
            fetchedAt?.let { append(",\"profileFetchedAt\":$it") }
            append("}")
        }

    // --- How old an answer is ----------------------------------------------------------

    @Test
    fun `an answer is dated by when the profile was fetched, not by when the file was written`() {
        val file = config(account(fetchedAt = now - 86_000_000))
        file.setLastModified(now)

        val probed = AccountIdentity.probe(file)

        assertEquals("me@example.com", probed?.who?.email)
        assertEquals(now - 86_000_000, probed?.at)
    }

    /** Only safe because an unstamped record is taken away before every question - see [AccountIdentity.expire]. */
    @Test
    fun `an unstamped answer falls back to the file's time`() {
        val file = config(account(fetchedAt = null))
        file.setLastModified(now)

        assertEquals(now, AccountIdentity.probe(file)?.at)
    }

    @Test
    fun `no file is no answer, and a file without a record names nobody`() {
        assertNull(AccountIdentity.probe(File(folder, "missing.json")))
        assertFalse(AccountIdentity.read(config(account = null)).isNamed)
    }

    @Test
    fun `the key is the address and the organisation`() {
        val who = AccountIdentity.read(config(account()))

        assertEquals(AccountStore.keyOf("me@example.com", "org-1"), who.key)
    }

    // --- Taking a stale record away before a question ---------------------------------------

    @Test
    fun `a record older than the limit is taken away and everything else stays`() {
        val file = config(account(fetchedAt = now - 120_000))

        assertTrue(AccountIdentity.expire(file, maxAgeMs = 60_000, now = now))

        val root = Json.parseToJsonElement(file.readText()).jsonObject
        assertNull(root["oauthAccount"])
        assertEquals("7", root["numStartups"].toString())
        assertEquals("{\"/x\":{\"a\":1}}", root["projects"].toString())
    }

    @Test
    fun `a fresh record stays`() {
        val file = config(account(fetchedAt = now - 10_000))
        val before = file.readText()

        assertFalse(AccountIdentity.expire(file, maxAgeMs = 60_000, now = now))
        assertEquals(before, file.readText())
    }

    /** Nothing to date it by is as stale as it gets: the next question fetches it again. */
    @Test
    fun `an unstamped record is always taken away`() {
        val file = config(account(fetchedAt = null))

        assertTrue(AccountIdentity.expire(file, maxAgeMs = 60_000, now = now))
        assertFalse(AccountIdentity.read(file).isNamed)
    }

    /** A drawer whose credential was just replaced: whatever its last answer, it is about the old one. */
    @Test
    fun `a limit of zero takes any record away`() {
        val file = config(account(fetchedAt = now))

        assertTrue(AccountIdentity.expire(file, maxAgeMs = 0, now = now))
    }

    @Test
    fun `nothing to take away is no change`() {
        assertFalse(AccountIdentity.expire(config(account = null), maxAgeMs = 0, now = now))
        assertFalse(AccountIdentity.expire(File(folder, "missing.json"), maxAgeMs = 0, now = now))

        val broken = File(folder, "broken.json").apply { writeText("{not json") }
        assertFalse(AccountIdentity.expire(broken, maxAgeMs = 0, now = now))
        assertEquals("{not json", broken.readText())
    }

    @Test
    fun `nothing is left beside the file`() {
        AccountIdentity.expire(config(account(fetchedAt = null)), maxAgeMs = 0, now = now)

        assertEquals(listOf(".claude.json"), folder.list()?.toList())
    }
}
