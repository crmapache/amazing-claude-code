package io.github.crmapache.amazingclaudecode.claude

/**
 * Добавление и удаление MCP-серверов — это правки конфига, а не часть разговора:
 * у них нет своего управляющего запроса в живой сессии, зато есть ровно те же
 * подкоманды `claude mcp ...`, что и в терминале. Гонять их через долгоживущий
 * процесс диалога незачем — каждый вызов самостоятельный и разовый.
 *
 * А вот статус, вход и переподключение спрашиваются у самого разговора: серверы
 * поднимает и держит его процесс, и живое их состояние знает только он (см.
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
