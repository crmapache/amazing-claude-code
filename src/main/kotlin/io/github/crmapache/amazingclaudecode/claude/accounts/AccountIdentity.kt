package io.github.crmapache.amazingclaudecode.claude.accounts

import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

/**
 * Who a credential belongs to - as the CLI wrote it down in a config file only that one credential used.
 *
 * **Never out of the file every drawer shares.** `~/.claude.json` names whoever wrote it last, and that is
 * not "whoever signed in last": every running process of every account rewrites it, so in the seconds a
 * sign-in takes it can flip between two accounts and back. Reading the newcomer's name out of it is how a
 * sign-in got filed under another account's address - and then the next genuine sign-in of THAT account
 * read as a repeated one and deleted the drawer of whoever was really in it. So the only files read here
 * are config directories of our own, each used by one credential: the usage question's
 * (see AccountStore.usageProbeEnvironment) and the one-off identity question's (see
 * ClaudeAccounts.identityOf).
 *
 * **Such a file keeps its answer for a day.** The CLI fetches the profile when the record is missing or
 * older than 24 hours (`profileFetchedAt`, read out of 2.1.280), and otherwise answers with what it has -
 * so a drawer signed into by somebody else, or a record whose drawer was replaced, went on showing the
 * previous occupant all day. [expire] takes the record away before a question, and [probe] dates an
 * answer by when the profile was FETCHED rather than by the file's time: the CLI rewrites the file on
 * every run, which made a day-old name look a second old.
 *
 * Reading is kept apart from [ClaudeAccounts] because it is arithmetic over a file and a test can hold
 * it, while everything around it is processes and services.
 */
internal object AccountIdentity {

    data class Who(val email: String, val orgUuid: String, val orgName: String) {

        /** An account we could not name is an account we must not file. */
        val isNamed: Boolean get() = email.isNotEmpty()

        /** Which account this is, in the terms records are compared by (see AccountStore.keyOf). */
        val key: String get() = AccountStore.keyOf(email, orgUuid)
    }

    /**
     * An answer together with the moment it was learned.
     *
     * The moment is not decoration. A decision that DELETES something on the strength of this - two
     * drawers holding one account being merged into one row (see [AccountTwin]) - has to know whether the
     * answer came before or after it asked.
     */
    data class Probed(val who: Who, val at: Long)

    /**
     * The answer in this file, or null when there is no file to answer with.
     *
     * Dated by `profileFetchedAt`, the moment the CLI actually asked the server. The file's own time is
     * only a fallback for a record without that stamp, and it is honest there for one reason: [expire]
     * takes an unstamped record away before every question, so one that is present was written by the
     * last question.
     */
    fun probe(file: File): Probed? {
        val modified = file.lastModified().takeIf { it > 0L } ?: return null
        val account = accountIn(file)

        return Probed(whoIn(account), fetchedAt(account) ?: modified)
    }

    /** Who this file names, or nobody. */
    fun read(file: File): Who = whoIn(accountIn(file))

    /**
     * Take the record away when it is older than [maxAgeMs], so the next question fetches it again.
     *
     * Before a usage question, whose directory is kept between questions on purpose (a cold one answers
     * later - see ClaudeAccounts.usageProbeVariables). The whole record goes rather than only its stamp:
     * a fetch that then fails leaves no name at all, which the screen reads as "not known yet", instead of
     * the previous occupant's name with nothing to date it by.
     *
     * Written the way the CLI writes it, through a temporary file and a rename, so a process reading it
     * meanwhile sees one version or the other and never half of one. Everything else in the file is left
     * exactly as it was. Returns whether anything was taken away.
     */
    fun expire(file: File, maxAgeMs: Long, now: Long = System.currentTimeMillis()): Boolean {
        val root = rootOf(file) ?: return false
        val account = root["oauthAccount"] as? JsonObject ?: return false

        val fetched = fetchedAt(account)
        if (fetched != null && now - fetched < maxAgeMs) return false

        return runCatching {
            val temporary = File(file.parentFile, "${file.name}.acc-${System.nanoTime()}")
            Files.writeString(temporary.toPath(), JsonObject(root - "oauthAccount").toString(), StandardCharsets.UTF_8)
            runCatching {
                Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
            }.recoverCatching {
                Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }.onFailure { temporary.delete() }.getOrThrow()
        }.isSuccess
    }

    /**
     * Parsed defensively and by name. The file is the CLI's own business, most of it none of ours; we take
     * a few fields and ignore everything else, including a shape we do not recognise.
     */
    private fun rootOf(file: File): JsonObject? {
        val text = runCatching { file.readText() }.getOrNull() ?: return null

        return runCatching { Json.parseToJsonElement(text).jsonObject }.getOrNull()
    }

    private fun accountIn(file: File): JsonObject? = runCatching { rootOf(file)?.get("oauthAccount")?.jsonObject }.getOrNull()

    private fun whoIn(account: JsonObject?): Who {
        val field = { name: String -> account?.get(name)?.jsonPrimitive?.contentOrNull.orEmpty() }

        return Who(
            email = field("emailAddress"),
            orgUuid = field("organizationUuid"),
            orgName = field("organizationName"),
        )
    }

    private fun fetchedAt(account: JsonObject?): Long? =
        runCatching { account?.get("profileFetchedAt")?.jsonPrimitive?.longOrNull }.getOrNull()?.takeIf { it > 0L }
}
