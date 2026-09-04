package io.github.crmapache.amazingclaudecode.claude.accounts

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.thisLogger
import io.github.crmapache.amazingclaudecode.claude.ClaudeAuth
import io.github.crmapache.amazingclaudecode.claude.ClaudeExecutable
import io.github.crmapache.amazingclaudecode.claude.ClaudeHome
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessionHub
import io.github.crmapache.amazingclaudecode.claude.HostOs
import io.github.crmapache.amazingclaudecode.claude.ModelNames
import io.github.crmapache.amazingclaudecode.feedback.DiagnosticsLog
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * The machine's Claude accounts: which ones there are, which one new conversations start on, and the
 * environment a process must be given to run as one of them.
 *
 * Application-level on purpose. Three open projects each run their own sign-in poller and their own
 * usage figures, but the set of accounts is a fact about the machine and the credentials are shared by
 * every IDE on it. A per-project register would let two windows disagree about who is signed in.
 *
 * The mechanism itself - one environment variable, per process, moving the credential drawer and
 * nothing else - is explained in [AccountStore]. What lives here is everything that needs a process, a
 * disk or a service, and one rule that runs through all of it:
 *
 * **A named account that cannot be resolved stops the launch.** It never falls back to the ordinary
 * sign-in. Falling back would work, look normal, answer normally, and bill the wrong subscription
 * without a word - which is the one failure this feature cannot be allowed to have. Everything that
 * resolves an account returns a refusal rather than a default.
 */
@Service(Service.Level.APP)
internal class ClaudeAccounts {

    /** Whether this machine can keep two sign-ins apart at all, and if not, why not. */
    enum class Capability {
        /** Proven here: the variable moved the credential and did not move the folder. */
        SUPPORTED,

        /** The CLI ignored the drawer, or moved more than the credential. Either way: one account only. */
        IGNORED,

        /** A project inside WSL - the CLI runs on the other side of a share. Not in this release. */
        WSL,

        /** Nobody is signed in yet, so there is nothing to keep apart and nothing to probe against. */
        NOT_SIGNED_IN,

        /**
         * The sign-in is an API key or a key helper rather than a Claude subscription. Drawers hold
         * subscription credentials; a key comes from the environment and outranks them.
         */
        API_KEY,
    }

    /** What the accounts screen may say about one row without exercising the credential. */
    enum class Health {
        /** A credential is filed for this drawer. Presence, not validity - see [health]. */
        PRESENT,

        /** Nothing is filed: this account has to be signed in again before it can run a turn. */
        ABSENT,

        UNKNOWN,
    }

    /**
     * How far a sign-in in progress has got - three answers rather than "an account or null".
     *
     * The middle one is the whole reason this is not a nullable: a credential filed in the new drawer
     * while the shared profile still names the previous account looks exactly like a finished sign-in
     * and is the one moment at which believing it destroys an account (see [completeSignIn]).
     */
    sealed interface Landing {
        /** Nothing in the drawer yet - the person is still in the browser. */
        data object NotYet : Landing

        /** The credential is filed, but the name attached to it is still the previous one. */
        data object Unsettled : Landing

        data class Added(val account: AccountsState.Account) : Landing
    }

    private val state: AccountsState get() = AccountsState.getInstance()

    fun list(): List<AccountsState.Account> = state.accounts()

    fun account(id: String): AccountsState.Account? = state.account(id)

    /**
     * Whether this id names an account a conversation may actually be started on.
     *
     * The last line of defence behind the two places that pick a successor (see AccountsState.forget and
     * AccountDesk.logout): a draft left by a sign-in in progress passes every other test - the record is
     * there, the drawer folder is there - and only the credential is missing, so a conversation on it
     * comes up signed out rather than refusing.
     */
    private fun usable(id: String): Boolean = state.account(id)?.isPending == false

