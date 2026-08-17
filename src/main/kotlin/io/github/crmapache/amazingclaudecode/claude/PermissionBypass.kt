package io.github.crmapache.amazingclaudecode.claude

import java.io.File

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
     * Не запрещён ли режим настройками — без расспроса самого CLI.
     *
     * Отдельно от [isAvailable] потому, что тот запускает процесс (`--help`), а
     * спросить про запрет нужно и там, где на это нет права: разбор настроек
     * идёт в потоке интерфейса, пока панель ещё только открывается (см.
     * [PermissionDefaultMode]).
     */
    fun allowedBySettings(projectDirectory: String?): Boolean =
        settingsFiles(projectDirectory).none(::disables)

    /**
     * Те же файлы, что читает сам CLI: политика организации, личные настройки
     * человека и настройки проекта. Значение `disable` отменить нельзя — обратного
     * значения у поля просто нет, — поэтому порядок слоёв тут ни на что не влияет
     * и достаточно найти запрет хоть в одном.
     */
    fun settingsFiles(projectDirectory: String?): List<File> =
        ClaudeSettings.sources(projectDirectory).map { it.file }

    private fun disables(file: File): Boolean =
        ClaudeSettings.permission(file, DISABLE_BYPASS) == "disable"

    private const val DISABLE_BYPASS = "disableBypassPermissionsMode"
}
