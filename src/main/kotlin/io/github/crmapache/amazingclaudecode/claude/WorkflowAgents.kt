package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.diagnostic.thisLogger
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * What one agent of a workflow actually did.
 *
 * A `Workflow` call is a single task with a fleet behind it - nine agents, forty - and those agents reach
 * the panel by no route at all: not one of their events carries the mark of a subagent, so there is
 * nothing to switch to and no log to follow. The one thing that does arrive is the run's report, and it
 * carries 400 characters of each agent's errand and 400 of its answer (measured on recorded runs: the CLI
 * cuts both to exactly that). For an agent sent to find bugs in the billing code those 400 characters are
 * the opening brace of its JSON - which is the whole reason this exists.
 *
 * The CLI does keep their conversations, only in files of its own rather than in the stream:
 * `<conversation>/subagents/workflows/<runId>/agent-<agentId>.jsonl`, one per agent, in the ordinary
 * transcript shape. That is what is read here, when a line in the card is unfolded and never before.
 *
 * The run's identifier is not asked for: the report does not carry one, and the agent's own is unique
 * anyway - so the file is looked for by name under the conversation. Reading is done off the event
 * thread, like everything else that touches the disk (see ProjectCatalog).
 */
internal object WorkflowAgents {

    /**
     * What was read, in the shape the card draws.
     *
     * [found] false means the file is not there: a run whose files were swept, a conversation opened on
     * another machine. The panel then keeps the report's own previews and says where they came from - a
     * body that simply stays empty reads as a card that broke.
     */
    data class Transcript(
        val found: Boolean,
        val prompt: String = "",
        val steps: List<String> = emptyList(),
        val output: String = "",
        val truncated: Boolean = false,
    )

    /**
     * This project's transcript of the named agent, or "not found".
     *
     * [conversationId] is the tab's own conversation - where its workflows put their agents. Looked into
     * first, and then the project's other conversations: a fleet launched in a conversation continued
     * from the history keeps its files under the identifier it was launched in, which is not the one the
     * tab is resumed by.
     */
    fun of(workingDirectory: String?, conversationId: String?, agentId: String): Transcript {
        val file = fileOf(workingDirectory, conversationId, agentId) ?: return Transcript(found = false)

        return runCatching { file.useLines(block = ::read) }
            .onFailure { thisLogger().warn("Failed to read a workflow agent's transcript", it) }
            .getOrDefault(Transcript(found = false))
    }

    /**
     * The file, hunted by the agent's own name rather than by the run's.
     *
     * The name is the CLI's (a hex string of its own making), so it is checked before it is ever put into
     * a path: a name that arrived from a page and holds a separator would otherwise walk out of the
     * folder it is supposed to be looked for in.
     */
    private fun fileOf(workingDirectory: String?, conversationId: String?, agentId: String): File? {
        if (!agentId.all { it.isLetterOrDigit() || it == '-' || it == '_' }) return null

        val directories = ClaudeHistory.directoriesFor(workingDirectory)
        val ordered = directories.flatMap { project ->
            val own = conversationId?.let { project.resolve(it) }?.takeIf { it.isDirectory }
            // The tab's own conversation first, and the rest only if the file is not there: a project of
            // a working day holds hundreds of conversation folders, and walking all of them is the cost
            // of one press.
            listOfNotNull(own) + (project.listFiles { file -> file.isDirectory } ?: emptyArray()).asList()
        }

        for (conversation in ordered) {
            val workflows = File(conversation, "subagents/workflows")
            val runs = workflows.listFiles { file -> file.isDirectory } ?: continue
            for (run in runs) {
                val file = File(run, "agent-$agentId.jsonl")
                if (file.isFile) return file
            }
        }

        return null
    }