    /**
     * Which account a NEW conversation starts on. Empty means the CLI's ordinary sign-in - which is what
     * every machine that never touches this feature has, forever.
     *
     * Writing it MOVES the conversations already open, and that belongs here rather than in the callers.
     * Choosing an account means "everything I do is on this one", and every caller that changed this and
     * forgot to move them left the panel in the one state the feature may not have: the tab in front of
     * the person billed to the account they have just left, while every new tab and every fork starts on
     * the newcomer, with nothing on screen saying so. The first account ever added is exactly that
     * caller - it becomes current by itself, inside a sign-in (see [completeSignIn]), where there is
     * nobody to think of the tabs - and the shape of the bug is what a person sees on the usage rings:
     * two tabs of one project reporting two different subscriptions.
     */
    var currentId: String
        get() = state.current.takeIf { it.isEmpty() || usable(it) }.orEmpty()
        set(value) {
            // Refused rather than written and coerced away later. The getter above answers "" - the CLI's
            // ordinary sign-in - for anything it cannot resolve, so a book left naming a draft or an
            // account another IDE has just forgotten would move every conversation on this machine onto
            // somebody else's subscription with nothing on screen saying so. That is the one thing the
            // rule at the top of this file forbids, and the setter is where it is cheapest to hold.
            if (!canSelect(value)) {
                DiagnosticsLog.note(DiagnosticsLog.ACCOUNTS, "an account that cannot be run was not chosen")
                return
            }

            // The effective answer rather than what the file holds: a book naming a draft already reads
            // as the ordinary sign-in, so choosing "" over it changes nothing and has nothing to move.
            val before = currentId

            state.current = value
            DiagnosticsLog.note(DiagnosticsLog.ACCOUNTS, "the current account changed")
            if (before == value) return

            // Every conversation in every open project, including the projects a phone attached to and no
            // panel ever opened. A conversation cannot be told to change account - the CLI reads its
            // credential once, at start - so each one is replaced over its own transcript (see
            // ClaudeSessions.switchAllTo). Redrawing the screens is the callers' business and stays
            // theirs: it costs a process per account per project, and the one path that has nothing new
            // to ask about is the one where this book was re-read rather than written (see AccountsWatch).
            ClaudeSessionHub.everyHub { it.conversations.switchAllTo() }
        }

    /**
     * Whether this account may be chosen at all.
     *
     * Empty is the CLI's ordinary sign-in and always may. Anything else has to be a record this machine
     * holds AND not a sign-in still in progress: a draft has an empty drawer, so everything moved onto it
     * would come up signed out (see AccountsState.Account.isPending).
     */
    fun canSelect(id: String): Boolean = id.isEmpty() || usable(id)

    /**
     * The person's own name for an account. The default sign-in can be renamed too - it is their account
     * as much as any other - but its label lives apart, because it has no record in the added list.
     */
    fun rename(id: String, alias: String) {
        val trimmed = alias.trim().take(ALIAS_LIMIT)

        // Through the book rather than into the record it hands out: what it hands out is a copy now, and
        // a name written into a copy is a name that is on screen tonight and gone tomorrow (see
        // AccountsState.account).
        if (id.isEmpty()) state.defaultAlias = trimmed else state.rename(id, trimmed)
    }

    /** What the person called the sign-in Claude Code already had, or empty. */
    val defaultAlias: String get() = state.defaultAlias

    /**
     * Who the ordinary sign-in is, as far as it can be told apart from the accounts added here.
     *
     * The CLI answers this question out of `~/.claude.json`, which every drawer shares and which names
     * whoever signed in last - so as soon as an account is added, that answer may be the newcomer's.
     * The way to tell is the addresses we do know: an answer that repeats an added account's address is
     * that account's, not this one's. An answer that repeats nobody is worth remembering, because there
     * is no other moment when this is knowable - and remembered, it survives the next sign-in that spoils
     * the file.
     *
     * An EMPTY answer is not an answer, and saying so is what the remembered one is for. The CLI names
     * nobody often enough - a cold start that did not fit the timeout, a build that does not report the
     * field - and read as "this account has no address" it put the stand-in name over a row whose
     * address was sitting right here.
     */
    fun defaultIdentity(email: String): String {
        if (email.isEmpty()) return state.defaultEmail

        val taken = list().any { it.email.equals(email, ignoreCase = true) }
        if (!taken) {
            state.rememberDefault(email)
            return email
        }

        return state.defaultEmail
    }

