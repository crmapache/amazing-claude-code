package io.github.crmapache.amazingclaudecode.remote

/**
 * What a client that is not this IDE is allowed to ask for.
 *
 * A channel that can send a message to the agent is a channel that can run commands on the work
 * machine - the agent has a shell. So the question is not "what should we block" but "what is worth
 * allowing", and the answer is written as a list rather than as a set of exceptions: a list that
 * forgets an entry refuses something harmless, while exceptions that forget one hand a phone the
 * ability to install plugins.
 *
 * Anything not named here is refused, including a message type that does not exist yet. That is the
 * part that actually holds: the protocol grows, and a new kind of message must not become reachable
 * from outside merely because nobody remembered this file. RemoteCommandsTest enforces exactly that -
 * it reads the protocol and fails until every type in it has been decided on here.
 */
internal object RemoteCommands {

    /**
     * Reading the feed needs nothing: it arrives on its own. What is here is what a person does with
     * it - answer, ask, stop, and open a tab to start something new.
     */
    val ALLOWED = setOf(
        // Being caught up on joining. Without it a remote client is a blank screen.
        "ready",
        "prompt",
        /**
         * The same door as "prompt" above and nothing wider: a message said when the agent comes free
         * rather than this second, and taking one back or putting the list in another order.
         *
         * The queue is exactly what a phone needs to be trusted with. A message queued from a sofa used
         * to wait inside that page, and a page in a pocket is thrown out by the browser without warning -
         * so the one thing the button promised was the one thing it could not do (see SessionQueue).
         */
        "queuePrompt",
        "unqueuePrompt",
        "reorderQueue",
        "permissionDecision",
        "planDecision",
        "askAnswer",
        "askDismiss",
        "stop",
        "kill",
        "stopTask",
        /**
         * Starting a conversation of one's own. Confirmed deliberately: a freshly started IDE has no
         * conversations at all, and a phone that cannot open one would show an empty project and be
         * useless precisely when it is wanted. It starts no more than sending a message does - that
         * starts a process too.
         *
         * It carries the model, the effort and the permission mode the conversation is to begin in
         * (see SessionLaunch), and that includes the loose modes - which is a decision, not an
         * oversight. `setMode` below is still refused: the difference is between choosing how a
         * conversation of one's own begins and reaching into one somebody is working in at the desk.
         * The choice applies to that conversation and writes nothing into this machine's settings, so
         * a tab started from a sofa decides nothing about the next one opened at the keyboard.
         */
        /**
         * The project's past conversations, and opening one of them.
         *
         * Reading the list is no more than the channel already carries: it is titles and dates of
         * conversations whose whole contents this device may already ask for. Opening one starts a
         * process with that transcript - the same act as sending a message, which starts one too.
         *
         * A phone opens it in a tab of its own rather than in whichever tab is on screen at the desk
         * (see the mobile client): from across the city there is no telling whether somebody is in the
         * middle of using that one.
         */
        "history",
        // A page further back in a conversation the device may already open in full through
        // "resumeSession" below - reading it a page at a time rather than opening a whole second tab
        // for it is no wider a door.
        "historyPage",
        "resumeSession",
        /**
         * Searching the conversations - the same words "historyPage" already hands out, found rather
         * than paged. The answer is a list of snippets small enough for a relay frame, and nothing about
         * it runs anything: the index is built on this side whether a phone asks or not. The model's
         * search is a `claude -p` with read-only tools inside a folder of plain text (see AiSearch) -
         * the same act as the improve button would be, and narrower than "prompt", which is allowed.
         * Cancelling one is taking back one's own request.
         */
        "search",
        "searchAi",
        "searchCancel",
        "newSession",
        "renameSession",
        /**
         * Dictating from a phone.
         *
         * The one voice message a device may send, and it asks for a token rather than for a
         * microphone: the phone records with its own (a phone in a hand is closer to a mouth than a
         * laptop across the room ever is) and talks to Deepgram directly, so nothing about this reaches
         * the microphone on the work machine - `voiceStart` and the rest stay refused below.
         *
         * What comes back expires in a minute and transcribes only (see VoiceGrant): it cannot read the
         * account, cannot make keys, and is worthless by the time a phone left on a train is opened.
         * The key itself never leaves the keychain. It is refused outright unless voice input has been
         * switched on at the desk and a key left there, so a plugin nobody has configured hands out
         * nothing at all.
         *
         * The audio deliberately does not travel through the relay. A live voice crossing a server whose
         * whole design is that it carries only sealed envelopes would be the one thing it must never
         * carry - and it would arrive late, having gone twice as far.
         */
        "voiceToken",
    )

