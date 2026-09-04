package io.github.crmapache.amazingclaudecode.claude.accounts

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.thisLogger
import io.github.crmapache.amazingclaudecode.feedback.DiagnosticsLog
import java.io.File
import java.io.RandomAccessFile
import java.nio.channels.FileLock
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/**
 * The accounts this machine knows about and which one everything runs on.
 *
 * **One book for the whole machine, not for one IDE.** It lives in a file beside the credential drawers
 * it maps (`~/.amazing-claude-code/`), so WebStorm and IntelliJ open the same list and answer the same
 * "which account am I working on" - the shape the statistics already have (see StatsLedger), and for a
 * stronger reason: the drawers are shared whatever this file says, so a per-IDE list meant one IDE
 * holding the only pointer to a credential the other could not see.
 *
 * **Deliberately NOT a PersistentStateComponent any more.** With `@State` still on it the platform would
 * call `loadState` with the IDE's own XML right after this constructor read the shared file, and the
 * register would silently split again with nothing to show for it. RemoteState keeps its own `@State` on
 * the same XML; nothing here touches that.
 *
 * **No secret is here, and there is none anywhere else in the plugin either.** A record holds a label, an
 * address, an organisation and the name of a credential drawer; the credential itself is the CLI's, filed
 * by the CLI in the system's own store. That is a property of the mechanism rather than discipline on our
 * part - see [AccountStore].
 *
 * Reads answer out of memory and never touch the disk: `currentId` is asked on the relay's thread and on
 * the one that carries the panel's messages, and a file read there stalls every conversation on the line.
 * What keeps memory honest is [reload], called by [AccountsWatch] every couple of seconds.
 */
@Service(Service.Level.APP)
internal class AccountsState(private val file: Path) {

    /** The platform's own way in: the book lives where every IDE on this machine can find it. */
    @Suppress("unused")
    constructor() : this(bookPath())

    class Data {
        var accounts: MutableList<Account> = mutableListOf()

        /** Which account everything runs on. Empty means the CLI's own ordinary sign-in. */
        var current: String = ""

        /**
         * The person's own name for the sign-in Claude Code already had - the one with no drawer of its
         * own, which every machine has before this feature is touched.
         *
         * Kept apart from [accounts] because that list is what this panel ADDED: the default sign-in is
         * the CLI's, it has no store folder, and it cannot be forgotten from here. Only its label is
         * ours to keep.
         */
        var defaultAlias: String = ""

        /**
         * Who the CLI's ordinary sign-in belongs to, as last learned while that answer could be trusted.
         *
         * Kept because the answer stops being trustworthy the moment a second account is added. The CLI
         * reads the address out of `~/.claude.json`, and that file is shared by every drawer: it names
         * whoever signed in last, so after adding an account the ordinary sign-in starts introducing
         * itself with the newcomer's address - two rows with one address, one of them wrong.
         */
        var defaultEmail: String = ""

        fun copy(): Data = Data().also {
            it.accounts = accounts.mapTo(mutableListOf()) { account -> account.copy() }
            it.current = current
            it.defaultAlias = defaultAlias
            it.defaultEmail = defaultEmail
        }
    }

    class Account {
        /** [AccountStore.idOf] over the address and the organisation. */
        var id: String = ""

        /**
         * The credential drawer, absolute. Minted once and never renamed - on macOS the keychain service
         * name is a hash of this literal string, so a rename orphans a live credential.
         */
        var storeDir: String = ""

        /**
         * The person's own name for it - "Work", "Home". Empty means none was given, and then the panel
         * shows the address instead.
         *
         * The reason it exists: an address identifies an account to Anthropic and says nothing about
         * what it is FOR. Two addresses at the same company differ by a word the person knows and the
         * machine does not.
         */
        var alias: String = ""

        var email: String = ""

        var orgUuid: String = ""

        /** `max`, `pro`, `team` - as the CLI names it. Data, never translated. */
        var plan: String = ""

        var addedAt: Long = 0

        /**
         * The model and effort this account was last left on.
         *
         * Kept per account rather than machine-wide because the machine-wide default is written on every
         * successful pick: choose Opus on a Max account, open a tab on a Pro account, and it would launch
         * with a flag that account's plan does not have. Empty means "whatever the machine's default is",
         * which is what an account nobody has chosen for gets.
         *
         * Machine-wide along with the rest of this book, and that is a decision rather than an oversight:
         * what an account was last left on is a fact about the account, and a person moving between two
         * IDEs on one machine means the same thing by it in both. Their fallback, ClaudePreferences,
         * stays each IDE's own - which is right for the opposite reason: that one is "what a new tab
         * starts on here".
         */
        var model: String = ""