    /**
     * Which models an account has said it can run, as its own catalogue last answered.
     *
     * In memory and never on disk: it is what the CLI said a moment ago, not a fact about the person.
     * It exists for one job - deciding whether a model may be carried onto another account (see
     * [canRun]) - and an answer we no longer have is better than one we saved last week.
     */
    private val catalogues = ConcurrentHashMap<String, Set<String>>()

    /**
     * The catalogue as that account itself answered - see ProjectUsage.sendModels.
     *
     * Both spellings of every model are expected here: what the CLI is launched with (`opus`) and what it
     * expands that into (`claude-opus-5`). A transcript signs answers with the second, and the clamp asks
     * this set about it.
     */
    fun noteModels(accountId: String, models: Set<String>) {
        if (models.isEmpty()) return

        catalogues[accountId] = models
    }

    /**
     * Whether this account may run this model - null when nobody has asked it yet.
     *
     * Three answers rather than two, because the difference decides a conversation's fate. The CLI does
     * NOT refuse a model an account has no access to when the process starts: it comes up, reports the
     * model in its own init event, replays the transcript and looks perfectly well - and then dies on
     * the person's first message with an HTTP 404 the panel draws as an answer from Claude, a red error
     * and a crashed process, with nothing anywhere naming the account. Verified against CLI 2.1.257.
     *
     * So a model is carried onto another account only when the answer is a definite yes. Unknown is
     * treated as no: a model quietly replaced by one that works is visible on the chip and costs a
     * click, while the other way round costs a conversation that cannot be used and cannot be explained.
     */
    fun canRun(accountId: String, model: String): Boolean? {
        if (model.isEmpty()) return true

        // By name rather than by string: one model reaches this from three directions under three
        // spellings, and a plain comparison answered "no" about models the account runs perfectly well -
        // a transcript's `claude-opus-5` against a catalogue's `opus` (see ModelNames).
        return catalogues[accountId]?.let { ModelNames.holds(it, model) }
    }

    /** What this account was last left on, so a new tab on it does not launch with another plan's model. */
    fun rememberChoice(id: String, model: String? = null, effort: String? = null) {
        state.rememberChoice(id, model, effort)
    }

    // --- The environment a process runs in ----------------------------------------

    /**
     * The environment for a process that belongs to [accountId], in [workingDirectory].
     *
     * Pure map assembly: no process, no disk beyond one existence check, nothing that blocks. It is
     * called on whatever thread carried the message that started a turn - the relay's thread among them
     * - and a slow answer there stalls every conversation on the line.
     *
     * The working directory is a parameter and not a convenience. The refusal below is per project: a
     * Windows IDE with one local project and one WSL project open must inject the drawer into the
     * former and never into the latter, and a register that answered once for the whole application
     * could not tell them apart. A Windows path handed to a CLI inside the distribution is not an error
     * there - it is a single relative path component, so the credential would be written into a folder
     * inside the person's repository.
     */
    fun environmentFor(
        accountId: String,
        workingDirectory: String?,
        /**
         * A config directory of this process's own - see [AccountStore.usageProbeEnvironment]. Only for
         * the one-off question about usage; a conversation is never launched this way.
         */
        probeConfigDir: String? = null,
    ): AccountStore.Environment {
        val base = ClaudeExecutable.rawEnvironment()

        if (accountId.isEmpty()) {
            return if (probeConfigDir == null) {
                AccountStore.environmentFor(base, storeDir = null)
            } else {
                AccountStore.usageProbeEnvironment(base, storeDir = null, configDir = probeConfigDir)
            }
        }

        val account = state.account(accountId)
            ?: return refuse("no such account")

        if (isRemote(workingDirectory)) return refuse("a project inside WSL cannot carry a drawer")

        val storeDir = account.storeDir

        AccountStore.refusalFor(storeDir)?.let { return refuse(it) }

        // The folder is the drawer. Gone - restored from a backup without it, cleaned up by hand - means
        // the credential is gone with it on the platforms that keep it there, and on macOS it means the
        // keychain item is orphaned. Either way this account cannot run a turn, and saying so is the
        // whole point: the alternative is running it as somebody else.
        if (!File(storeDir).isDirectory) return refuse("the store folder is gone")

        return if (probeConfigDir == null) {
            AccountStore.environmentFor(base, storeDir)
        } else {
            AccountStore.usageProbeEnvironment(base, storeDir, configDir = probeConfigDir)
        }
    }

