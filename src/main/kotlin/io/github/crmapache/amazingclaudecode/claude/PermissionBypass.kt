package io.github.crmapache.amazingclaudecode.claude

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Доступен ли этому компьютеру режим «без вопросов».
 *
 * Сам CLI решает это ровно двумя вещами: разрешён ли переход ключом запуска и не
 * запрещён ли режим настройками (`permissions.disableBypassPermissionsMode`).
 * Панель обязана знать ответ заранее, потому что от него зависит круг Shift+Tab:
 * запрещённый режим круг должен перешагивать молча, а не заводить человека в
 * отказ агента.
 *
 * Третью причину — выключение режима на стороне Anthropic — узнать снаружи
 * нельзя вовсе. Она приходит отказом на смену режима, и его панель запоминает
 * сама (см. refusedModes в состоянии ленты).
 */
internal object PermissionBypass {

    fun isAvailable(projectDirectory: String?): Boolean {
        val executable = ClaudeExecutable.find() ?: return false

        return isAvailable(
            cliKnowsFlag = ClaudeExecutable.supportsFlag(executable, ClaudeLaunch.ALLOW_BYPASS_FLAG),
            settings = settingsFiles(projectDirectory),
        )
    }

    fun isAvailable(cliKnowsFlag: Boolean, settings: List<File>): Boolean =
        cliKnowsFlag && settings.none(::disables)

    /**
     * Те же файлы, что читает сам CLI: политика организации, личные настройки
     * человека и настройки проекта. Значение `disable` отменить нельзя — обратного
     * значения у поля просто нет, — поэтому порядок слоёв тут ни на что не влияет
     * и достаточно найти запрет хоть в одном.
     */
    fun settingsFiles(projectDirectory: String?): List<File> = buildList {
        add(File(managedDirectory(), MANAGED_SETTINGS))
        managedDirectory().resolve("$MANAGED_SETTINGS.d").listFiles()
            ?.filter { it.extension == "json" }
            ?.let(::addAll)

        add(File(userDirectory(), SETTINGS))

        projectDirectory?.let { directory ->
            add(File(directory, ".claude/$SETTINGS"))
            add(File(directory, ".claude/$LOCAL_SETTINGS"))
        }
    }

    private fun disables(file: File): Boolean = runCatching {
        if (!file.isFile) return false

        Json.parseToJsonElement(file.readText())
            .jsonObject["permissions"]
            ?.jsonObject
            ?.get("disableBypassPermissionsMode")
            ?.jsonPrimitive
            ?.content == "disable"
    }.getOrDefault(false)

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
