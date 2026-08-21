package io.github.crmapache.amazingclaudecode.claude

/**
 * Adding and removing MCP servers is editing a config, not part of a conversation: there is no control
 * request of their own inside a live session, but there are exactly the same `claude mcp ...`
 * subcommands as in a terminal. Routing them through a long-lived dialogue process serves nothing -
 * each call stands on its own and is used once.
 *
 * The status, the sign-in and the reconnect, on the other hand, are asked of the conversation itself:
 * the servers are raised and held by its process, and only it knows their live state (see
 * ClaudeSession.requestMcpStatus).
 */
internal object ClaudeMcp {

    fun add(
        workingDirectory: String?,
        name: String,
        commandOrUrl: String,
        transport: String?,
        onResult: (String) -> Unit,
        onError: (String) -> Unit,
    ) {
        val args = buildList {
            add("mcp")
            add("add")
            if (!transport.isNullOrBlank()) {
                add("--transport")
                add(transport)
            }
            add(name)
            add(commandOrUrl)
        }

        ClaudeCli.run(workingDirectory, args, onError = onError) { output ->
            onResult(output.trim().ifEmpty { "Added $name." })
        }
    }

    fun remove(workingDirectory: String?, name: String, onResult: (String) -> Unit, onError: (String) -> Unit) {
        ClaudeCli.run(workingDirectory, listOf("mcp", "remove", name), onError = onError) { output ->
            onResult(output.trim().ifEmpty { "Removed $name." })
        }
    }
}