    /** The map for a process, or null when the account will not resolve and nothing may be started. */
    fun variablesFor(accountId: String, workingDirectory: String?): Map<String, String>? =
        when (val resolved = environmentFor(accountId, workingDirectory)) {
            is AccountStore.Environment.Ready -> resolved.variables
            is AccountStore.Environment.Refused -> null
        }

    /**
     * The map for the one-off question about an account's usage: the same drawer, and a config directory
     * of its own so that the answer cannot be another account's (see [AccountStore.usageProbeEnvironment]).
     *
     * The directory is per account and kept between questions on purpose - a cold one costs the process an
     * extra round before it knows the windows, and the panel would show a blank where a figure was a
     * moment ago.
     */
    fun usageProbeVariables(accountId: String, workingDirectory: String?): Map<String, String>? {
        val directory = usageProbeDirectory(accountId) ?: return null

        return when (val resolved = environmentFor(accountId, workingDirectory, probeConfigDir = directory)) {
            is AccountStore.Environment.Ready -> resolved.variables
            is AccountStore.Environment.Refused -> null
        }
    }

    private fun usageProbeDirectory(accountId: String): String? {
        val directory = usageProbeFolder(accountId) ?: return null

        return runCatching {
            directory.mkdirs()
            directory.takeIf { it.isDirectory }?.absolutePath
        }.getOrNull()
    }

    private fun usageProbeFolder(accountId: String): File? {
        // The id is ours and opaque already, but it also names a folder, so anything that could climb out
        // of one is refused rather than sanitised: there is nothing here worth guessing about.
        if (accountId.any { it == '/' || it == '\\' || it == '.' || it == '\u0000' }) return null

        return File(usageDirectory(), accountId.ifEmpty { DEFAULT_PROBE_NAME })
    }

    /**
     * Who this account really is, as the CLI wrote it down while answering about that account alone.
     *
     * This is the one place the question has a straight answer. `auth status` reads the address out of
     * the file every drawer shares, so after a second sign-in it names whoever went last - two rows on
     * the accounts screen with one address, one of them wrong. A usage question runs with a config
     * directory of its own (see [usageProbeVariables]), and the CLI fills THAT file in with the account
     * whose credential it just used: the ordinary sign-in included, which nothing else can tell us.
     *
     * Null until such a question has been asked and answered, which is what the fallbacks around this
     * are for. Read from disk rather than kept in the state, because the state is where a stale address
     * would live forever.
     */
    fun probedIdentity(accountId: String): AccountIdentity.Who? {
        val file = usageProbeFolder(accountId)?.resolve(".claude.json") ?: return null

        return AccountIdentity.read(file).takeIf { it.isNamed }
    }

    private fun refuse(reason: String): AccountStore.Environment {
        DiagnosticsLog.note(DiagnosticsLog.ACCOUNTS, "an account would not resolve: $reason")
        return AccountStore.Environment.Refused(reason)
    }

