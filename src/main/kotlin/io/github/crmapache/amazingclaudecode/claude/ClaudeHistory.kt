package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.diagnostic.thisLogger
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * Прошлые разговоры этого проекта.
 *
 * Claude Code хранит их сам: по файлу на разговор в своей папке, имя файла — это
 * идентификатор, которым разговор и возобновляется. Никакой своей базы панель не
 * заводит, иначе история в панели и в терминале разъехались бы.
 *
 * Слэш-команда возобновления в потоковом режиме недоступна — она открывает
 * интерактивный список. Отсюда и своя кнопка.
 */
internal object ClaudeHistory {

    data class Entry(
        val id: String,
        val title: String,
        val updatedAt: Long,
        val messages: Int,
    )

    fun list(workingDirectory: String?, limit: Int = 40): List<Entry> =
        directoriesFor(workingDirectory)
            .flatMap { directory -> (directory.listFiles { file -> file.extension == "jsonl" } ?: emptyArray()).asList() }
            .sortedByDescending { it.lastModified() }
            .take(limit)
            .mapNotNull { file -> entryFor(file) }

    /** Строки разговора, которые панель умеет рисовать: реплики и ответы. */
    fun replay(workingDirectory: String?, id: String): List<String> {
        val file = directoriesFor(workingDirectory)
            .map { it.resolve("$id.jsonl") }
            .firstOrNull { it.isFile }
            ?: return emptyList()

        return runCatching {
            file.readLines()
                .filter { line ->
                    line.startsWith("{") && (line.contains("\"type\":\"user\"") || line.contains("\"type\":\"assistant\""))
                }
                .map(::normalizeContent)
        }.onFailure { thisLogger().warn("Failed to read conversation $id", it) }.getOrDefault(emptyList())
    }

    /**
     * На диске голая текстовая реплика человека — это строка в message.content, а
     * не массив блоков: так её пишет сам Claude Code, когда во вводе не было ни
     * вложений, ни tool_result. Живой поток отдаёт панели только массивы блоков —
     * лента разбирает исключительно их и падает на строке. Раз это единственное
     * место, где старый формат превращается в живое событие, приводим форму здесь,
     * а не защитными проверками по всей ленте.
     */
    internal fun normalizeContent(line: String): String {
        val payload = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() ?: return line
        val message = payload["message"]?.jsonObject ?: return line
        val content = message["content"] as? JsonPrimitive ?: return line
        if (!content.isString) return line

        val textBlock = buildJsonArray { addJsonObject { put("type", "text"); put("text", content.content) } }
        val normalizedMessage = JsonObject(message + ("content" to textBlock))
        val normalizedPayload = JsonObject(payload + ("message" to normalizedMessage))
        return normalizedPayload.toString()
    }

    /**
     * Имя папки разговоров по пути проекта — ровно по правилу самого Claude Code:
     * всё, что не буква и не цифра, становится дефисом.
     *
     * Раньше здесь менялись только слеш и точка, и на этом история разъезжалась с
     * терминалом: у пути с пробелом или подчёркиванием («my_project») папка
     * получалась своя, а на Windows — вообще всегда, потому что двоеточие после
     * буквы диска оставалось на месте. Панель смотрела в несуществующий каталог и
     * показывала пустой список, хотя разговоры лежали рядом.
     */
    internal fun slugFor(path: String): String = path.map { if (it.isLetterOrDigit()) it else '-' }.joinToString("")

    /**
     * Где искать разговоры этого проекта. Кандидатов два, потому что путь до
     * проекта и путь, которым его знает CLI, совпадают не всегда: `/tmp` на macOS
     * на самом деле `/private/tmp`, а проект вполне может лежать за символической
     * ссылкой. CLI раскладывает разговоры по настоящему пути, IDE же отдаёт свой —
     * поэтому смотрим в обе папки и показываем всё, что нашлось.
     */
    private fun directoriesFor(workingDirectory: String?): List<File> {
        val path = workingDirectory ?: return emptyList()
        val real = runCatching { File(path).canonicalPath }.getOrDefault(path)
        val projects = File(configDirectory(), "projects")

        return listOf(path, real)
            .distinct()
            .map { File(projects, slugFor(it)) }
            .distinctBy { it.path }
            .filter { it.isDirectory }
    }

    /** Каталог настроек переезжает переменной окружения — как и у самого CLI. */
    private fun configDirectory(): File =
        System.getenv("CLAUDE_CONFIG_DIR")?.takeIf { it.isNotBlank() }?.let(::File)
            ?: File(System.getProperty("user.home"), ".claude")

