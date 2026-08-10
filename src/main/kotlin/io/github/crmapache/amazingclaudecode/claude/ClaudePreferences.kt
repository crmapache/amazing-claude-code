package io.github.crmapache.amazingclaudecode.claude

import com.intellij.ide.util.PropertiesComponent

/**
 * Выбранные модель, усилие и режим разрешений.
 *
 * Живут в настройках IDE, а не в памяти панели: выбор делают один раз, и повторять
 * его в каждой новой вкладке — и тем более после перезапуска редактора — незачем.
 * Хранилище общее на все проекты: модель выбирают под себя, а не под репозиторий.
 */
internal object ClaudePreferences {

    data class Snapshot(val model: String, val effort: String, val mode: String)

    fun snapshot(): Snapshot = Snapshot(model = model, effort = effort, mode = mode)

    var model: String
        get() = read(MODEL_KEY)
        set(value) = write(MODEL_KEY, value)

    var effort: String
        get() = read(EFFORT_KEY)
        set(value) = write(EFFORT_KEY, value)

    var mode: String
        get() = read(MODE_KEY)
        set(value) = write(MODE_KEY, value)

    /**
     * Путь к исполняемому файлу, указанный руками. Пусто — ищем сами (см.
     * [ClaudeExecutable]). Нужен там, где автоматический поиск промахивается:
     * необычное место установки, PATH оболочки IDE не такой, как в терминале.
     */
    var executablePath: String
        get() = read(EXECUTABLE_KEY)
        set(value) = write(EXECUTABLE_KEY, value)

    /**
     * Звуки, отключённые вручную. Хранится именно выключенное, а не включённое:
     * по умолчанию звучит всё, и пустая настройка — это «как задумано», а не
     * «человек снял все галочки». Иначе новый звук в следующей версии оказался
     * бы выключенным у всех, кто хоть раз открывал этот список.
     */
    var mutedSounds: Set<String>
        get() = read(MUTED_SOUNDS_KEY).split(',').map { it.trim() }.filter { it.isNotEmpty() }.toSet()
        set(value) = write(MUTED_SOUNDS_KEY, value.joinToString(","))

    /**
     * Громкость каждого звука в процентах. Записаны только те, что отличаются
     * от полной: не названный здесь звук идёт как есть.
     *
     * Отдельно от [mutedSounds] намеренно — снятая галочка не должна стирать
     * настроенную громкость: вернув её, человек ждёт свои прежние проценты, а
     * не сотню.
     */
    var soundVolumes: Map<String, Int>
        get() = read(SOUND_VOLUMES_KEY)
            .split(',')
            .mapNotNull { entry ->
                val (id, value) = entry.split('=', limit = 2).takeIf { it.size == 2 } ?: return@mapNotNull null
                val volume = value.trim().toIntOrNull()?.coerceIn(0, 100) ?: return@mapNotNull null
                id.trim().takeIf { it.isNotEmpty() }?.let { it to volume }
            }
            .toMap()
        set(value) = write(SOUND_VOLUMES_KEY, value.entries.joinToString(",") { "${it.key}=${it.value}" })

    private fun read(key: String): String = PropertiesComponent.getInstance().getValue(key).orEmpty()

    private fun write(key: String, value: String) {
        // Пустое значение означает «как у Claude Code по умолчанию»: тогда флаг при
        // запуске не передаётся вовсе.
        PropertiesComponent.getInstance().setValue(key, value.ifEmpty { null })
    }

    private const val MODEL_KEY = "acc.model"
    private const val EFFORT_KEY = "acc.effort"
    private const val MODE_KEY = "acc.mode"
    private const val EXECUTABLE_KEY = "acc.executable"
    private const val MUTED_SOUNDS_KEY = "acc.sounds.muted"
    private const val SOUND_VOLUMES_KEY = "acc.sounds.volumes"
}