    private fun isRemote(workingDirectory: String?): Boolean =
        runCatching { ClaudeHome.of(workingDirectory).remote }.getOrDefault(false)

    // --- Whether this machine can do it at all ------------------------------------

    /**
     * Whether two sign-ins can be kept apart here - proven on this machine, not assumed.
     *
     * The variable this feature rests on is undocumented (see [AccountStore]), so the probe demands both
     * halves of what it is supposed to do and refuses on anything else:
     *
     *  1. the credential MOVED - a drawer we know to be empty answers `loggedIn:false`;
     *  2. the folder did NOT move - `projectsDirectory` is the same as without the drawer.
     *
     * The second half is the one that matters. If a future CLI ever made this variable behave like
     * `CLAUDE_CONFIG_DIR`, the first half would still pass while the person's skills, hooks, MCP
     * servers, settings and entire history quietly split in two. It is also why the field must be
     * PRESENT in both answers: builds up to 2.1.247 do not report it, and two absences compare equal -
     * a proof that passes when there is nothing to prove is not a proof.
     *
     * Cached the way ClaudeExecutable caches its flag answers - by executable path and modification
     * time, so `claude update` re-probes - and never cached negatively for long: a machine that was not
     * signed in five minutes ago may be signed in now.
     */
    fun capability(workingDirectory: String?): Capability {
        if (isRemote(workingDirectory)) return Capability.WSL

        val executable = ClaudeExecutable.find() ?: return Capability.NOT_SIGNED_IN
        val key = keyFor(executable)

        remembered(key)?.let { return it }

        val answer = probe(workingDirectory)
        probed[key] = Probed(answer, System.currentTimeMillis())
        DiagnosticsLog.note(DiagnosticsLog.ACCOUNTS, "the isolation probe answered ${answer.name.lowercase()}")

        return answer
    }

    /**
     * The same answer, but only when it is already known - nothing is started to find it out.
     *
     * [capability] is genuinely expensive: two `auth status` processes with a twenty-second timeout each,
     * and a negative answer deliberately not cached for long, which is precisely the machine where it is
     * asked again and again. Called on the thread carrying the panel's messages that is up to forty
     * seconds in which nothing else is delivered - not a prompt, not an answer to a permission, not a
     * keystroke in the search. So the screen is drawn from what is known and the answer comes with the
     * round that is in the background anyway (see AccountDesk).
     */
    fun capabilityIfKnown(workingDirectory: String?): Capability? {
        if (isRemote(workingDirectory)) return Capability.WSL

        val executable = ClaudeExecutable.find() ?: return Capability.NOT_SIGNED_IN

        return remembered(keyFor(executable))
    }

    private fun keyFor(executable: File): String = "${executable.absolutePath}|${executable.lastModified()}"

    /** The cached answer, unless it is a negative one old enough to be worth asking again. */
    private fun remembered(key: String): Capability? = probed[key]?.let { held ->
        val stale = held.answer != Capability.SUPPORTED && System.currentTimeMillis() - held.at > RETRY_MS

        held.answer.takeUnless { stale }
    }