        var effort: String = ""

        /**
         * A record made for a sign-in that has not landed yet - see ClaudeAccounts.beginSignIn.
         *
         * It exists from before the sign-in on purpose, and it is a draft rather than an account: its
         * drawer is empty, so anything started under it comes up signed out. Everything that PICKS an
         * account has to say so out loud, because every check a real account passes it passes too - the
         * record is there, the folder is there, and only the credential is missing.
         */
        val isPending: Boolean get() = id.startsWith(ClaudeAccounts.PENDING_PREFIX)

        fun copy(): Account = Account().also {
            it.id = id
            it.storeDir = storeDir
            it.alias = alias
            it.email = email
            it.orgUuid = orgUuid
            it.plan = plan
            it.addedAt = addedAt
            it.model = model
            it.effort = effort
        }
    }

    /** What a re-read found, so the watcher knows how far the news has to travel. */
    data class Reloaded(val changed: Boolean, val currentChanged: Boolean)

    private val lock = Any()

    private var data = Data()

    /** The text last written or read - what tells a file another IDE changed from one that is ours. */
    private var lastSeen = ""

    /** The file's stamp as of the last look, so the poll costs one `stat` and nothing else. */
    private var lastStamp = ""

    init {
        synchronized(lock) { readInto() }
    }

    // --- Reading, out of memory and never off the disk -----------------------------

    fun accounts(): List<Account> = synchronized(lock) { data.accounts.map { it.copy() } }

    /**
     * One account, as a COPY.
     *
     * A copy rather than the record itself, because the record is no longer a bean the platform
     * serialises at shutdown: written through, a rename or a model would change what is on screen and
     * never reach the file at all - the classic silent persistence loss, invisible until the next day.
     * Every change goes through a method on this class.
     */
    fun account(id: String): Account? = synchronized(lock) { data.accounts.firstOrNull { it.id == id }?.copy() }

    var current: String
        get() = synchronized(lock) { data.current }
        set(value) = update { it.current = value }

    /** The person's own name for the sign-in Claude Code already had - see [Data.defaultAlias]. */
    var defaultAlias: String
        get() = synchronized(lock) { data.defaultAlias }
        set(value) = update { it.defaultAlias = value }

    val defaultEmail: String get() = synchronized(lock) { data.defaultEmail }

    // --- Changing it ----------------------------------------------------------------

    /** Remember who the ordinary sign-in is, from an answer that could still be trusted. */
    fun rememberDefault(email: String) {
        if (email.isEmpty()) return

        update { if (it.defaultEmail != email) it.defaultEmail = email }
    }

    fun remember(account: Account) = update { held ->
        held.accounts.removeIf { it.id == account.id }
        held.accounts.add(account.copy())
    }

    fun forget(id: String) = update { held ->
        held.accounts.removeIf { it.id == id }

        // Never onto a draft: a sign-in still in progress would become the account everything runs on,
        // and every conversation on it would come up in an empty drawer. Nothing left to move to is the
        // CLI's ordinary sign-in, which is where this began.
        if (held.current == id) held.current = held.accounts.firstOrNull { !it.isPending }?.id.orEmpty()
    }

    /** The person's own word for an account, written where it survives a restart. */
    fun rename(id: String, alias: String) = update { held ->
        held.accounts.firstOrNull { it.id == id }?.alias = alias
    }

    /** What this account was last left on - see [Account.model]. */
    fun rememberChoice(id: String, model: String?, effort: String?) = update { held ->
        held.accounts.firstOrNull { it.id == id }?.let { account ->
            model?.let { account.model = it }
            effort?.let { account.effort = it }
        }
    }

