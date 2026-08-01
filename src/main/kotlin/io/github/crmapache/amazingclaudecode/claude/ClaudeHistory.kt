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

    fun list(workingDirectory: String?, limit: Int = 40): List<Entry> {
        val directory = directoryFor(workingDirectory) ?: return emptyList()

        return (directory.listFiles { file -> file.extension == "jsonl" } ?: emptyArray())
            .sortedByDescending { it.lastModified() }
            .take(limit)
            .mapNotNull { file -> entryFor(file) }
    }

    /** Строки разговора, которые панель умеет рисовать: реплики и ответы. */
    fun replay(workingDirectory: String?, id: String): List<String> {
        val file = directoryFor(workingDirectory)?.resolve("$id.jsonl") ?: return emptyList()
        if (!file.isFile) return emptyList()

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
     * Папка разговоров: путь проекта, где разделители заменены дефисами. Так их
     * раскладывает сам Claude Code — своей схемы у нас быть не может.
     */
    private fun directoryFor(workingDirectory: String?): File? {
        val path = workingDirectory ?: return null
        val slug = path.replace('/', '-').replace('.', '-')
        val directory = File(System.getProperty("user.home"), ".claude/projects/$slug")

        return directory.takeIf { it.isDirectory }
    }

    private fun entryFor(file: File): Entry? {
        val id = file.nameWithoutExtension
        var title = ""
        // Разговор — это сплошь /compact или похожая команда, ни одной реплики
        // человека: имя команды тогда и есть единственный осмысленный заголовок.
        var fallbackCommand = ""
        var messages = 0

        runCatching {
            file.useLines { lines ->
                for (line in lines) {
                    if (!line.startsWith("{")) continue
                    if (line.contains("\"type\":\"user\"")) {
                        messages += 1
                        if (title.isNotEmpty()) continue

                        when (val wrapper = localCommandName(line)) {
                            // Настоящая реплика человека — не служебная обвязка команды.
                            null -> firstText(line).takeIf { it.isNotEmpty() }?.let { title = it }
                            else -> if (wrapper.isNotEmpty() && fallbackCommand.isEmpty()) fallbackCommand = wrapper
                        }
                    }
                }
            }
        }.onFailure { thisLogger().warn("Failed to scan conversation $id", it) }

        // Разговор без единой реплики — это брошенный запуск, показывать нечего.
        if (messages == 0) return null

        return Entry(
            id = id,
            title = title.ifEmpty { fallbackCommand.ifEmpty { "untitled" } },
            updatedAt = file.lastModified(),
            messages = messages,
        )
    }

    /**
     * Локальные команды (/compact, /clear…) оставляют в транскрипте служебную
     * обвязку — предупреждение-caveat, разбор команды, её вывод — тремя отдельными
     * репликами человека подряд, каждая своей строкой JSONL. Ни одна не годится в
     * заголовок разговора буквально: null — это настоящая реплика человека, не
     * обвязка; "" — обвязка без имени команды (caveat/stdout); непустая строка —
     * само имя команды, единственное осмысленное, что можно из неё показать.
     */
    private fun localCommandName(rawLine: String): String? {
        val payload = runCatching { Json.parseToJsonElement(rawLine).jsonObject }.getOrNull() ?: return null
        val content = payload["message"]?.jsonObject?.get("content") ?: return null
        val text = runCatching { content.jsonPrimitive.contentOrNull }.getOrNull() ?: return null
        val trimmed = text.trim()

        return when {
            trimmed.startsWith("<local-command-caveat>") || trimmed.startsWith("<local-command-stdout>") -> ""
            trimmed.startsWith("<command-name>") -> COMMAND_NAME_TAG.find(trimmed)?.groupValues?.get(1)?.trim().orEmpty()
            else -> null
        }
    }

    /**
     * Заголовком служит первая реплика человека — но не сама по себе, а её
     * содержательная строка. Вложения (`@путь`, `[Image #N]`, цитата) панель
     * складывает в текст ПЕРЕД настоящими словами человека, а не вместо них —
     * взять буквально первую строку значит показать путь к файлу вместо того,
     * что человек на самом деле спросил. Если содержательной строки вообще нет
     * (одно вложение или голая команда), это и есть весь смысл реплики — берём
     * последнюю строку, ровно так же, как её показывает нативный picker.
     */
    private fun firstText(line: String): String {
        val payload = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() ?: return ""
        val content = payload["message"]?.jsonObject?.get("content") ?: return ""

        val text = runCatching {
            content.jsonArray
                .mapNotNull { block -> block.jsonObject["text"]?.jsonPrimitive?.contentOrNull }
                .firstOrNull { it.isNotBlank() }
        }.getOrNull() ?: runCatching { content.jsonPrimitive.contentOrNull }.getOrNull()

        val lines = text.orEmpty().lineSequence().filter { it.isNotBlank() }.toList()
        val meaningful = lines.firstOrNull { !isAttachmentLine(it) }

        return (meaningful ?: lines.lastOrNull()).orEmpty().take(120)
    }

    private fun isAttachmentLine(line: String): Boolean =
        line.startsWith("@") || line.startsWith("> ") || IMAGE_PLACEHOLDER.matches(line)

    private val IMAGE_PLACEHOLDER = Regex("^\\[Image #\\d+]$")
    private val COMMAND_NAME_TAG = Regex("""<command-name>(.*?)</command-name>""")
}