    private fun probe(workingDirectory: String?): Capability {
        val plain = ClaudeAuth.status(ClaudeExecutable.environment(), workingDirectory)

        if (!plain.loggedIn) return Capability.NOT_SIGNED_IN

        // An API key or a key helper comes out of the environment and outranks any drawer, so a second
        // account here would be a row that cannot be switched to. Note that this machine still answers
        // `claude.ai` when only an unapproved key is present - the isolated run below is what actually
        // catches those, by answering `api_key` where it should have answered nothing.
        if (plain.method.isNotEmpty() && plain.method != SUBSCRIPTION_METHOD) return Capability.API_KEY

        val scratch = probeDirectory()

        val isolated = try {
            when (val environment = AccountStore.environmentFor(ClaudeExecutable.rawEnvironment(), scratch.absolutePath)) {
                is AccountStore.Environment.Ready -> ClaudeAuth.status(environment.variables, workingDirectory)
                is AccountStore.Environment.Refused -> return Capability.IGNORED
            }
        } finally {
            // The CLI makes the folder it is pointed at, and nobody was clearing it away. A negative
            // answer is deliberately re-asked about once a minute - which is the machine this probe
            // exists for - so the leftovers piled up beside the real credential drawers.
            runCatching { scratch.deleteRecursively() }
        }

        val moved = !isolated.loggedIn
        val folderStayed = plain.projectsDirectory.isNotEmpty() &&
            isolated.projectsDirectory.isNotEmpty() &&
            plain.projectsDirectory == isolated.projectsDirectory

        return if (moved && folderStayed) Capability.SUPPORTED else Capability.IGNORED
    }

    // --- Adding, checking and forgetting ------------------------------------------

    /**
     * A drawer for an account that is about to be signed in, and the record that owns it.
     *
     * Written down BEFORE the sign-in rather than after it, which is the opposite of the obvious order
     * and is deliberate. On macOS the credential does not live in the folder at all - it goes into the
     * login keychain - so a sign-in that half-succeeds and is then abandoned would leave a live
     * credential behind with nothing in the plugin pointing at it, and nothing able to clean it up.
     * A record that exists from the first moment is a record [forget] can always act on.
     *
     * The account is unnamed until the sign-in lands; the screen shows it as pending and
     * [completeSignIn] either names it or takes it away.
     */
    fun beginSignIn(): AccountsState.Account? {
        val directory = File(accountsDirectory(), AccountStore.newStoreDirName())

        if (!runCatching { directory.mkdirs() }.getOrDefault(false) && !directory.isDirectory) {
            DiagnosticsLog.note(DiagnosticsLog.ACCOUNTS, "the store folder could not be created")
            return null
        }

        // Owner-only, and it matters off macOS: there the CLI has no keychain to fall back on and writes
        // the credential as a file inside this folder. The CLI sets the file's own mode; the folder is
        // ours to set, and a world-readable parent is the difference between a private file and a
        // discoverable one.
        runCatching {
            directory.setReadable(false, false)
            directory.setWritable(false, false)
            directory.setExecutable(false, false)
            directory.setReadable(true, true)
            directory.setWritable(true, true)
            directory.setExecutable(true, true)
        }

        val pending = AccountsState.Account().apply {
            id = PENDING_PREFIX + AccountStore.newStoreDirName()
            storeDir = directory.absolutePath
            addedAt = System.currentTimeMillis()
        }.also(state::remember)

        // The record has to be ON DISK before a terminal is opened over this drawer. Living only in this
        // IDE's memory it would look perfectly well until the next restart, and what is left then is a
        // drawer - on macOS a live keychain item - that nothing points at and nothing can clean up. That
        // is precisely the orphan this whole "record first, sign-in second" order exists to prevent.
        if (!state.writable) {
            DiagnosticsLog.note(DiagnosticsLog.ACCOUNTS, "the register would not take a new account")
            state.forget(pending.id)
            runCatching { directory.deleteRecursively() }
            return null
        }

        return pending
    }

