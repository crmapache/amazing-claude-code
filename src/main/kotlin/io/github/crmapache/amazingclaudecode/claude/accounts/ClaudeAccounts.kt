package io.github.crmapache.amazingclaudecode.claude.accounts

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.thisLogger
import io.github.crmapache.amazingclaudecode.claude.ClaudeAuth
import io.github.crmapache.amazingclaudecode.claude.ClaudeControlPing
import io.github.crmapache.amazingclaudecode.claude.ClaudeExecutable
import io.github.crmapache.amazingclaudecode.claude.ClaudeHome
import io.github.crmapache.amazingclaudecode.claude.ClaudePreferences
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

        /**
         * No live sign-in anywhere - neither the CLI's own nor any drawer added here - so there is
         * nothing to keep apart and nothing to probe against.
         */
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

        UNKNOWN;

        companion object {
            /**
             * What one `auth status`, asked inside an account's own drawer, says about that drawer.
             *
             * One reading for both askers - the accounts screen's round and the sign-in round (see
             * LatestAnswer) - because two readings of one answer are how the screen and the sign-in gate
             * come to disagree about the same drawer.
             */
            fun of(status: ClaudeAuth.Status): Health = when {
                !status.installed -> UNKNOWN
                status.loggedIn -> PRESENT
                else -> ABSENT
            }
        }
    }

    /** How far a sign-in in progress has got. */
    sealed interface Landing {
        /**
         * Nothing usable in the drawer yet - the person is still in the browser, or the credential is
         * there and has not said whose it is yet (see [identityOf]).
         */
        data object NotYet : Landing

        data class Added(val account: AccountsState.Account) : Landing

        /**
         * The credential landed, and it belongs to the account the CLI's own sign-in already holds.
         *
         * Nothing is added: a second drawer on one subscription is two rows that bill the same place,
         * tell the same figures and silence each other's honest ones (see [AccountTwin]). The drawer
         * just minted goes away with it, which costs the person nothing - the account they signed into
         * is on the screen already, and their credential for it was never touched.
         */
        data object Twin : Landing
    }

    /**
     * What a drawer the register already files under some account turns out to hold, asked of the drawer.
     *
     * Asked before that drawer is deleted as the old half of a repeated sign-in, and the answer is the
     * whole difference between tidying up and destroying an account: the register's label is only what
     * the sign-in was told at the time, and a drawer filed under the wrong address holds the ONLY copy of
     * somebody else's credential on this machine.
     */
    sealed interface Holds {
        /** The account it is filed under - the old half of a repeated sign-in, safe to replace. */
        data object Same : Holds

        /** No credential at all - nothing in it to lose. */
        data object Nobody : Holds

        /** Somebody else - the record was filed under the wrong name, and is filed again under this one. */
        data class Another(val who: AccountIdentity.Who) : Holds

        /** Signed in, but it would not say whose it is. Nothing is deleted on that. */
        data object Unknown : Holds

        companion object {
            /** Pure, so the rule "never delete a drawer holding somebody else" is held by a test. */
            fun of(loggedIn: Boolean, who: AccountIdentity.Who?, filedAs: String): Holds = when {
                !loggedIn -> Nobody
                who == null || !who.isNamed -> Unknown
                who.key == filedAs -> Same
                else -> Another(who)
            }
        }
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

            // What the next tab starts on is part of the same choice and costs one small message rather
            // than a process: a new account brings its own memory of the last pick, and the chip over an
            // empty tab that went on naming the old one's promised a model the launch no longer used
            // (see StartingChoice).
            ClaudeSessionHub.announceNewTabDefaults()
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

        val before = catalogues.put(accountId, models)
        // The clamp reads this, so a first or changed answer about the account in use can change what a
        // new tab starts on - a pinned model the plan turns out not to have (see StartingChoice). Asked at
        // every conversation's birth, so only a catalogue that actually moved is worth telling anybody.
        if (before != models && accountId == currentId) ClaudeSessionHub.announceNewTabDefaults()
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

        // A model somebody added by hand cannot be in any catalogue - the catalogue answers for what
        // Claude Code itself offers, and that list is precisely what this feature exists beside (see
        // ClaudePreferences.customModels). Here the rule above inverts: absence is ignorance rather than
        // a refusal, and the clamp built on it would quietly replace the one model that was chosen on
        // purpose - on the very machine whose provider serves nothing else.
        //
        // By name rather than by string, as below: a conversation resumed from the history asks about
        // the identifier its transcript signs answers with, which need not be the spelling that was
        // typed in. The cost is a name whose family collides with a real one ("opus-legacy") lifting the
        // clamp off that family; adding such a name is saying that this provider serves it.
        if (ClaudePreferences.customModels.any { ModelNames.same(it, model) }) return true

        // By name rather than by string: one model reaches this from three directions under three
        // spellings, and a plain comparison answered "no" about models the account runs perfectly well -
        // a transcript's `claude-opus-5` against a catalogue's `opus` (see ModelNames).
        return catalogues[accountId]?.let { ModelNames.holds(it, model) }
    }

    /** What this account was last left on, so a new tab on it does not launch with another plan's model. */
    fun rememberChoice(id: String, model: String? = null, effort: String? = null) {
        state.rememberChoice(id, model, effort)
    }

    /** Forget a model that has just been taken off the hand-added list - see [AccountsState.forgetModels]. */
    fun forgetModels(names: Set<String>) {
        if (names.isEmpty()) return

        state.forgetModels(names)
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
            is AccountStore.Environment.Ready -> {
                // Whose credential this is gets asked again once a minute rather than once a day, which is
                // how the CLI keeps it (see AccountIdentity). A drawer signed into by somebody else, or an
                // account filed under the wrong name, used to go on showing the previous occupant's address
                // all day - and a screen that names the wrong person is the one place the mistake could
                // have been seen.
                AccountIdentity.expire(File(directory, CONFIG_FILE), IDENTITY_TTL_MS)
                resolved.variables
            }

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
    fun probedIdentity(accountId: String): AccountIdentity.Probed? {
        val file = usageProbeFolder(accountId)?.resolve(CONFIG_FILE) ?: return null

        return AccountIdentity.probe(file)?.takeIf { it.who.isNamed }
    }

    /**
     * Who the credential in this account's drawer belongs to, asked of the credential itself. Null when
     * it would not say. Background only: it waits for a process.
     *
     * The one straight answer there is. The CLI fetches the profile with the credential it was given and
     * writes it into the config file of the directory it runs in, so a directory that lives for this one
     * question can hold nobody else's name - unlike `~/.claude.json`, which every drawer's processes keep
     * rewriting, and unlike the usage question's directory, which keeps its answer between questions (see
     * AccountIdentity). Measured on 2.1.280: the profile is fetched on start, before the first control
     * request is answered, whichever request it is.
     *
     * Asked with [IDENTITY_QUESTION], the handshake every client starts with, rather than the usage
     * question: the usage endpoint turns a caller away after three or four questions in a row, and the
     * figures on the accounts screen are the ones that would go blank for it.
     */
    fun identityOf(accountId: String, workingDirectory: String?): AccountIdentity.Who? {
        // Its own folder every time: two sign-ins at once - two projects, two IDEs - share nothing, and
        // a shared one would hand one of them the other's answer.
        val scratch = File(identityDirectory(), AccountStore.newStoreDirName())

        return try {
            if (!runCatching { scratch.mkdirs() }.getOrDefault(false)) return null

            val environment = environmentFor(accountId, workingDirectory, probeConfigDir = scratch.absolutePath)
            if (environment !is AccountStore.Environment.Ready) return null

            ClaudeControlPing.ask(workingDirectory, IDENTITY_QUESTION, environment.variables) ?: return null

            AccountIdentity.read(File(scratch, CONFIG_FILE)).takeIf { it.isNamed }
        } finally {
            runCatching { scratch.deleteRecursively() }
        }
    }

    /**
     * Whether [from] and [to] are one subscription in two drawers - see [AccountTwin.sameAccount].
     *
     * An added row is the account its record is filed under - which the round keeps honest by filing a
     * mislabelled row again (see AccountDesk). The CLI's own sign-in has no record and is asked instead:
     * its usage question's answer, fresh within [SAME_ACCOUNT_FRESH_MS] rather than after a question of
     * our own - the question is put by whichever IDE is running the merge, and the IDE that follows it
     * through the register (see AccountsWatch) asked nothing; it reads the same file a moment later.
     */
    fun sameAccount(from: String, to: String): Boolean {
        if (from == to) return true

        val freshSince = System.currentTimeMillis() - SAME_ACCOUNT_FRESH_MS
        val keyOf = { id: String ->
            if (id.isEmpty()) AccountTwin.named(probedIdentity(""), freshSince) else state.account(id)?.key
        }

        return AccountTwin.sameAccount(keyOf(from), keyOf(to))
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
     *  1. the credential MOVED - a drawer we know to be empty answers `loggedIn:false` while a live
     *     sign-in answers `loggedIn:true`;
     *  2. the folder did NOT move - `projectsDirectory` is the same as without the drawer.
     *
     * The second half is the one that matters. If a future CLI ever made this variable behave like
     * `CLAUDE_CONFIG_DIR`, the first half would still pass while the person's skills, hooks, MCP
     * servers, settings and entire history quietly split in two. It is also why the field must be
     * PRESENT in both answers: builds up to 2.1.247 do not report it, and two absences compare equal -
     * a proof that passes when there is nothing to prove is not a proof.
     *
     * The live sign-in in the first half is not only the CLI's own. A person who logged out of it and
     * works on accounts added here has none, and a probe leaning on it alone answered "sign in first"
     * beside two working accounts - hiding the Add button on a machine that had plainly proven the
     * mechanism already. So an added drawer stands in for it (see [liveDrawer]), and the verdict itself
     * is [IsolationProof], held by a test.
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
        val reference = plain.takeIf { it.loggedIn } ?: liveDrawer(workingDirectory)

        return IsolationProof.verdict(plain, reference) {
            val scratch = probeDirectory()

            try {
                when (val environment = AccountStore.environmentFor(ClaudeExecutable.rawEnvironment(), scratch.absolutePath)) {
                    is AccountStore.Environment.Ready -> ClaudeAuth.status(environment.variables, workingDirectory)
                    is AccountStore.Environment.Refused -> null
                }
            } finally {
                // The CLI makes the folder it is pointed at, and nobody was clearing it away. A negative
                // answer is deliberately re-asked about once a minute - which is the machine this probe
                // exists for - so the leftovers piled up beside the real credential drawers.
                runCatching { scratch.deleteRecursively() }
            }
        }
    }

    /**
     * The first account added here whose drawer answers signed in, the one in use asked first - for a
     * machine whose CLI's own sign-in is empty.
     *
     * Not a weaker stand-in but the stronger proof: a drawer answering signed in while the plain CLI
     * answers signed out can only happen if the variable chose the drawer. Asked one at a time and only
     * until one answers, because each answer is a process; a draft is skipped, its drawer is empty by
     * definition.
     */
    private fun liveDrawer(workingDirectory: String?): ClaudeAuth.Status? {
        val inUse = currentId

        return list()
            .filterNot { it.isPending }
            .sortedByDescending { it.id == inUse }
            .asSequence()
            .mapNotNull { variablesFor(it.id, workingDirectory) }
            .map { ClaudeAuth.status(it, workingDirectory) }
            .firstOrNull { it.loggedIn }
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
     * "is there a credential in this drawer". Call from a background thread; it starts processes.
     *
     * **Who it was is asked of that credential too** ([identityOf]), and never read out of the file every
     * drawer shares. That file names whoever's process wrote it last, and every open conversation of every
     * account keeps writing it, so in the seconds a sign-in takes it flips between accounts. Read from
     * there, a sign-in was filed under another account's address, sometimes with a delay and a
     * "believe it anyway" to wait the flip out - and the next genuine sign-in of that account then read as
     * a repeated one and deleted the drawer of whoever was really in it.
     */
    fun completeSignIn(pending: AccountsState.Account, workingDirectory: String?): Landing {
        val variables = variablesFor(pending.id, workingDirectory) ?: return Landing.NotYet
        val status = ClaudeAuth.status(variables, workingDirectory)

        // The cheap question first: while the person is in the browser this is all each round costs.
        if (!status.loggedIn) return Landing.NotYet

        val who = identityOf(pending.id, workingDirectory) ?: return Landing.NotYet

        // Signing in as the account the CLI's own sign-in already holds is not an account to add: it is
        // the row at the top of the screen, reached a second way. Refused rather than merged afterwards,
        // because the merge has to delete a drawer and this one has nothing in it the person would miss
        // - their credential for that account is the one they already had (see [AccountTwin]).
        if (holdsTheDefault(who, workingDirectory)) {
            abandonSignIn(pending)
            DiagnosticsLog.note(DiagnosticsLog.ACCOUNTS, "a sign-in named the account the CLI's own holds")
            return Landing.Twin
        }

        // Signing in again as an account already on the list replaces its drawer rather than doubling the
        // row - but only once that drawer has said it holds this account. The register's label is what an
        // earlier sign-in was told, and a label was exactly what used to be wrong: the drawer it names can
        // hold the only copy of somebody else's credential on this machine.
        val held = list().firstOrNull { !it.isPending && it.key == who.key && it.storeDir != pending.storeDir }
        if (held != null) {
            when (val there = whoHolds(held, workingDirectory)) {
                Holds.Same, Holds.Nobody -> return renew(held, pending, status.plan)

                // Filed under the wrong name, so it is filed again under the right one and stays - and the
                // sign-in is added beside it as the account it really is.
                is Holds.Another -> refile(held.id, there.who, workingDirectory)

                // Two rows with one label until the round hears from the old drawer and either files it
                // again or merges the pair (see AccountDesk). Deleting on "it would not say" is how an
                // account is lost.
                Holds.Unknown -> DiagnosticsLog.note(
                    DiagnosticsLog.ACCOUNTS,
                    "a drawer filed under the same account would not say whose it is; kept",
                )
            }
        }

        val account = AccountsState.Account().apply {
            id = AccountStore.newAccountId()
            storeDir = pending.storeDir
            email = who.email
            orgUuid = who.orgUuid
            plan = status.plan
            addedAt = pending.addedAt
        }

        // In one write, so no other IDE ever reads the draft gone and the account not there yet.
        state.replace(pending.id, account)
        dropProbeFolder(pending.id)

        // The first account added becomes the one new conversations start on; a second does not. Signing
        // in to another account is not the same as wanting to work on it.
        //
        // And the conversations already open follow it, exactly as they follow the Select button - the
        // setter sees to that, which is the whole reason it lives there (see [currentId]). This line is
        // the one place a choice is made by the plugin rather than by the person, and it was the one
        // place that used to leave the open tabs behind.
        if (currentId.isEmpty()) currentId = account.id

        return Landing.Added(account)
    }

    /**
     * A repeated sign-in into an account already on the list: the new drawer becomes that record's, and
     * the old one goes.
     *
     * The record stays - its id, its name, the model it was left on - and only the drawer under it changes,
     * so everything pointing at it goes on pointing at the same account.
     */
    private fun renew(held: AccountsState.Account, pending: AccountsState.Account, plan: String): Landing {
        state.renew(held.id, pending.storeDir, plan, draftId = pending.id)
        discard(held.storeDir)
        dropProbeFolder(pending.id)
        // Its usage question's last answer was about the drawer just deleted.
        usageProbeFolder(held.id)?.let { AccountIdentity.expire(File(it, CONFIG_FILE), maxAgeMs = 0L) }

        // The processes already running as this account are pointing at the drawer just deleted: a
        // credential is read once, at start, so they carry on until the token they hold expires and then
        // fail at a moment nobody connects with a sign-in that happened an hour ago. Raised again over
        // their own transcripts, they read the drawer this sign-in has just filled.
        ClaudeSessionHub.everyHub { it.conversations.relaunchOn(held.id) }

        if (currentId.isEmpty()) currentId = held.id

        return Landing.Added(state.account(held.id) ?: held)
    }

    /**
     * Who the drawer of a record really holds - see [Holds]. Background only: up to two processes.
     *
     * A folder that is gone holds nothing this plugin can reach, and reads as [Holds.Nobody].
     */
    private fun whoHolds(held: AccountsState.Account, workingDirectory: String?): Holds {
        val variables = variablesFor(held.id, workingDirectory) ?: return Holds.Nobody
        val loggedIn = ClaudeAuth.status(variables, workingDirectory).loggedIn

        return Holds.of(loggedIn, if (loggedIn) identityOf(held.id, workingDirectory) else null, held.key)
    }

    /**
     * File a record again under the account its drawer really holds. Background only: it asks the drawer
     * for its plan.
     *
     * In place, and that is the point: the id is what the current choice, every open conversation and the
     * figures hold, and the drawer under it does not change - only the name it was filed under was wrong.
     * Nothing moves, nothing is raised again, and nothing is billed differently: it always was this account.
     */
    fun refile(id: String, who: AccountIdentity.Who, workingDirectory: String?) {
        if (!who.isNamed) return

        val plan = variablesFor(id, workingDirectory)
            ?.let { runCatching { ClaudeAuth.status(it, workingDirectory) }.getOrNull() }
            ?.takeIf { it.loggedIn }
            ?.plan

        state.refile(id, who.email, who.orgUuid, plan)
        DiagnosticsLog.note(DiagnosticsLog.ACCOUNTS, "an account filed under the wrong name was filed again")
    }

    /**
     * Whether the account that has just signed in is the one the CLI's own drawer holds - asked of that
     * drawer now, the same way the newcomer was asked.
     *
     * An answer from the ordinary sign-in's credential is also the liveness: a profile is only fetched
     * with a credential that works, so a file naming somebody the person signed out of months ago cannot
     * turn a new account away. A machine-wide fact asked with this project's directory, exactly as the
     * isolation probe asks it.
     */
    private fun holdsTheDefault(who: AccountIdentity.Who, workingDirectory: String?): Boolean =
        identityOf("", workingDirectory)?.key == who.key

    /** A sign-in that never landed: the drawer and its provisional record go away together. */
    fun abandonSignIn(pending: AccountsState.Account) {
        discard(pending.storeDir)
        state.forget(pending.id)
        dropProbeFolder(pending.id)
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

        return Health.of(ClaudeAuth.status(variables, workingDirectory))
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
        dropProbeFolder(id)
        DiagnosticsLog.note(DiagnosticsLog.ACCOUNTS, "an account was forgotten")
    }

    /**
     * The usage question's own config directory for a record that is gone - a draft that landed or was
     * abandoned, an account forgotten. Nothing reads it again, and ids are no longer ever reused, so
     * left behind it is only a folder more per sign-in.
     */
    private fun dropProbeFolder(id: String) {
        runCatching { usageProbeFolder(id)?.deleteRecursively() }
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

    /** Where each identity question gets a config directory for its one question (see [identityOf]). */
    private fun identityDirectory(): File =
        File(File(System.getProperty("user.home"), ".amazing-claude-code"), "identity")

    private class Probed(val answer: Capability, val at: Long)

    private val probed = ConcurrentHashMap<String, Probed>()

    companion object {
        fun getInstance(): ClaudeAccounts = service()

        /** A provisional record's id, before the sign-in has said who it is. */
        const val PENDING_PREFIX = "pending-"

        /** The folder name for the sign-in with no drawer of its own - its id is the empty string. */
        private const val DEFAULT_PROBE_NAME = "default"

        /** The CLI's own config file inside a config directory - see AccountIdentity. */
        private const val CONFIG_FILE = ".claude.json"

        /**
         * How long the usage question may go on answering with a profile it fetched before (see
         * [usageProbeVariables]).
         *
         * As often as the accounts screen asks about health, and no oftener: one more request per account
         * a minute, against the CLI's own once a day. Short enough that a drawer holding somebody else is
         * named truthfully before anybody acts on it, and it is what makes the round's merges and re-filings
         * possible at all - they only go by an answer fetched after they asked.
         */
        private const val IDENTITY_TTL_MS = 60_000L

        /** See [identityOf] for why the handshake rather than the usage question. */
        private const val IDENTITY_QUESTION = "initialize"

        private const val ALIAS_LIMIT = 40
        private const val RETRY_MS = 60_000L

        /**
         * How old the ordinary sign-in's answer may be for [sameAccount] to go by it.
         *
         * The merge acts on an answer seconds old, and the IDE following it reads the file a moment
         * later, so the window is not what makes the rule work - it only keeps a name from last week out
         * of a decision taken now.
         */
        private const val SAME_ACCOUNT_FRESH_MS = 10 * 60 * 1000L
    }
}
