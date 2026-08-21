package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals

class StreamLinesTest {

    @Test
    fun `assembles a line out of separate chunks`() {
        val lines = collect { it.append("""{"type":"sys"""); it.append("""tem"}""" + "\n") }

        assertEquals(listOf("""{"type":"system"}"""), lines)
    }

    @Test
    fun `takes several lines out of one chunk`() {
        val lines = collect { it.append("{\"a\":1}\n{\"b\":2}\n") }

        assertEquals(listOf("""{"a":1}""", """{"b":2}"""), lines)
    }

    @Test
    fun `does not hand over an unfinished line`() {
        val lines = collect { it.append("{\"a\":1}\n{\"b\":") }

        assertEquals(listOf("""{"a":1}"""), lines)
    }

    @Test
    fun `skips empty lines`() {
        val lines = collect { it.append("\n\n{\"a\":1}\n\n") }

        assertEquals(listOf("""{"a":1}"""), lines)
    }

    @Test
    fun `an unfinished tail does not resurface after a reset`() {
        val lines = collect {
            it.append("{\"a\":")
            it.reset()
            it.append("{\"b\":2}\n")
        }

        assertEquals(listOf("""{"b":2}"""), lines)
    }

    private fun collect(actions: (StreamLines) -> Unit): List<String> {
        val received = mutableListOf<String>()
        actions(StreamLines { received.add(it) })
        return received
    }
}
