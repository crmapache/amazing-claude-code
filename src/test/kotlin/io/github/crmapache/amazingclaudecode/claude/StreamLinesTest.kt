package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals

class StreamLinesTest {

    @Test
    fun `собирает строку из отдельных кусков`() {
        val lines = collect { it.append("""{"type":"sys"""); it.append("""tem"}""" + "\n") }

        assertEquals(listOf("""{"type":"system"}"""), lines)
    }

    @Test
    fun `разбирает несколько строк из одного куска`() {
        val lines = collect { it.append("{\"a\":1}\n{\"b\":2}\n") }

        assertEquals(listOf("""{"a":1}""", """{"b":2}"""), lines)
    }

    @Test
    fun `не отдаёт незавершённую строку`() {
        val lines = collect { it.append("{\"a\":1}\n{\"b\":") }

        assertEquals(listOf("""{"a":1}"""), lines)
    }

    @Test
    fun `пропускает пустые строки`() {
        val lines = collect { it.append("\n\n{\"a\":1}\n\n") }

        assertEquals(listOf("""{"a":1}"""), lines)
    }

    @Test
    fun `после сброса недописанный хвост не всплывает`() {
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
