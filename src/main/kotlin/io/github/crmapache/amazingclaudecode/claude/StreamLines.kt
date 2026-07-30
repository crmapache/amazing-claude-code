package io.github.crmapache.amazingclaudecode.claude

/**
 * Сборка целых строк из потока вывода процесса.
 *
 * Процесс отдаёт текст кусками произвольной длины: одно событие может прийти
 * половинками, а в одном куске может оказаться сразу несколько строк. Отдавать
 * наверх обрывок нельзя — он не разберётся как JSON.
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