    /**
     * Whether the sign-in into [pending]'s drawer has landed, and if so, who it was.
     *
     * Asked of the drawer itself rather than read out of the terminal. There is nothing to scrape: the
     * credential never appears on screen, and the only honest question is the one the CLI answers -
     * "is there a credential in this drawer". Call from a background thread; it starts a process.
     *
     * [before] is who the shared file named BEFORE this sign-in was started, and it is what makes the
     * answer safe to believe. The credential and the shared profile are written by two separate steps of
     * the login, so the drawer can be full while `~/.claude.json` still names the previous account - and
     * that answer is not merely unhelpful, it is destructive: the newcomer would be filed under somebody
     * else's address, and an account with that address already on the list would be replaced by it,
     * drawer and keychain item and all. So an answer that has not moved is not an answer yet, and the
     * caller is told to come back ([Landing.Unsettled]) rather than given a name.
     *
     * [insist] is the way out of the one case where it never moves: signing in again as the very account
     * the file already named. The caller allows it after a grace long enough for any write to have
     * happened (see AccountSignIn.SETTLE_MS).
     */
    fun completeSignIn(
        pending: AccountsState.Account,
        workingDirectory: String?,
        before: AccountIdentity.Who,
        insist: Boolean = false,
    ): Landing {
        val variables = variablesFor(pending.id, workingDirectory) ?: return Landing.NotYet
        val status = ClaudeAuth.status(variables, workingDirectory)

        if (!status.loggedIn) return Landing.NotYet

        val who = AccountIdentity.current()
        if (!who.isNamed) return Landing.NotYet

        if (who == before && !insist) {
            DiagnosticsLog.note(DiagnosticsLog.ACCOUNTS, "a sign-in landed before the shared profile moved")
            return Landing.Unsettled
        }

        val id = AccountStore.idOf(who.email, who.orgUuid)

        // Signing in again as an account already on the list replaces it rather than doubling it: the
        // new drawer is the live one. The old record goes, and with it the old drawer.
        val replaced = state.account(id)?.takeIf { it.storeDir != pending.storeDir }
        replaced?.let { discard(it.storeDir) }

        state.forget(pending.id)

        val account = AccountsState.Account().apply {
            this.id = id
            storeDir = pending.storeDir
            email = who.email
            orgUuid = who.orgUuid
            plan = status.plan
            addedAt = pending.addedAt
        }

        state.remember(account)

        // The processes already running as this account are pointing at the drawer just deleted: a
        // credential is read once, at start, so they carry on until the token they hold expires and then
        // fail at a moment nobody connects with a sign-in that happened an hour ago. Raised again over
        // their own transcripts, they read the drawer this sign-in has just filled. Before the line
        // below, so a first account - which has no conversations of its own yet - does not pay for the
        // same raise twice.
        if (replaced != null) ClaudeSessionHub.everyHub { it.conversations.relaunchOn(id) }

        // The first account added becomes the one new conversations start on; a second does not. Signing
        // in to another account is not the same as wanting to work on it.
        //
        // And the conversations already open follow it, exactly as they follow the Select button - the
        // setter sees to that, which is the whole reason it lives there (see [currentId]). This line is
        // the one place a choice is made by the plugin rather than by the person, and it was the one
        // place that used to leave the open tabs behind.
        if (currentId.isEmpty()) currentId = id

        return Landing.Added(account)
    }

    /** A sign-in that never landed: the drawer and its provisional record go away together. */
    fun abandonSignIn(pending: AccountsState.Account) {
        discard(pending.storeDir)
        state.forget(pending.id)
    }

    /**
     * Whether a credential is filed for this account.
     *
     * PRESENCE, not validity, and the difference is worth being honest about on screen: the CLI answers
     * `loggedIn:true` for any credential that parses, including one that expired last month or was
     * revoked from another machine. Telling apart live from dead needs a request that actually spends
     * the credential - which is what asking this account for its usage does, and why the account rows
     * show real figures rather than a green tick.
     *
     * Call from a background thread; it starts a process.
     */
    fun health(id: String, workingDirectory: String?): Health {
        val variables = variablesFor(id, workingDirectory) ?: return Health.UNKNOWN
        val status = ClaudeAuth.status(variables, workingDirectory)

        return when {
            !status.installed -> Health.UNKNOWN
            status.loggedIn -> Health.PRESENT
            else -> Health.ABSENT
        }
    }

