package io.github.crmapache.amazingclaudecode.claude

/**
 * Что в режиме plan можно пропустить без вопроса.
 *
 * Plan — «только читай, не трогай диск», а не тихий bypass: Write/Edit/
 * MultiEdit/NotebookEdit и незнакомые команды по-прежнему спрашивают, что бы
 * ни попросили — именно это и держит смысл режима. Без вопроса пропускаем
 * только заведомо безопасное чтение — так же, как ведёт себя сам терминальный
 * Claude Code в этом режиме, не более того.
 *
 * Read/Grep/Glob сюда вообще не доходят — хук на них не настроен (см.
 * WATCHED_TOOLS в ClaudeSettings), поэтому решать приходится только про сеть
 * и про Bash.
 *
 * Ключевое про Bash: команду разбираем, а не сравниваем с началом строки.
 * Разведка почти всегда идёт конвейером («ищи то-то | выкинь node_modules |
 * первые сорок»), и правило «встретили вертикальную черту — спрашиваем»
 * означало вопрос на каждый второй шаг любого субагента, причём даже когда
 * черта стояла внутри кавычек в самом шаблоне поиска. Поэтому строку
 * раскладываем на отдельные команды с учётом кавычек и подстановок и
 * спрашиваем ровно тогда, когда хоть одна из них умеет менять мир.
 */
internal object PermissionPlanMode {

    fun isSafe(toolName: String, command: String?): Boolean {
        if (toolName == "WebFetch" || toolName == "WebSearch") return true
        if (toolName != "Bash") return false

        return isSafeScript(command.orEmpty(), depth = 0)
    }

    private fun isSafeScript(script: String, depth: Int): Boolean {
        // Подстановка внутри подстановки внутри подстановки — уже не разведка,
        // а повод спросить человека.
        if (depth > MAX_SUBSTITUTION_DEPTH) return false

        // Не разобрали (незакрытая кавычка, скобочная группа, heredoc) — значит
        // не знаем, что там; спрашиваем.
        val parsed = parse(script) ?: return false

        if (parsed.writesToFile) return false
        if (parsed.commands.isEmpty()) return false
        // «Что подставится» решает вложенная команда, поэтому её проверяем тем же
        // правилом: `echo $(git rev-parse HEAD)` — чтение, `echo $(rm -rf ~)` — нет.
        if (parsed.substitutions.any { !isSafeScript(it, depth + 1) }) return false

        return parsed.commands.all(::isSafeCommand)
    }

    // --- Разбор ------------------------------------------------------------

    private class Script {
        /** Команды конвейера/цепочки, каждая — списком уже снятых с кавычек слов. */
        val commands = mutableListOf<List<String>>()

        /** Тела `$( )` и обратных кавычек — проверяются отдельно и рекурсивно. */
        val substitutions = mutableListOf<String>()

        /** Хоть один перенаправленный вывод в файл — это уже запись на диск. */
        var writesToFile = false
    }

    private fun parse(script: String): Script? {
        val result = Script()
        var words = mutableListOf<String>()
        val word = StringBuilder()
        var wordStarted = false
        var index = 0

        fun endWord() {
            if (!wordStarted) return
            words.add(word.toString())
            word.clear()
            wordStarted = false
        }

        fun endCommand() {
            endWord()
            if (words.isNotEmpty()) {
                result.commands.add(words)
                words = mutableListOf()
            }
        }

        while (index < script.length) {
            val char = script[index]
            when {
                char == '\'' -> {
                    val close = script.indexOf('\'', index + 1)
                    if (close < 0) return null
                    word.append(script, index + 1, close)
                    wordStarted = true
                    index = close + 1
                }

                char == '"' -> {
                    index = readDoubleQuoted(script, index, word, result) ?: return null
                    wordStarted = true
                }

                char == '`' -> {
                    val close = script.indexOf('`', index + 1)
                    if (close < 0) return null
                    result.substitutions.add(script.substring(index + 1, close))
                    wordStarted = true
                    index = close + 1
                }

                char == '$' && script.getOrNull(index + 1) == '(' -> {
                    val close = closingParen(script, index + 1) ?: return null
                    result.substitutions.add(script.substring(index + 2, close))
                    wordStarted = true
                    index = close + 1
                }

                char == '\\' -> {
                    val escaped = script.getOrNull(index + 1) ?: return null
                    word.append(escaped)
                    wordStarted = true
                    index += 2
                }

                char == '>' || char == '<' -> {
                    // Номер дескриптора прилипает к стрелке слева («2>/dev/null») и
                    // аргументом команды не является.
                    if (wordStarted && word.all(Char::isDigit)) {
                        word.clear()
                        wordStarted = false
                    }
                    endWord()
                    index = readRedirect(script, index, result)
                }

                char == ';' || char == '&' || char == '|' || char == '\n' -> {
                    endCommand()
                    index += if (script.getOrNull(index + 1) == char) 2 else 1
                }

                char == ' ' || char == '\t' || char == '\r' -> {
                    endWord()
                    index++
                }

                // Подоболочка — отдельный слой правил, который здесь честнее не
                // изображать вовсе.
                char == '(' || char == ')' -> return null

                // А вот фигурная скобка чаще всего не группа команд, а место
                // подстановки в xargs и find («-I{}», «-exec … {} \;»). Группой её
                // делает только положение отдельным словом — на нём и сдаёмся.
                char == '{' || char == '}' -> {
                    if (!wordStarted && script.getOrNull(index + 1)?.isWhitespace() != false) return null
                    word.append(char)
                    wordStarted = true
                    index++
                }

                else -> {
                    word.append(char)
                    wordStarted = true
                    index++
                }
            }
        }

        endCommand()
        return result
    }

