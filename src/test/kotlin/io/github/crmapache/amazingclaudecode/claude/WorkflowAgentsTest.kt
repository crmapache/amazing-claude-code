package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Reading one agent of a workflow off its own transcript.
 *
 * The shapes here are copied from a recorded run (CLI 2.1.226 and 2.1.261 write the same file): a
 * sidechain conversation under `subagents/workflows/<runId>/agent-<agentId>.jsonl`, in the ordinary
 * transcript form. Apart from the disk on purpose - what breaks here is the reading, not the finding.
 */
class WorkflowAgentsTest {

    private fun lines(vararg raw: String) = raw.asSequence()

    @Test
    fun `the errand is the first thing said to the agent, in full`() {
        val transcript = WorkflowAgents.read(
            lines(
                """{"type":"user","message":{"role":"user","content":"## Finder - angle A\n\nReview the checkout."}}""",
                """{"type":"assistant","message":{"content":[{"type":"text","text":"Looking."}]}}""",
                // A tool result comes back as a user message too, and it is not the errand.
                """{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"ok"}]}}""",
            ),
        )

        assertTrue(transcript.found)
        assertEquals("## Finder - angle A\n\nReview the checkout.", transcript.prompt)
    }

    /**
     * An agent given a schema answers through a StructuredOutput call rather than in words - and then
     * that call IS its answer. The report's own `resultPreview` is the first 400 characters of the same
     * JSON, which is why an unfolded line has to reach past it.
     */
    @Test
    fun `a structured answer is the output`() {
        val transcript = WorkflowAgents.read(
            lines(
                """{"type":"user","message":{"role":"user","content":"find bugs"}}""",
                """{"type":"assistant","message":{"content":[{"type":"text","text":"Reading the diff."}]}}""",
                """{"type":"assistant","message":{"content":[{"type":"tool_use","name":"StructuredOutput","input":{"findings":[{"file":"totals.ts"}]}}]}}""",
            ),
        )

        assertEquals("""{"findings":[{"file":"totals.ts"}]}""", transcript.output)
        assertFalse(transcript.truncated)
    }

    /** With no schema the answer is the last thing it said in words. */
    @Test
    fun `without a structured answer the last text wins`() {
        val transcript = WorkflowAgents.read(
            lines(
                """{"type":"user","message":{"role":"user","content":"summarise"}}""",
                """{"type":"assistant","message":{"content":[{"type":"text","text":"first"}]}}""",
                """{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"src/App.tsx"}}]}}""",
                """{"type":"assistant","message":{"content":[{"type":"text","text":"the last word"}]}}""",
            ),
        )

        assertEquals("the last word", transcript.output)
    }

    @Test
    fun `steps name the tool and the one thing worth naming about the call`() {
        val transcript = WorkflowAgents.read(
            lines(
                """{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"src/App.tsx"}}]}}""",
                """{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"git diff --stat","description":"the diff"}}]}}""",
                """{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Glob","input":{}}]}}""",
            ),
        )

        assertEquals(listOf("Read src/App.tsx", "Bash git diff --stat", "Glob"), transcript.steps)
    }

    /** A command written over several lines is one line here: forty of these stand in a column. */
    @Test
    fun `a step keeps to a single line`() {
        val transcript = WorkflowAgents.read(
            lines("""{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"one\ntwo"}}]}}"""),
        )

        assertEquals(listOf("Bash one"), transcript.steps)
    }

    @Test
    fun `an answer past the budget is cut and says so`() {
        val long = "x".repeat(80_000)
        val transcript = WorkflowAgents.read(
            lines("""{"type":"assistant","message":{"content":[{"type":"text","text":"$long"}]}}"""),
        )

        assertTrue(transcript.truncated)
        assertEquals(60_000, transcript.output.length)
    }

    /**
     * The transcript holds lines this reading knows nothing about - attachments, summaries, whatever the
     * CLI adds next - and a file it cannot parse is not a file worth losing an agent over.
     */
    @Test
    fun `unknown and broken lines are simply passed over`() {
        val transcript = WorkflowAgents.read(
            lines(
                """{"type":"attachment","attachment":{"type":"skill_listing"}}""",
                "not json at all",
                """{"type":"user","message":{"role":"user","content":"the errand"}}""",
                """{"type":"assistant","message":{"content":[{"type":"text","text":"done"}]}}""",
            ),
        )

        assertEquals("the errand", transcript.prompt)
        assertEquals("done", transcript.output)
    }
}