    /**
     * Named rather than left to fall through, so that the test above can tell "decided against" from
     * "never looked at". The reasons differ and are worth keeping:
     *
     * - `bash`, `setExecutablePath`, `mcpAdd`, `plugin*`, `marketplace*` run or install code on the
     *   work machine outright;
     * - `clipboardRead`/`clipboardWrite`, `pick`, `dropped`, `openExternal`, `openDevTools`, `cursor`
     *   reach for the machine's own surfaces - a phone asking to open a URL on someone's desktop is a
     *   small primitive of remote control;
     * - `setMode`/`setDefaultMode` reach a conversation somebody may be working in at the desk, or
     *   decide what every future one starts in. Choosing how a conversation of one's own begins is a
     *   different act and travels with `newSession` above;
     * - `closeSession` kills a live process, and destroying work from another device is not among the
     *   things a phone is for;
     * - `login`/`logout` open a terminal on that machine and hand it a browser sign-in;
     */
    val DENIED = setOf(
        "bash",
        "closeSession",
        "reorderGroups",
        // The same list, one step finer: the order the tabs at the desk are drawn in, which a phone has
        // no picture of and no reason to rearrange.
        "reorderTabs",
        "setMode",
        "setDefaultMode",
        "setModel",
        "setEffort",
        "setComposerLayout",
        /**
         * How a pasted text behaves in the input field - a machine-wide setting like the layout above,
         * and about the panel on the desk. The phone does not fold pastes at all: it has no clipboard
         * chip to fold them into.
         */
        "setPasteCollapse",
        /**
         * Which key sends a message - the same kind of setting as the two above, and about a keyboard the
         * phone does not have: there a message goes by a button held under the thumb (see sendKey.ts).
         */
        "setSendKey",
        /**
         * The language of the interface, which is a machine-wide setting like the ones above it: the panel
         * on the desk speaks it too, and so do the push notifications this side writes. A phone that could
         * change it would be changing the language of a screen its owner is not looking at.
         *
         * The phone is not left in English by it - it is handed the language in force as a fact of the
         * project (see RemoteFeed) and speaks it without being able to set it.
         */
        "setLanguage",
        /**
         * The sparkle button beside the paperclip and the text it asks by.
         *
         * `setImproveInstructions` writes a machine-wide setting, and belongs with `setDefaultMode` above
         * it for the same reason: a decision about every future press is not one to make from a sofa.
         *
         * `improvePrompt` is refused for a plainer reason - the phone has no such button, and a door is
         * opened when something needs to walk through it, not in advance. On its merits it is a narrow one:
         * a run with no tools, no conversation and nothing written anywhere (see PromptImprover), which is
         * less than `prompt` already grants. When the phone grows the button, this moves up to ALLOWED.
         */
        "improvePrompt",
        "setImproveInstructions",
        "setExecutablePath",
        // Turning remote access on or off, and choosing the relay, are decisions about the channel
        // itself. A device that could make them could also point this IDE at a relay of its own.
        "setRemoteEnabled",
        "setRelayUrl",
        // Pairing is the panel's business alone. A device that could start one, approve one, or revoke
        // another device would be answering the single question it must never answer: whether to trust
        // itself.
        "startPairing",
        "cancelPairing",
        "approvePairing",
        "refusePairing",
        "revokeDevice",
        "revokeAllDevices",
        "refreshUsage",
        "checkAuth",
        "login",
        "logout",
        /*
         * Which Claude account the work is billed to, and the list of them.
         *
         * Denied for three reasons already written into this file. Adding one opens a terminal on that
         * machine and hands it a browser sign-in - `login` and `logout` right above are denied for
         * exactly that, and adding an account is that plus a folder created on somebody's disk. Choosing
         * one decides what every future conversation starts on, which is why `setDefaultMode` and the
         * model family are denied. And forgetting one is a revocation - the same question `revokeDevice`
         * must never let a device answer about itself.
         *
         * The list is not sent outwards either: it carries addresses and organisation names, and the
         * phone is told about a conversation's account by an opaque id at most (see
         * ClaudeSessionHub.sendAccount). `accounts` is deliberately absent from
         * RemoteFeed.PROJECT_FACTS, so the default-deny there keeps it off the wire even though the
         * panel receives it as a project fact.
         */
        "accountList",
        "accountUse",
        "accountAdd",
        "accountCancel",
        "accountForget",
        "accountLogout",
        "accountRename",
        /*
         * Authorizing Claude Design. A terminal and a browser sign-in on somebody's machine, in that
         * account's credential drawer - the same thing `accountAdd` above is denied for, and the phone
         * has no terminal to finish it in either.
         */
        "designLogin",
        "trace",
        "sound",
        "soundSettings",
        "pick",
        "dropped",
        "openDevTools",
        "openExternal",
        /**
         * Opening a file in the editor at the desk. It reaches the machine's own surfaces exactly as
         * `openExternal` above does - a phone asking to raise a file in somebody's IDE is remote control
         * of that IDE - and it names a path, which is the one thing this side deliberately never sends
         * outwards (see RemoteFeed).
         */
        "openFile",
        "cursor",
        "clipboardRead",
        "clipboardWrite",
        // A report that a batch did not survive the trip into an embedded browser. It describes the road
        // between this IDE and its own panel, and a device across the network has no such road to speak
        // about - it is handled by the window itself in any case (see ClaudePanel).
        "channelLoss",
        // Writing a file onto the machine at the asking of whoever is on the line. The picture itself is
        // harmless; a message that makes the IDE write files is not, and the statistics tab it comes from
        // is the panel's alone anyway.
        "saveImage",
        // The same, for anything pasted into the panel: it writes a file on this machine, and the path it
        // answers with names a folder on it. A phone attaches its pictures through its own screen and
        // needs no file of ours to point at.
        "savePastedFile",
        /*
         * Feedback. Every one of these is refused, and for a different reason each:
         *
         * - feedbackAttach opens a file dialog on the work machine and reads what is chosen;
         * - feedbackSend posts those files, and a report about this machine, to a server;
         * - feedbackReport builds that report out of a conversation's journal, which is the conversation;
         * - feedbackOpen and feedbackDetach are harmless on their own and are refused with the rest, so
         *   that the screen is one thing rather than a screen with a reachable edge.
         *
         * They are handled by the panel's own window in any case (see ClaudePanel), which a remote client
         * never reaches - this list says so out loud rather than relying on that.
         */
        "feedbackOpen",
        "feedbackReport",
        "feedbackAttach",
        "feedbackDetach",
        "feedbackSend",
        /*
         * Voice input, refused whole (see VoiceDesk).
         *
         * The microphone belongs to the machine with the IDE on it, and a message that opens it from
         * across the network is a listening device, whatever it was meant for. The settings around it are
         * refused for the reasons their neighbours above are: the key is a secret in this machine's
         * keychain, and the hotkeys are decided at the keyboard they will be pressed on.
         *
         * The words themselves need nothing here: a dictation ends as an ordinary draft in the input
         * field, and what is done with it travels as `prompt` like anything else somebody typed.
         */
        "voiceStart",
        "voiceStop",
        "voiceCancel",
        "voiceConfig",
        "voiceEnabled",
        "voiceLanguage",
        "voiceDevice",
        "voiceKey",
        "voiceBalance",
        "voiceCaptureHotkey",
        "voiceStopCapture",
        "voiceClearHotkey",
        "mcpList",
        "mcpAdd",
        "mcpRemove",
        "mcpReconnect",
        "mcpAuthenticate",
        "pluginList",
        "pluginInstall",
        "pluginUninstall",
        "pluginEnable",
        "pluginDisable",
        "marketplaceList",
        "marketplaceAdd",
        "marketplaceRemove",
        // The statistics are about the whole machine - every project by name, the phones paired, the
        // hours kept - and the tab that shows them lives in the panel alone. A phone neither reads the
        // book nor writes into it: what it does is counted on this side, where it is seen arriving.
        "statistics",
        "stat",
    )

    /**
     * Whether a remote client may ask for this.
     *
     * Deliberately not "is it in DENIED": an unknown type is refused as well. The two lists exist so
     * that a new message has to be thought about, not so that one of them can be consulted.
     */
    fun allows(type: String): Boolean = type in ALLOWED

    /**
     * Whether the payload is allowed as well as the type.
     *
     * "Always allow" is not an answer to a question - it writes a permanent rule into the machine's
     * settings, and the agent's reach grows by it for good. Granting that from a sofa is a different
     * act from unblocking one step, so a remote "always" is served as a plain "once" and the client is
     * told why.
     */
    fun soften(type: String, decision: String): String =
        if (type == "permissionDecision" && decision == "always") "once" else decision
}
