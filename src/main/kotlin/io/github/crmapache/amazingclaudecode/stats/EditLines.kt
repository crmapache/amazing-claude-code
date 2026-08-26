package io.github.crmapache.amazingclaudecode.stats

/**
 * How many lines an edit adds and takes away - the same figure the feed's "+12 −3" badge shows.
 *
 * There is no diff in the stream: the edit tool sends the old text and the new one, and the feed cuts
 * off the matching head and tail to show the difference (see hunksFor in feed/tools.ts). The statistics
 * count by the identical rule, so a badge in the feed and a line in the statistics never disagree about
 * one and the same edit.
 */
internal object EditLines {

    class Change(val added: Int, val removed: Int) {
        /** One line in, one line out - the surgeon's cut. */
        val isSingleLine: Boolean get() = added == 1 && removed == 1
    }

    fun of(oldText: String, newText: String): Change {
        val before = oldText.split('\n')
        val after = newText.split('\n')

        var head = 0
        while (head < before.size && head < after.size && before[head] == after[head]) head++

        var tail = 0
        while (
            tail < before.size - head &&
            tail < after.size - head &&
            before[before.size - 1 - tail] == after[after.size - 1 - tail]
        ) {
            tail++
        }

        return Change(added = after.size - head - tail, removed = before.size - head - tail)
    }

    /** A file written whole: every line of it is new. A trailing newline does not make an extra empty line. */
    fun written(content: String): Int {
        val trimmed = content.trimEnd('\n')
        return if (trimmed.isEmpty()) 0 else trimmed.count { it == '\n' } + 1
    }

    /**
     * Whether a path names a test: the file's own name says so, or the folder it sits in does. The
     * conventions of several languages at once rather than one - the person's projects are not all in
     * the same language, and a statistic about tests in only one of them would be a statistic about
     * nothing.
     */
    fun isTestPath(path: String): Boolean {
        val normalized = path.replace('\\', '/').lowercase()
        val name = normalized.substringAfterLast('/')

        if (TEST_NAME.containsMatchIn(name)) return true

        return normalized.split('/').dropLast(1).any { it in TEST_DIRECTORIES }
    }

    private val TEST_NAME = Regex("""(^|[._-])(test|tests|spec|specs)([._-]|$)|_test\.|\.test\.|\.spec\.|test_""")

    private val TEST_DIRECTORIES = setOf("test", "tests", "__tests__", "spec", "specs", "e2e", "testing")
}