    /** Возвращает индекс за закрывающей кавычкой либо null, если её нет. */
    private fun readDoubleQuoted(script: String, start: Int, word: StringBuilder, result: Script): Int? {
        var index = start + 1
        while (index < script.length) {
            val char = script[index]
            when {
                char == '"' -> return index + 1

                char == '\\' && index + 1 < script.length -> {
                    word.append(script[index + 1])
                    index += 2
                }

                // Двойные кавычки подстановку не выключают — в отличие от одинарных.
                char == '`' -> {
                    val close = script.indexOf('`', index + 1)
                    if (close < 0) return null
                    result.substitutions.add(script.substring(index + 1, close))
                    index = close + 1
                }

                char == '$' && script.getOrNull(index + 1) == '(' -> {
                    val close = closingParen(script, index + 1) ?: return null
                    result.substitutions.add(script.substring(index + 2, close))
                    index = close + 1
                }

                else -> {
                    word.append(char)
                    index++
                }
            }
        }
        return null
    }

    /**
     * Пропускает перенаправление вместе с его целью. Вывод в /dev/null и в другой
     * дескриптор («2>&1») ничего не пишет на диск, всё остальное — пишет.
     */
    private fun readRedirect(script: String, start: Int, result: Script): Int {
        val writing = script[start] == '>'
        var index = start + 1
        if (script.getOrNull(index) == script[start]) index++
        while (script.getOrNull(index) == ' ' || script.getOrNull(index) == '\t') index++

        val targetStart = index
        while (index < script.length && script[index] !in REDIRECT_TARGET_STOP) index++
        val target = script.substring(targetStart, index)

        if (writing && target != "/dev/null" && !target.startsWith("&")) result.writesToFile = true
        return index
    }

    private fun closingParen(script: String, open: Int): Int? {
        var depth = 0
        var index = open
        while (index < script.length) {
            when (script[index]) {
                '(' -> depth++
                ')' -> if (--depth == 0) return index
            }
            index++
        }
        return null
    }

    // --- Правила -----------------------------------------------------------

    private fun isSafeCommand(words: List<String>): Boolean {
        val name = words.first()
        val args = words.drop(1)

        if (name == "git") return isSafeGit(args)
        if (name == "xargs") return isSafeXargs(args)

        val forbidden = READ_ONLY[name] ?: return false
        return args.none { violates(it, forbidden) }
    }

    /**
     * xargs сам по себе безобиден — опасно ровно то, что он запускает. Поэтому
     * снимаем его ключи и проверяем оставшуюся команду теми же правилами:
     * `find . | xargs wc -l` — чтение, `find . | xargs rm` — нет.
     */
    private fun isSafeXargs(args: List<String>): Boolean {
        var rest = args
        while (rest.firstOrNull()?.startsWith("-") == true) {
            // Ключ со значением отдельным словом («-n 1») съедает и его; со
            // значением вплотную («-I{}») — только себя.
            val takes = if (rest.first() in XARGS_VALUE_FLAGS) 2 else 1
            if (rest.size < takes) return false
            rest = rest.drop(takes)
        }

        // Без команды xargs зовёт echo — это чтение.
        if (rest.isEmpty()) return true
        return isSafeCommand(rest)
    }

