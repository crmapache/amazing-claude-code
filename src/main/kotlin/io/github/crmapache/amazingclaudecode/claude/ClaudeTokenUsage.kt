package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.diagnostic.thisLogger
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Сколько токенов потрачено СЕГОДНЯ по всем проектам сразу — та же цифра "tok",
 * что у пользователя в персональном ~/.claude/statusline.sh. У самого разговора
 * этого числа спросить нельзя: он знает только свой контекст, а не все проекты
 * и не историю за сегодня, поэтому — как и в statusline.sh — читаем транскрипты
 * напрямую.
 *
 * Дедуп по (message.id, requestId): одно и то же сообщение в транскриптах
 * встречается по нескольку раз (resume, компакт, копии в подагентах) — без
 * дедупа сумма задвоилась бы.
 */
internal object ClaudeTokenUsage {

    // Старее двух дней файл точно не содержит событий за сегодня — совпадает с
    // `find -mtime -2` в statusline.sh, сканировать такие незачем.
    private const val RECENT_MS = 2L * 24 * 60 * 60 * 1000
    private const val MAX_DEPTH = 8

    fun today(): String {
        val root = File(System.getProperty("user.home"), ".claude/projects")
        if (!root.isDirectory) return "0.0M"

        val cutoff = System.currentTimeMillis() - RECENT_MS
        val today = LocalDate.now()
        val seen = HashSet<String>()
        var total = 0L

        runCatching {
            root.walkTopDown()
                .maxDepth(MAX_DEPTH)
                .filter { it.isFile && it.extension == "jsonl" && it.lastModified() >= cutoff }
                .forEach { file -> total += scanFile(file, today, seen) }
        }.onFailure { thisLogger().warn("Failed to scan projects for today's token usage", it) }

        return String.format(Locale.ROOT, "%.1fM", total / 1_000_000.0)
    }

    private fun scanFile(file: File, today: LocalDate, seen: MutableSet<String>): Long {
        var subtotal = 0L

        runCatching {
            file.useLines { lines ->
                for (line in lines) {
                    if (!line.startsWith("{")) continue
                    subtotal += lineTokens(line, today, seen)
                }
            }
        }.onFailure { thisLogger().warn("Failed to scan $file for token usage", it) }

        return subtotal
    }

    private fun lineTokens(line: String, today: LocalDate, seen: MutableSet<String>): Long {
        val payload = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() ?: return 0
        val message = payload["message"]?.jsonObject ?: return 0
        val usage = message["usage"]?.jsonObject ?: return 0

        val timestamp = payload["timestamp"]?.jsonPrimitive?.contentOrNull ?: return 0
        val eventDate = runCatching {
            Instant.parse(timestamp).atZone(ZoneId.systemDefault()).toLocalDate()
        }.getOrNull() ?: return 0
        if (eventDate != today) return 0

        val messageId = message["id"]?.jsonPrimitive?.contentOrNull.orEmpty()
        val requestId = payload["requestId"]?.jsonPrimitive?.contentOrNull.orEmpty()
        if (!seen.add("$messageId:$requestId")) return 0

        return field(usage, "input_tokens") +
            field(usage, "output_tokens") +
            field(usage, "cache_creation_input_tokens") +
            field(usage, "cache_read_input_tokens")
    }

    private fun field(usage: JsonObject, name: String): Long =
        usage[name]?.jsonPrimitive?.contentOrNull?.toLongOrNull() ?: 0L
}
