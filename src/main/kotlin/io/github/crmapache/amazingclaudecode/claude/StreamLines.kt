package io.github.crmapache.amazingclaudecode.claude

/**
 * Whole lines assembled out of a process's output stream.
 *
 * The process hands over text in chunks of arbitrary length: one event can arrive in halves, and one
 * chunk can hold several lines at once. Passing a fragment upwards is not an option - it does not
 * parse as JSON.
 */
internal class StreamLines(private val onLine: (String) -> Unit) {

    private val tail = StringBuilder()

    fun append(chunk: String) {
        tail.append(chunk)

        while (true) {
            val breakAt = tail.indexOf("\n")
            if (breakAt < 0) return

            val line = tail.substring(0, breakAt).trim()
            tail.delete(0, breakAt + 1)

            if (line.isNotEmpty()) onLine(line)
        }
    }

    fun reset() = tail.setLength(0)
}