    /**
     * У git читающая подкоманда — ещё не гарантия: `branch -D`, `remote add`,
     * `config user.name Вася` пишут, а глобальный `-c` умеет подменить пейджер
     * произвольной командой.
     */
    private fun isSafeGit(args: List<String>): Boolean {
        var rest = args
        while (rest.firstOrNull()?.startsWith("-") == true) {
            when (rest.first()) {
                "--no-pager", "--no-optional-locks", "--no-replace-objects" -> rest = rest.drop(1)
                "-C" -> {
                    if (rest.size < 2) return false
                    rest = rest.drop(2)
                }
                else -> return false
            }
        }

        val subcommand = rest.firstOrNull() ?: return false
        if (subcommand !in GIT_READ_ONLY) return false

        val subArgs = rest.drop(1)
        if (subArgs.any { violates(it, GIT_FORBIDDEN) }) return false

        val first = subArgs.firstOrNull()
        return when (subcommand) {
            // Без позиционных аргументов это список веток/тегов, с ними — создание.
            "branch", "tag" -> subArgs.none { !it.startsWith("-") }
            "remote" -> first == null || first.startsWith("-") || first == "show" || first == "get-url"
            "config" -> subArgs.any { it in GIT_CONFIG_READS }
            "stash" -> first == "list" || first == "show"
            "reflog" -> first != "expire" && first != "delete"
            else -> true
        }
    }

    /**
     * Совпадением считаем и склейку коротких ключей («-ni» — это и -i тоже), и
     * ключ со значением («--output=x», «-i.bak»).
     */
    private fun violates(arg: String, forbidden: Set<String>): Boolean {
        if (arg in forbidden) return true
        if (!arg.startsWith("-")) return false
        if (forbidden.any { arg.startsWith("$it=") }) return true

        if (arg.startsWith("--")) return false
        val shorts = arg.drop(1).takeWhile(Char::isLetter).toSet()
        return forbidden.any { it.length == 2 && !it.startsWith("--") && it[1] in shorts }
    }

    /** Команда → её ключи, после которых она перестаёт быть только чтением. */
    private val READ_ONLY: Map<String, Set<String>> = mapOf(
        "awk" to setOf("-i", "--in-place"),
        "basename" to emptySet(),
        "cat" to emptySet(),
        // Разведка сплошь и рядом начинается со смены каталога («cd туда && поищи
        // там»), а сам по себе переход не меняет ничего, кроме текущей папки.
        "cd" to emptySet(),
        "column" to emptySet(),
        "comm" to emptySet(),
        "cut" to emptySet(),
        "date" to emptySet(),
        "df" to emptySet(),
        "diff" to emptySet(),
        "dirname" to emptySet(),
        "du" to emptySet(),
        "echo" to emptySet(),
        "egrep" to emptySet(),
        "fd" to setOf("-x", "-X", "--exec", "--exec-batch"),
        "fgrep" to emptySet(),
        "file" to emptySet(),
        "find" to setOf("-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprintf", "-fls"),
        "grep" to emptySet(),
        // -f ждёт новых строк вечно и подвесил бы агента до самого таймаута.
        "head" to setOf("-f"),
        "jq" to setOf("-i", "--in-place"),
        "ls" to emptySet(),
        "lsof" to emptySet(),
        "nl" to emptySet(),
        "pgrep" to emptySet(),
        "printf" to emptySet(),
        "ps" to emptySet(),
        "pwd" to emptySet(),
        "readlink" to emptySet(),
        "realpath" to emptySet(),
        "rg" to setOf("--pre"),
        "sed" to setOf("-i", "--in-place"),
        "sort" to setOf("-o", "--output"),
        "stat" to emptySet(),
        "tail" to setOf("-f", "--follow"),
        "test" to emptySet(),
        "tr" to emptySet(),
        "tree" to setOf("-o"),
        "uniq" to emptySet(),
        "wc" to emptySet(),
        "which" to emptySet(),
    )

    /** Ключи xargs, у которых значение идёт отдельным словом. */
    private val XARGS_VALUE_FLAGS = setOf(
        "-I", "-i", "-n", "-P", "-s", "-d", "-a", "-E", "-L",
        "--replace", "--max-args", "--max-procs", "--max-chars", "--delimiter", "--arg-file",
    )

    private val GIT_READ_ONLY = setOf(
        "blame", "branch", "cat-file", "check-ignore", "config", "count-objects", "describe",
        "diff", "diff-tree", "for-each-ref", "grep", "log", "ls-files", "ls-remote", "ls-tree",
        "name-rev", "reflog", "remote", "rev-list", "rev-parse", "shortlog", "show", "stash",
        "status", "tag", "whatchanged",
    )

    private val GIT_FORBIDDEN = setOf("--output", "--exec")

    private val GIT_CONFIG_READS = setOf("--get", "--get-all", "--get-regexp", "--list", "-l")

    private const val REDIRECT_TARGET_STOP = " \t\n;|<>"

    private const val MAX_SUBSTITUTION_DEPTH = 3
}