    private fun entryFor(file: File): Entry? {
        val id = file.nameWithoutExtension

        val scan = runCatching { file.useLines(block = ::scan) }
            .onFailure { thisLogger().warn("Failed to scan conversation $id", it) }
            .getOrDefault(Scan("", 0))

        // Разговор без единой реплики — это брошенный запуск, показывать нечего.
        if (scan.messages == 0) return null

        return Entry(
            id = id,
            // Родное название от самого CLI (см. Scan.aiTitle) — предпочитаем
            // его эвристике, когда оно есть: короче, точнее по смыслу и не
            // зависит от того, насколько удачной вышла первая строка человека.
            title = scan.aiTitle?.takeIf { it.isNotBlank() } ?: scan.title.ifEmpty { "untitled" },
            updatedAt = file.lastModified(),
            messages = scan.messages,
        )
    }

    /** Что удалось узнать про разговор за один проход по его файлу. */
    internal data class Scan(val title: String, val messages: Int, val aiTitle: String? = null)

    /**
     * Заголовок и число сообщений — за один проход: файл разговора весит
     * мегабайты, а в списке их сорок.
     *
     * Сообщение здесь — то, что сказал человек: своими словами или командой. В
     * транскрипте его репликами записано и всё служебное — результат каждого
     * вызова инструмента, обвязка команды, уведомление о фоновой задаче, — и
     * такой счёт разъезжается с виденным на экране в десять раз: «375
     * сообщений» там, где человек написал тридцать.
     *
     * Отсеиваем по сырой строке, не разбирая её: служебных реплик кратно
     * больше, чем всех остальных, а среди них попадаются и на сотню килобайт.
     * Подстроки берём в том виде, в каком их пишет CLI, — внутри текста самого
     * человека такая не встретится, там кавычки экранированы.
     */
    internal fun scan(lines: Sequence<String>): Scan {
        var title = ""
        // Разговор — это сплошь /compact или похожая команда, ни одной реплики
        // человека: имя команды тогда и есть единственный осмысленный заголовок.
        var fallbackCommand = ""
        var aiTitle: String? = null
        var messages = 0

        for (line in lines) {
            if (!line.startsWith("{")) continue

            // Родное название от CLI повторяется по ходу файла много раз с
            // одним и тем же значением — держим последнее увиденное: если
            // тема разговора успела смениться, оно успевает обновиться тоже.
            if (line.contains("\"type\":\"ai-title\"")) {
                AI_TITLE.find(line)?.groupValues?.get(1)?.let { aiTitle = it }
                continue
            }

            if (!line.contains("\"type\":\"user\"")) continue
            // Результат вызова инструмента: реплика человека только по форме.
            if (line.contains("\"type\":\"tool_result\"")) continue
            // Пометка самого CLI: писал не человек, а оболочка — тело вызванного
            // скилла, предупреждение перед командой, подпись к картинке.
            if (line.contains("\"isMeta\":true")) continue
            // Остальная обвязка команд и уведомления фоновых задач: человек их
            // не писал и на экране не видел.
            if (SERVICE_CONTENT.any { line.contains(it) }) continue

            messages += 1
            if (title.isNotEmpty()) continue

            val payload = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() ?: continue

            when (val wrapper = serviceReplica(payload)) {
                // Настоящая реплика человека — не служебная обвязка команды.
                null -> firstText(payload).takeIf { it.isNotEmpty() }?.let { title = it }
                else -> if (wrapper.isNotEmpty() && fallbackCommand.isEmpty()) fallbackCommand = wrapper
            }
        }

        return Scan(title.ifEmpty { fallbackCommand }, messages, aiTitle)
    }

    /**
     * Служебные реплики, которые в транскрипте выглядят как слова человека, но
     * ими не являются: обвязка слэш-команды, предупреждение и вывод локальной
     * команды, уведомление о фоновой задаче. Ни одна не годится в заголовок
     * буквально: null — это настоящая реплика человека, не служебная; "" —
     * служебная, показывать из неё нечего; непустая строка — сама команда,
     * единственное осмысленное, что из обвязки можно достать.
     */
    private fun serviceReplica(payload: JsonObject): String? {
        val content = payload["message"]?.jsonObject?.get("content") as? JsonPrimitive ?: return null
        if (!content.isString) return null
        val text = content.content.trim()

        return when {
            // Порядок тегов в обвязке не один: у встроенных команд (/model,
            // /compact) первым идёт имя, у скиллов и плагинов — подпись. Раньше
            // разбор ждал только первого порядка, и разговор, начатый скиллом,
            // назывался в списке сырым «<command-message>task</command-message>».
            text.startsWith("<command-name>") || text.startsWith("<command-message>") -> commandTitle(text)
            text.startsWith("<local-command-") || text.startsWith("<task-notification>") -> ""
            else -> null
        }
    }

