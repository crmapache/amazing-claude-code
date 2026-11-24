package io.github.crmapache.amazingclaudecode.claude.terminal

import com.intellij.openapi.diagnostic.thisLogger
import io.github.crmapache.amazingclaudecode.claude.ClaudeHome
import io.github.crmapache.amazingclaudecode.claude.HostOs
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.longOrNull
import java.io.File
import kotlin.math.abs

/**
 * Who else, if anybody, is running a conversation right now - read off the CLI's own register of live
 * processes.
 *
 * Two processes over one transcript is the one thing a conversation does not survive: each writes its own
 * turns into the same file, and what is said in one does not exist for the other (see history.md). Inside the
 * panel that is held by the tabs themselves - a conversation is open in one tab at most. Outside it nothing
 * held it: `/status` hands out `claude --resume <id>` to be pasted into a terminal, Continue in terminal does
 * the same on purpose, and a person may simply have the conversation open in a terminal of their own. The tab
 * went on raising its process over all of these the moment anybody wrote into it.
 *
 * **The register is the CLI's, and it is the only witness there is.** Every process it starts - a terminal's
 * and a stream's alike, the panel's own included - writes `sessions/<pid>.json` into its config folder with
 * the conversation's id, its pid and the moment it started, and takes the file away when it ends (seen on
 * 2.1.293: `kind: interactive` for both, `entrypoint` `cli` for a terminal and `sdk-cli` for a stream). A
 * process that was killed leaves its file behind, so a file is only a claim: the pid has to be alive, and has
 * to be the process that wrote it rather than a later one that was given the same number.
 *
 * Only on the machine the IDE runs on. A project inside WSL keeps its register inside the distribution, with
 * pids of a kernel this JVM cannot ask about; there the answer is "nobody known", which is what it was before
 * this existed.
 */
internal object ConversationHolders {

    /** A live process holding a conversation - its pid, and when it came up by its own account. */
    data class Holder(val pid: Long, val startedAt: Long)

    /** One file of the register, read - see [entryOf]. */
    data class Entry(val pid: Long, val conversationId: String, val startedAt: Long, val domain: String)

    /**
     * The live process holding [conversationId], other than the ones in [own], or null when there is none.
     *
     * [own] are the pids this tab's own conversation has raised: a process just taken down for a restart or a
     * move is still alive for a moment after it was told to go, and read as somebody else it would turn every
     * restart into a tab waiting for itself.
     */
    fun holderOf(conversationId: String, home: ClaudeHome, own: Set<Long>): Holder? {
        if (home.remote) return null

        val folder = File(home.configDirectory, REGISTER_FOLDER)
        val files = folder.listFiles { file -> file.isFile && file.name.endsWith(".json") } ?: return null

        return holderAmong(
            files.asSequence().mapNotNull { file -> runCatching { file.readText() }.getOrNull()?.let(::entryOf) },
            conversationId,
            own,
            domain = localDomain(),
            alive = ::startedOf,
        )
    }

    /**
     * The choice itself, apart from the disk and the process table so that a test can hand both in.
     *
     * [alive] answers when the process with that pid started, or null when there is no such process. A
     * holder has to be alive AND be the process its file describes: pids are handed out again, and a file
     * left by a killed CLI would otherwise hold a conversation hostage to whatever happened to get its number.
     */
    fun holderAmong(
        entries: Sequence<Entry>,
        conversationId: String,
        own: Set<Long>,
        domain: String,
        alive: (Long) -> Long?,
    ): Holder? = entries
        .filter { it.conversationId == conversationId && it.pid !in own && it.domain == domain }
        .firstNotNullOfOrNull { entry ->
            val started = alive(entry.pid) ?: return@firstNotNullOfOrNull null
            // Unknown on either side is not evidence of another process: a platform that cannot say when a
            // process started still says it is alive, and that is the stronger fact.
            val same = started <= 0 || entry.startedAt <= 0 || abs(started - entry.startedAt) <= SAME_PROCESS_MS
            if (same) Holder(entry.pid, entry.startedAt) else null
        }

    /** One file of the register, or null when it is not one this can read. */
    fun entryOf(text: String): Entry? = runCatching {
        val json = Json.parseToJsonElement(text) as? JsonObject ?: return null
        val pid = (json["pid"] as? JsonPrimitive)?.longOrNull ?: return null
        val conversationId = (json["sessionId"] as? JsonPrimitive)?.contentOrNull ?: return null
        val startedAt = (json["startedAt"] as? JsonPrimitive)?.longOrNull ?: 0L
        val domain = (json["pidDomain"] as? JsonPrimitive)?.contentOrNull.orEmpty()

        Entry(pid, conversationId, startedAt, domain)
    }.onFailure { thisLogger().info("A file of the CLI's process register could not be read: ${it.message}") }
        .getOrNull()

    /**
     * Whether [pid] is a live process, and when it started - null when it is gone, zero when the platform
     * will not say.
     */
    fun startedOf(pid: Long): Long? {
        val process = ProcessHandle.of(pid).orElse(null) ?: return null
        if (!process.isAlive) return null
        return process.info().startInstant().map { it.toEpochMilli() }.orElse(0L)
    }

    /**
     * The CLI's name for the kernel whose pids a file speaks of - Node's `process.platform`. A file from
     * another one (a distribution's, through a shared folder) names pids this JVM cannot look up.
     */
    private fun localDomain(): String = when {
        HostOs.isWindows -> "win32"
        HostOs.isMac -> "darwin"
        else -> "linux"
    }

    /** The CLI's folder of live processes, inside its config folder. */
    private const val REGISTER_FOLDER = "sessions"

    /**
     * How far the start the CLI wrote down may lie from the one the process table reports and still be the
     * same process. The CLI writes its moment once it is up, a second or two after the kernel's; a pid given
     * again is minutes or days apart.
     */
    private const val SAME_PROCESS_MS = 15_000L
}
