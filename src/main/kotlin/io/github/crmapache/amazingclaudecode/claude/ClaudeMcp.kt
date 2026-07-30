package io.github.crmapache.amazingclaudecode.claude

internal data class McpServer(
    val name: String,
    val command: String,
    val connected: Boolean,
    val status: String,
)

/**
 * Список, добавление и удаление MCP-серверов — это правки конфига, а не часть
 * разговора: у них нет своего управляющего запроса в живой сессии, зато есть
 * ровно те же подкоманды `claude mcp ...`, что и в терминале. Гонять их через
 * долгоживущий процесс диалога незачем — каждый вызов самостоятельный и разовый.
 *
 * Reconnect/enable/disable сюда не входят: для них в CLI нет отдельной подкоманды
 * вне сессии, только слэш-команда внутри разговора — их шлём обычным промптом.
 */
internal object ClaudeMcp {

    /** "name: command - ✔ Connected" построчно — тот же формат, что печатает сам CLI. */
    private val LINE_PATTERN = Regex("""^(.+?): (.+?) - ([✔✘!⏸]) (.+)$""")

    fun list(workingDirectory: String?, onResult: (List<McpServer>) -> Unit, onError: (String) -> Unit) {
        ClaudeCli.run(workingDirectory, listOf("mcp", "list"), onError = onError) { output -> onResult(parseList(output)) }
    }

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

    private fun parseList(output: String): List<McpServer> =
        output.lines().mapNotNull { line ->
            val match = LINE_PATTERN.find(line.trim()) ?: return@mapNotNull null
            val (name, command, icon, status) = match.destructured
            McpServer(name = name, command = command, connected = icon == "✔", status = status)
        }
}