    /**
     * Имя команды с аргументом — так разговор узнаётся в списке: десяток
     * запусков одного и того же скилла отличается друг от друга только им.
     */
    private fun commandTitle(text: String): String {
        val name = tag(COMMAND_NAME_TAG, text).ifEmpty { tag(COMMAND_MESSAGE_TAG, text) }
        if (name.isEmpty()) return ""

        // Имя приходит и со слэшем, и без — зависит от того, каким тегом его
        // записали; в заголовке команда должна выглядеть командой.
        val command = if (name.startsWith("/")) name else "/$name"
        val arguments = tag(COMMAND_ARGS_TAG, text)

        return (if (arguments.isEmpty()) command else "$command $arguments").take(120)
    }

    private fun tag(pattern: Regex, text: String): String =
        pattern.find(text)?.groupValues?.get(1)?.trim().orEmpty()

    /**
     * Заголовком служит первая реплика человека — но не сама по себе, а её
     * содержательные строки. Вложения (`@путь`, `[Image #N]`, цитата) панель
     * складывает в текст ПЕРЕД настоящими словами человека, а не вместо них —
     * взять буквально первую строку значит нередко показать одно короткое
     * слово («Давай») вместо того, что человек на самом деле спросил строкой
     * ниже. Поэтому склеиваем все содержательные строки подряд, а не берём
     * только первую. Если содержательной строки вообще нет (одно вложение или
     * голая команда), это и есть весь смысл реплики — берём последнюю строку,
     * ровно так же, как её показывает нативный picker.
     */
    private fun firstText(payload: JsonObject): String {
        val content = payload["message"]?.jsonObject?.get("content") ?: return ""

        val text = runCatching {
            content.jsonArray
                .mapNotNull { block -> block.jsonObject["text"]?.jsonPrimitive?.contentOrNull }
                .firstOrNull { it.isNotBlank() }
        }.getOrNull() ?: runCatching { content.jsonPrimitive.contentOrNull }.getOrNull()

        val rawLines = text.orEmpty().lineSequence().filter { it.isNotBlank() }.toList()
        val meaningful = rawLines
            .map { stripImageTags(it) }
            .filter { it.isNotEmpty() && !isAttachmentLine(it) }

        val joined = meaningful.ifEmpty { rawLines.takeLast(1) }.joinToString(" ")

        return truncateAtWord(joined, 120)
    }

    /**
     * `[Image #N]` — плейсхолдер вложения, который композер вставляет прямо
     * посреди фразы («смотри [Image #1] сюда»), а не только отдельной
     * строкой. Раньше фильтр распознавал лишь строку целиком из плейсхолдера
     * и пропускал этот случай — тег утекал в заголовок как есть.
     */
    private fun stripImageTags(line: String): String =
        line.replace(IMAGE_PLACEHOLDER, " ").replace(MULTIPLE_SPACES, " ").trim()

    private fun isAttachmentLine(line: String): Boolean = line.startsWith("@") || line.startsWith("> ")

    /** Обрезка по границе слова — иначе заголовок может оборваться на середине слова. */
    private fun truncateAtWord(text: String, max: Int): String {
        if (text.length <= max) return text
        val cut = text.take(max)
        val lastSpace = cut.lastIndexOf(' ')
        return if (lastSpace > 0) cut.take(lastSpace) else cut
    }

    /** Начало служебных реплик, которые в счёт сообщений не идут (см. scan). */
    private val SERVICE_CONTENT = listOf(
        "\"content\":\"<local-command-",
        "\"content\":\"<task-notification>",
    )

    private val AI_TITLE = Regex("\"aiTitle\"\\s*:\\s*\"([^\"]+)\"")
    private val IMAGE_PLACEHOLDER = Regex("\\[Image #\\d+]")
    private val MULTIPLE_SPACES = Regex(" {2,}")
    private val COMMAND_NAME_TAG = Regex("""<command-name>(.*?)</command-name>""")
    private val COMMAND_MESSAGE_TAG = Regex("""<command-message>(.*?)</command-message>""")
    private val COMMAND_ARGS_TAG = Regex("""<command-args>(.*?)</command-args>""", RegexOption.DOT_MATCHES_ALL)
}
