package io.github.crmapache.amazingclaudecode.scenario

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * What a run is called in its notification, beside the scenario's name.
 *
 * The same cases as answerLabel's in webview/src/scenarios/runs.test.ts, on purpose: the notification and
 * the row on the phone it leads to have to call a run the same thing.
 */
class AnswerLabelTest {

    @Test
    fun `keeps plain answers as they are`() {
        assertEquals("ACC-12", AnswerLabel.of(mapOf("ticket" to "ACC-12"), 40))
        assertEquals("ACC-12", AnswerLabel.of(linkedMapOf("empty" to "  ", "ticket" to "ACC-12"), 40))
        assertEquals("", AnswerLabel.of(emptyMap(), 40))
    }

    /** Caught on a phone: two Notion pages, and both marks read "https://app.notion.com/p/". */
    @Test
    fun `names a link by the page it points at rather than by its head`() {
        assertEquals("Shopify-checkout-2a3f5c", AnswerLabel.of(mapOf("task" to "https://app.notion.com/p/Shopify-checkout-2a3f5c"), 40))
        assertEquals("Name-cleanup-9b1e07", AnswerLabel.of(mapOf("task" to "https://app.notion.com/p/Name-cleanup-9b1e07"), 40))
    }

    @Test
    fun `keeps what a bare number is a number of`() {
        assertEquals("pull/45", AnswerLabel.of(mapOf("pr" to "https://github.com/crmapache/amazing-claude-code/pull/45"), 40))
        assertEquals("issues/123", AnswerLabel.of(mapOf("issue" to "https://github.com/org/repo/issues/123/"), 40))
    }

    @Test
    fun `reads a segment the way a person would, and drops the query`() {
        assertEquals("План-abc", AnswerLabel.of(mapOf("page" to "https://www.notion.so/team/%D0%9F%D0%BB%D0%B0%D0%BD-abc?pvs=4"), 40))
        assertEquals("PROJ-812", AnswerLabel.of(mapOf("ticket" to "https://acme.atlassian.net/browse/PROJ-812#comment"), 40))
    }

    @Test
    fun `names a link with no path by its host`() {
        assertEquals("example.com", AnswerLabel.of(mapOf("site" to "https://www.example.com/"), 40))
    }

    /** A line that only starts with a link is a sentence about it, and stays one. */
    @Test
    fun `leaves text that merely contains a link alone`() {
        assertEquals("see https://example.com/a for context", AnswerLabel.of(mapOf("note" to "see https://example.com/a for context"), 40))
    }

    @Test
    fun `takes the first line and cuts it to the length asked for`() {
        assertEquals("x".repeat(40), AnswerLabel.of(mapOf("notes" to "${"x".repeat(200)}\nsecond line"), 40))
        assertEquals("Shopify-", AnswerLabel.of(mapOf("page" to "https://app.notion.com/p/Shopify-checkout-2a3f5c"), 8))
    }
}