    /**
     * Every change goes through here: read what is on the disk NOW, apply, write it back.
     *
     * Read-modify-write rather than a merge of two snapshots, and the difference is not academic. The
     * statistics may be merged field by field because every figure there only ever grows; this book's
     * fields are a pointer that gets REPLACED and records that get REMOVED. A merge would resurrect an
     * account another IDE has just forgotten - its drawer already deleted - as a row that cannot run a
     * turn, and would give `current` no ordering at all, so the loser of a race would silently decide
     * whose subscription pays. Applied to what the file says a moment ago, the last human click wins and
     * nothing needs a tombstone.
     *
     * A write that fails leaves memory as it is and says so by its exception's CLASS only: the message of
     * a file error IS the path, and this path names the person (see StatsLedger for the same rule).
     */
    private fun update(change: (Data) -> Unit) {
        val wrote = synchronized(lock) {
            val done = withFileLock {
                readInto()

                // Applied to a COPY, and memory takes it only once the disk has. The other way round -
                // change first, write after - leaves this IDE believing a switch that never landed: the
                // file still names the previous account, the stamp never moves so nothing re-reads, and
                // the next write that DOES succeed re-reads the file first and silently puts the old
                // account back, mid-session, with no redraw and no move. That is the wrong subscription
                // paying, quietly, which is the one failure this feature may not have.
                val next = data.copy().also(change)
                val text = encode(next)

                // Nothing moved. The common case, because the guards live inside the callers' lambdas -
                // and a write here would cost a cross-process lock, a rewritten file, and a re-read in
                // every other IDE on this machine for news that is not news.
                if (text != lastSeen) {
                    write(text)
                    data = next
                    lastSeen = text
                }
            }

            failed = !done
            done
        }

        if (!wrote) DiagnosticsLog.note(DiagnosticsLog.ACCOUNTS, "the account register could not be written")
    }

    // --- Keeping memory honest ------------------------------------------------------

    /**
     * Re-read the file if another IDE has touched it. Background only - see [AccountsWatch].
     *
     * The cheap half first: a file's stamp is one `stat`, and nothing on this machine changes this file
     * more than a few times a day. Only a changed stamp costs a read, and only text we have not seen
     * before costs a decode - so an IDE writing and then re-reading its own change announces nothing.
     */
    fun reload(): Reloaded = synchronized(lock) {
        if (stampOf() == lastStamp) return Reloaded(changed = false, currentChanged = false)

        val before = data.current
        val accountsBefore = data.accounts.size
        val seen = lastSeen

        val text = readInto() ?: return Reloaded(changed = false, currentChanged = false)
        if (text == seen) return Reloaded(changed = false, currentChanged = false)

        Reloaded(
            changed = true,
            // The size is a coarse test on purpose: what the panels do about it is redraw a list, and a
            // rename that slips through until the next natural round costs nobody anything.
            currentChanged = data.current != before || data.accounts.size != accountsBefore,
        )
    }

    /**
     * Whether the last change reached the disk.
     *
     * Asked before a sign-in is begun, and that is the one place it matters. A record that lives only in
     * this IDE's memory looks perfectly well until the next restart, and what is left then is a credential
     * drawer - on macOS a live keychain item - that nothing in the plugin points at and nothing can ever
     * clean up. Everything else carries on from memory quite happily.
     */
    val writable: Boolean get() = synchronized(lock) { !failed }

    private var failed = false

    // --- The file itself -------------------------------------------------------------

    /** Under [lock] already. Returns the text it read, or null when there was nothing to read. */
    private fun readInto(): String? {
        val stamp = stampOf()

        val read = runCatching {
            if (Files.isRegularFile(file)) Files.readString(file, StandardCharsets.UTF_8) else null
        }.onFailure { thisLogger().warn("The account register could not be read") }

        // The stamp is only written down when the file was genuinely read. Written down regardless, a
        // read that FAILED - a lock held by a backup agent, a home directory not yet mounted - would
        // teach the poll that this version of the file has been seen, and the person's accounts would
        // stay missing for the life of the IDE while everything ran on the ordinary sign-in.
        if (read.isFailure) return null
        lastStamp = stamp

        val text = read.getOrNull() ?: return null

        val decoded = decode(text)
        if (decoded == null) {
            /*
             * Not ours to understand - half-written by something that is not this plugin, or damaged.
             *
             * It is kept aside rather than overwritten, and what starts instead is empty. That is the
             * safe end of a bad choice: an empty book means everything runs on the CLI's ordinary
             * sign-in, which is visible on the screen and bills nobody by surprise, and the drawers on
             * disk are untouched - the accounts come back by being added again. Overwriting would have
             * destroyed the only mapping from an account to its drawer, and the drawer names are random.
             */
            thisLogger().warn("The account register could not be understood; keeping it aside")
            DiagnosticsLog.note(DiagnosticsLog.ACCOUNTS, "the account register could not be understood")
            runCatching { Files.move(file, file.resolveSibling("$FILE_NAME.broken-${System.currentTimeMillis()}")) }
            lastStamp = stampOf()
            return null
        }

        data = decoded
        lastSeen = text
        return text
    }

    private fun stampOf(): String = runCatching {
        if (!Files.isRegularFile(file)) return@runCatching ""
        val attributes = Files.readAttributes(file, java.nio.file.attribute.BasicFileAttributes::class.java)
        "${attributes.lastModifiedTime().toMillis()}:${attributes.size()}"
    }.getOrDefault("")

