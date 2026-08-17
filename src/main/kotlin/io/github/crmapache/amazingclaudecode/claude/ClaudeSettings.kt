package io.github.crmapache.amazingclaudecode.claude

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Файлы настроек Claude Code — те же, что читает сам CLI, и в том же старшинстве.
 *
 * Панель заглядывает в них не из любопытства: часть решений CLI принимает ещё до
 * первого события, и человеку они видны только в панели. Режим разрешений, с
 * которым поднимется разговор, и запрет режима «без вопросов» — как раз такие.
 * Спросить об этом сам CLI нельзя: он отвечает уже поднятым процессом, а
 * селектор в панели должен показывать правду с первой секунды.
 *
 * Слои перечислены от старшего к младшему — так же, как их объединяет CLI
 * (`userSettings` → `projectSettings` → `localSettings` → `policySettings`, где
 * каждый следующий перекрывает предыдущий). Значит первое найденное значение,
 * если идти сверху, и есть действующее.
 */
internal object ClaudeSettings {

    /**
     * Чей это файл.
     *
     * Слои у CLI не равны между собой не только старшинством: настройки проекта
     * лежат в самом репозитории, и любой, кто прислал в него правку, мог бы
     * подсунуть режим повольнее. Поэтому режим `auto` CLI принимает только от
     * политики организации и личных настроек — см. [PermissionDefaultMode].
     */
    enum class Layer { POLICY, LOCAL, PROJECT, USER }

    data class Source(val layer: Layer, val file: File)

    /** Слои от старшего к младшему: первое найденное значение и есть действующее. */
    fun sources(projectDirectory: String?): List<Source> = buildList {
        add(Source(Layer.POLICY, File(managedDirectory(), MANAGED_SETTINGS)))
        // Каталог рядом с политикой: там лежат её отдельные куски, и CLI читает их
        // все. По имени — чтобы порядок был тот же при каждом запуске.
        managedDirectory().resolve("$MANAGED_SETTINGS.d").listFiles()
            ?.filter { it.extension == "json" }
            ?.sortedBy { it.name }
            ?.forEach { add(Source(Layer.POLICY, it)) }

        projectDirectory?.let { directory ->
            add(Source(Layer.LOCAL, File(directory, ".claude/$LOCAL_SETTINGS")))
            add(Source(Layer.PROJECT, File(directory, ".claude/$SETTINGS")))
        }

        add(Source(Layer.USER, File(userDirectory(), SETTINGS)))
    }

    /**
     * Значение поля внутри `permissions` — или пусто.
     *
     * Пусто и для отсутствующего файла, и для битого: разбор чужих настроек не
     * наше дело, сломанные — забота самого CLI. Панель из-за них не должна ни
     * падать, ни менять человеку режим.
     */
    fun permission(file: File, field: String): String = runCatching {
        if (!file.isFile) return ""

        Json.parseToJsonElement(file.readText())
            .jsonObject["permissions"]
            ?.jsonObject
            ?.get(field)
            ?.jsonPrimitive
            ?.contentOrNull
            .orEmpty()
    }.getOrDefault("")

    private fun managedDirectory(): File {
        val os = System.getProperty("os.name")

        return when {
            os.startsWith("Mac") -> File("/Library/Application Support/ClaudeCode")
            os.startsWith("Windows") -> File("C:\\Program Files\\ClaudeCode")
            else -> File("/etc/claude-code")
        }
    }

    /** Каталог личных настроек переезжает переменной окружения — как и у CLI. */
    private fun userDirectory(): File =
        System.getenv("CLAUDE_CONFIG_DIR")?.takeIf { it.isNotBlank() }?.let(::File)
            ?: File(System.getProperty("user.home"), ".claude")

    private const val MANAGED_SETTINGS = "managed-settings.json"
    private const val SETTINGS = "settings.json"
    private const val LOCAL_SETTINGS = "settings.local.json"
}