    /**
     * Forget an account.
     *
     * Deliberately NOT `claude auth logout` under its drawer: logout revokes the refresh token on
     * Anthropic's side, which signs that account out of every machine the person owns. A button called
     * "Forget" on one IDE may not do that.
     *
     * What it does is drop the record and its pins together (see AccountsState.forget), delete the
     * drawer, and on macOS make a best-effort attempt at the keychain item the CLI filed for it. That
     * last one is best-effort in the honest sense: the service name is reconstructed and the
     * reconstruction is knowingly incomplete for a staging or custom endpoint (see
     * AccountStore.serviceNameFor), so a failed delete never turns into a failed forget. What is left
     * behind in that case is an item no drawer points at - inert, and never read again.
     */
    fun forget(id: String) {
        // The default sign-in is not ours to forget: there is no drawer to delete, and the only thing
        // "forgetting" it could mean is signing the person out of Claude Code altogether.
        if (id.isEmpty()) return

        val account = state.account(id) ?: return

        // The record goes first, the drawer after, and the order is not tidiness: the book is shared by
        // every IDE on this machine, so a drawer deleted before the record is written is a drawer another
        // IDE still has a row for - a row that cannot run a turn and cannot say why.
        state.forget(id)
        discard(account.storeDir)
        DiagnosticsLog.note(DiagnosticsLog.ACCOUNTS, "an account was forgotten")
    }

    private fun discard(storeDir: String) {
        if (AccountStore.refusalFor(storeDir) != null) return

        if (HostOs.isMac) {
            AccountStore.serviceNameFor(storeDir)?.let { service ->
                runCatching {
                    ProcessBuilder("security", "delete-generic-password", "-s", service)
                        .redirectErrorStream(true)
                        .start()
                        .waitFor()
                }.onFailure { thisLogger().info("The keychain item for a forgotten account was left behind") }
            }
        }

        runCatching { File(storeDir).deleteRecursively() }
            .onFailure { thisLogger().info("A forgotten account's store folder could not be removed") }
    }

    /**
     * Where drawers live: beside the plugin's own things, not inside `~/.claude`.
     *
     * Not inside it deliberately - that folder is the CLI's, shared by every account, and this feature's
     * whole premise is that it stays exactly as it was.
     */
    fun accountsDirectory(): File =
        File(File(System.getProperty("user.home"), ".amazing-claude-code"), "accounts")

    /**
     * Where the usage questions keep their own config directories - beside the drawers, never inside
     * `~/.claude`.
     *
     * Nothing of the person's lives here: a few kilobytes of the CLI's own bookkeeping per account, whose
     * only purpose is that the usage cache in it belongs to one account instead of all of them.
     */
    private fun usageDirectory(): File =
        File(File(System.getProperty("user.home"), ".amazing-claude-code"), "usage")

    /**
     * The empty drawer the isolation probe points at - one fixed name, and not among the real ones.
     *
     * One name rather than a fresh one each time, on top of clearing it away afterwards: a probe that
     * runs every minute must not be able to leave a trail even when the delete fails. Two probes at
     * once share it harmlessly - the whole point of it is to be empty, and an empty drawer and a missing
     * one answer the same thing.
     */
    private fun probeDirectory(): File =
        File(File(System.getProperty("user.home"), ".amazing-claude-code"), "probe")

    private class Probed(val answer: Capability, val at: Long)

    private val probed = ConcurrentHashMap<String, Probed>()

    companion object {
        fun getInstance(): ClaudeAccounts = service()

        /** What `authMethod` says for a Claude subscription, the only kind a drawer can hold. */
        private const val SUBSCRIPTION_METHOD = "claude.ai"

        /** A provisional record's id, before the sign-in has said who it is. */
        const val PENDING_PREFIX = "pending-"

        /** The folder name for the sign-in with no drawer of its own - its id is the empty string. */
        private const val DEFAULT_PROBE_NAME = "default"

        private const val ALIAS_LIMIT = 40
        private const val RETRY_MS = 60_000L
    }
}
