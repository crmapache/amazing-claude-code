package io.github.crmapache.amazingclaudecode.claude

/**
 * Someone watching this project's conversations.
 *
 * Until now there was exactly one such watcher and it had no name: the panel's embedded browser, which
 * everything was sent to directly (see ClaudePanel's webview.send). Naming it turns "send" into
 * "send to everyone" - and that is the whole of what a phone needs from this side.
 *
 * Messages arrive in batches rather than one at a time on purpose. On joining, a client is handed the
 * whole of what it missed at once, and a batch lets whoever delivers it decide how to pace that: the
 * browser's channel already coalesces a frame's worth into one call and cuts oversized ones into
 * pieces (see WebviewHost), and it should keep doing that rather than have a second such layer built
 * over it here.
 */
internal interface SessionClient {

    val id: String

    fun deliver(messages: List<String>)

    /**
     * An answer to something this client asked for - the list of past conversations, a command's output
     * (see [ClaudeSessionHub.emitTo]).
     *
     * Apart from [deliver] because the two have different addresses behind them, and only for one
     * client so far: behind the relay's client sit several devices, and what it forwards is decided by
     * what each of them is watching. An answer is not part of any conversation, so that rule leaves it
     * nowhere to go - a phone asking for the history of a project it was not already watching waited
     * forever for a list that had been built and dropped.
     */
    fun answer(messages: List<String>) = deliver(messages)

    /**
     * Whether this client is the IDE itself.
     *
     * Not "is it on this machine": a browser page open beside the IDE is on the same machine and is
     * still not the IDE. What it may ask for is the remote list (see RemoteCommands), and having it
     * play by those rules from phase 1 is the point - the restrictions get exercised months before
     * there is a phone to exercise them.
     */
    val isLocal: Boolean
        get() = false
}

/**
 * Putting the journal's marks onto a message.
 *
 * The number and the time travel inside the message rather than beside it because they have to survive
 * everything the message survives: a browser's batching, a relay's envelope, a reconnect. A client
 * comes back saying "I have everything up to N" and the number it names is the one it read here.
 *
 * The stamping is textual rather than a parse-and-rebuild: this runs on every message of every
 * conversation, and all of them are objects we have just built ourselves - there is nothing to
 * discover in them by parsing.
 */
internal object SessionMessages {

    fun stamp(json: String, seq: Long, at: Long): String {
        if (!json.startsWith("{")) return json

        val separator = if (json.length > 2) "," else ""
        return """{"seq":$seq,"at":$at$separator${json.substring(1)}"""
    }
}
