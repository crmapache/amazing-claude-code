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

    private fun read(key: String): String = PropertiesComponent.getInstance().getValue(key).orEmpty()

    private fun write(key: String, value: String) {
        // Пустое значение означает «как у Claude Code по умолчанию»: тогда флаг при
        // запуске не передаётся вовсе.
        PropertiesComponent.getInstance().setValue(key, value.ifEmpty { null })
    }

    private const val MODEL_KEY = "acc.model"
    private const val EFFORT_KEY = "acc.effort"
    private const val MODE_KEY = "acc.mode"
}
