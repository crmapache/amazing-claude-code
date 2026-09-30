package io.github.crmapache.amazingclaudecode.usage

import com.intellij.openapi.diagnostic.thisLogger
import java.nio.channels.FileChannel
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.nio.file.StandardOpenOption
import java.security.SecureRandom
import java.util.Base64
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

/**
 * What the usage report remembers between runs: the person's answer, the random identifier, and which
 * days have already gone out as they are now.
 *
 * One file for the whole machine, beside the statistics book (see StatsLedger.directory), and for the
 * same reason as the book: the identifier stands for a machine, and a person who answered the question in
 * WebStorm has answered it for IntelliJ too. Asked in every IDE, the question would be a nag; answered
 * "no" in one and never seen in another, the answer would not be kept.
 *
 * Read afresh before every decision rather than cached, because another IDE may have changed it since -
 * switched the report off, say, which must stop this one sending at its very next chance, not at its next
 * restart. It is a few hundred bytes, read a few times an hour.
 *
 * Changes go through [update] under a lock on a file beside it, so two IDEs saving at the same moment
 * take turns instead of one overwriting the other's answer.
 */
internal class UsageState(private val file: Path) {

    /** The person's answer: not asked yet, yes, or no. */
    enum class Consent(val wire: String) {
        UNKNOWN("unknown"),
        GRANTED("granted"),
        DECLINED("declined"),
        ;

        companion object {
            fun of(text: String?): Consent = entries.firstOrNull { it.wire == text } ?: UNKNOWN
        }
    }

    data class Data(
        val consent: Consent = Consent.UNKNOWN,
        /**
         * The random identifier the reports go under. Made when the person says yes, dropped when they
         * say no - so a yes after a no starts a new identifier with no past, and the old one is on its way
         * to being deleted from the service (see [forget]).
         */
        val id: String = "",
        /** The first calendar day that may be reported: the day of the yes. Nothing from before it goes. */
        val since: String = "",
        /** Each day already sent, with a digest of what was sent - a day is sent again only once it changes. */
        val sent: Map<String, String> = emptyMap(),
        /** When a report was last tried, and when one last went through. */
        val lastAttempt: Long = 0,
        val lastSent: Long = 0,
        /** Identifiers whose reports the service is still to be asked to delete. */
        val forget: List<String> = emptyList(),
    )

    private val lock = Any()

    fun read(): Data = synchronized(lock) { load() }

    /** Change the state: read the file, apply the change, write the result - with every other IDE held off. */
    fun update(change: (Data) -> Data): Data = synchronized(lock) {
        withFileLock {
            val next = change(load())
            save(next)
            next
        }
    }

    private fun load(): Data {
        if (!Files.isRegularFile(file)) return Data()
        val text = runCatching { Files.readString(file, StandardCharsets.UTF_8) }.getOrNull() ?: return Data()
        return decode(text) ?: Data()
    }

    private fun save(data: Data) {
        runCatching {
            Files.createDirectories(file.parent)
            val temporary = file.resolveSibling("${file.fileName}.tmp")
            Files.writeString(temporary, encode(data), StandardCharsets.UTF_8)
            runCatching {
                Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
            }.recover {
                Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING)
            }
        }.onFailure { thisLogger().warn("Could not write the usage report's state (${it::class.simpleName})") }
    }

    /**
     * Hold a lock on a file beside the state for the length of [block]. The lock is the operating system's
     * and spans processes, which is the point: the other IDE is another JVM, and a Kotlin lock means
     * nothing to it. If the lock cannot be taken at all - a read-only folder - the block runs anyway;
     * the worst that follows is one IDE's write landing over the other's, which the next report repairs.
     */
    private fun <T> withFileLock(block: () -> T): T {
        val lockFile = file.resolveSibling("${file.fileName}.lock")
        val channel = runCatching {
            Files.createDirectories(file.parent)
            FileChannel.open(lockFile, StandardOpenOption.CREATE, StandardOpenOption.WRITE)
        }.getOrNull() ?: return block()

        return channel.use {
            val held = runCatching { it.lock() }.getOrNull()
            try {
                block()
            } finally {
                runCatching { held?.release() }
            }
        }
    }

    companion object {
        const val FILE_NAME = "usage-report.json"

        /** Twenty-two characters of URL-safe base64 over sixteen random bytes: derived from nothing. */
        fun newId(): String {
            val bytes = ByteArray(16)
            SecureRandom().nextBytes(bytes)
            return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
        }

        fun encode(data: Data): String = buildJsonObject {
            put("version", 1)
            put("consent", data.consent.wire)
            put("id", data.id)
            put("since", data.since)
            put("sent", buildJsonObject { for ((day, digest) in data.sent) put(day, digest) })
            put("lastAttempt", data.lastAttempt)
            put("lastSent", data.lastSent)
            put("forget", buildJsonArray { data.forget.forEach { add(it) } })
        }.toString()

        fun decode(text: String): Data? {
            val root = runCatching { Json.parseToJsonElement(text) as? JsonObject }.getOrNull() ?: return null
            val string = { name: String -> (root[name] as? JsonPrimitive)?.contentOrNull.orEmpty() }
            val long = { name: String -> (root[name] as? JsonPrimitive)?.longOrNull ?: 0L }

            val sent = (root["sent"] as? JsonObject).orEmpty()
                .mapNotNull { (day, value) -> (value as? JsonPrimitive)?.contentOrNull?.let { day to it } }
                .toMap()
            val forget = runCatching { root["forget"]?.jsonArray }.getOrNull().orEmpty()
                .mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.takeIf { id -> id.isNotBlank() } }

            return Data(
                consent = Consent.of(string("consent")),
                id = string("id"),
                since = string("since"),
                sent = sent,
                lastAttempt = long("lastAttempt"),
                lastSent = long("lastSent"),
                forget = forget,
            )
        }
    }
}