    private fun write(text: String) {
        Files.createDirectories(file.parent)
        val temporary = file.resolveSibling("$FILE_NAME.tmp")
        Files.write(temporary, text.toByteArray(StandardCharsets.UTF_8))
        runCatching {
            Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        }.recover {
            Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING)
        }.getOrThrow()
        lastStamp = stampOf()
    }

    /**
     * A lock the other IDE can see, around the whole read-modify-write.
     *
     * The atomic rename alone is not enough: it makes each write whole, not each pair of writes ordered,
     * and two IDEs both reading "no accounts" and both adding one would end with one of the two gone -
     * along with the only pointer to its credential drawer.
     *
     * Where the filesystem refuses to lock at all - some network mounts do - the work still happens: a
     * lost race costs one change, and refusing to write would cost the account somebody just added.
     */
    private fun withFileLock(work: () -> Unit): Boolean {
        runCatching { Files.createDirectories(file.parent) }

        var held: FileLock? = null
        val channel = runCatching { RandomAccessFile(file.resolveSibling("$FILE_NAME.lock").toFile(), "rw").channel }
            .getOrNull()

        return try {
            held = channel?.let { runCatching { it.lock() }.getOrNull() }
            runCatching { work() }
                .onFailure { thisLogger().warn("The account register was not written (${it::class.simpleName})") }
                .isSuccess
        } finally {
            runCatching { held?.release() }
            runCatching { channel?.close() }
        }
    }

    // --- The shape on disk -----------------------------------------------------------

    private fun encode(data: Data): String = buildJsonObject {
        put("version", VERSION)
        put("current", data.current)
        put("defaultAlias", data.defaultAlias)
        put("defaultEmail", data.defaultEmail)
        putJsonArray("accounts") {
            data.accounts.forEach { account ->
                addJsonObject {
                    put("id", account.id)
                    put("storeDir", account.storeDir)
                    put("alias", account.alias)
                    put("email", account.email)
                    put("orgUuid", account.orgUuid)
                    put("plan", account.plan)
                    put("addedAt", account.addedAt)
                    put("model", account.model)
                    put("effort", account.effort)
                }
            }
        }
    }.toString()

    /** Null when this is not a book at all. A field this version does not know is read as its default. */
    private fun decode(text: String): Data? {
        val root = runCatching { Json.parseToJsonElement(text) as? JsonObject }.getOrNull() ?: return null
        val list = runCatching { root["accounts"]?.jsonArray }.getOrNull() ?: return null

        val decoded = Data()
        decoded.current = root.text("current")
        decoded.defaultAlias = root.text("defaultAlias")
        decoded.defaultEmail = root.text("defaultEmail")

        for (element in list) {
            val one = element as? JsonObject ?: continue
            val id = one.text("id")
            if (id.isEmpty()) continue

            decoded.accounts.add(
                Account().apply {
                    this.id = id
                    storeDir = one.text("storeDir")
                    alias = one.text("alias")
                    email = one.text("email")
                    orgUuid = one.text("orgUuid")
                    plan = one.text("plan")
                    addedAt = one["addedAt"]?.jsonPrimitive?.longOrNull ?: 0L
                    model = one.text("model")
                    effort = one.text("effort")
                },
            )
        }

        return decoded
    }

    private fun JsonObject.text(name: String): String = this[name]?.jsonPrimitive?.contentOrNull.orEmpty()

    companion object {
        fun getInstance(): AccountsState = service()

        const val FILE_NAME = "accounts.json"

        private const val VERSION = 1

        /**
         * Where the book lives: beside the credential drawers it maps, not inside any IDE's own
         * configuration.
         *
         * `~/.amazing-claude-code` rather than the platform's shared data path, and the drawers are the
         * reason - the file is a mapping from an account to a folder in that very directory, and is
         * worth nothing without it. It is also unambiguously one folder per machine, with no per-product
         * fallback to get wrong.
         */
        fun directory(): File = File(System.getProperty("user.home"), ".amazing-claude-code")

        /**
         * A test keeps its book to itself. StatsLedger says why for the figures; here it is stronger - a
         * fixture that tidies up after itself would delete the person's real accounts, and the record is
         * the ONLY mapping from an account to its drawer, whose name is random. What would survive is
         * orphan folders and orphan keychain items that nothing can ever clean up.
         */
        private val testDirectory: Path by lazy { Files.createTempDirectory("acc-accounts") }

        private fun directoryPath(): Path =
            if (ApplicationManager.getApplication()?.isUnitTestMode == true) testDirectory else directory().toPath()

        private fun bookPath(): Path = directoryPath().resolve(FILE_NAME)
    }
}