    /**
     * The transcript as the card needs it - apart from the disk, so a test can check it.
     *
     * A lazy sequence rather than a list: an agent of a code review writes hundreds of thousands of
     * characters, most of them tool results nobody is going to read here.
     */
    internal fun read(lines: Sequence<String>): Transcript {
        var prompt = ""
        var output = ""
        val steps = mutableListOf<String>()

        for (line in lines) {
            val payload = parse(line) ?: continue

            when (payload["type"]?.jsonPrimitive?.contentOrNull) {
                // The errand is the first thing said to the agent, and it is said whole - unlike the
                // report's copy of it.
                "user" -> if (prompt.isEmpty()) prompt = textOf(payload)
                "assistant" -> {
                    for (block in blocksOf(payload)) {
                        val kind = block["type"]?.jsonPrimitive?.contentOrNull
                        if (kind == "text") {
                            val text = block["text"]?.jsonPrimitive?.contentOrNull.orEmpty().trim()
                            if (text.isNotEmpty()) output = text
                            continue
                        }
                        if (kind != "tool_use") continue

                        val name = block["name"]?.jsonPrimitive?.contentOrNull.orEmpty()
                        val input = block["input"] as? JsonObject
                        // An agent given a schema answers through this call rather than in words, and
                        // then it IS the answer - the report's own preview is a cut of the same JSON.
                        if (name == STRUCTURED_OUTPUT) {
                            output = input?.toString().orEmpty()
                            continue
                        }
                        if (name.isNotEmpty()) steps.add(stepOf(name, input))
                    }
                }
            }
        }

        return Transcript(
            found = true,
            prompt = cut(prompt, PROMPT_CHARS),
            // The last of them rather than the first: a step is read to see where the agent got to, and a
            // hundred openings tell nothing about that.
            steps = steps.takeLast(MAX_STEPS),
            output = cut(output, OUTPUT_CHARS),
            truncated = output.length > OUTPUT_CHARS,
        )
    }

    /** One tool call as a line: the tool, and the one thing about the call worth naming. */
    private fun stepOf(name: String, input: JsonObject?): String {
        val target = TARGET_FIELDS.firstNotNullOfOrNull { field ->
            (input?.get(field) as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }
        }

        return if (target == null) name else "$name ${cut(target.lineSequence().first(), STEP_CHARS)}"
    }

    /**
     * The text of a message, however the transcript wrote it: a bare string for a short one, a list of
     * blocks for the rest.
     */
    private fun textOf(payload: JsonObject): String {
        val message = payload["message"] as? JsonObject ?: return ""
        (message["content"] as? JsonPrimitive)?.contentOrNull?.let { return it.trim() }

        return blocksOf(payload)
            .mapNotNull { block ->
                block["text"]?.jsonPrimitive?.contentOrNull?.takeIf {
                    block["type"]?.jsonPrimitive?.contentOrNull == "text"
                }
            }
            .joinToString("\n")
            .trim()
    }

    private fun blocksOf(payload: JsonObject): List<JsonObject> {
        val message = payload["message"] as? JsonObject ?: return emptyList()
        val content = message["content"] as? JsonArray ?: return emptyList()

        return content.mapNotNull { it as? JsonObject }
    }

    private fun parse(line: String): JsonObject? =
        if (!line.startsWith("{")) null else runCatching { JSON.parseToJsonElement(line).jsonObject }.getOrNull()

    private fun cut(text: String, max: Int): String = if (text.length <= max) text else text.take(max)

    /** The CLI's own name for the call an agent answers a schema through - see [read]. */
    private const val STRUCTURED_OUTPUT = "StructuredOutput"

    /**
     * What to call a step by, in the order a call is usually recognised: the file, the command, the
     * pattern. Deliberately shallow - the panel has a richer reading of a call (see feed/tools.ts), and
     * this is a label under a fold rather than a card of its own.
     */
    private val TARGET_FIELDS = listOf("file_path", "command", "pattern", "path", "url", "description", "prompt")

    /**
     * The budgets. The errand of a review agent carries the whole list of changed files, the answer of one
     * runs to tens of thousands of characters, and a fleet of forty would hand over megabytes if it were
     * ever read whole - this is read one agent at a time and only when asked, and even then a body nobody
     * scrolls to the end of is not worth the trip into the page.
     */
    private const val PROMPT_CHARS = 8_000
    private const val OUTPUT_CHARS = 60_000
    private const val STEP_CHARS = 160
    private const val MAX_STEPS = 200

    private val JSON = Json { ignoreUnknownKeys = true; isLenient = true }
}
