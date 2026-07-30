package io.github.crmapache.amazingclaudecode.claude

import com.intellij.testFramework.fixtures.BasePlatformTestCase

/**
 * Выбор модели и режима переживает перезапуск IDE, поэтому лежит в её настройках.
 * Тест сторожит именно это: молча пропавшее хранилище выглядит как «панель опять
 * забыла мою модель».
 */
class ClaudePreferencesTest : BasePlatformTestCase() {

    fun testSnapshotKeepsWhatWasWritten() {
        ClaudePreferences.model = "haiku"
        ClaudePreferences.effort = "low"
        ClaudePreferences.mode = "acceptEdits"

        val snapshot = ClaudePreferences.snapshot()

        assertEquals("haiku", snapshot.model)
        assertEquals("low", snapshot.effort)
        assertEquals("acceptEdits", snapshot.mode)
    }

    fun testEmptyValueMeansDefault() {
        ClaudePreferences.model = "opus"
        ClaudePreferences.model = ""

        // Пустая строка означает «как у Claude Code по умолчанию»: тогда флаг при
        // запуске процесса не передаётся вовсе.
        assertEquals("", ClaudePreferences.model)
    }

    override fun tearDown() {
        ClaudePreferences.model = ""
        ClaudePreferences.effort = ""
        ClaudePreferences.mode = ""
        super.tearDown()
    }
}
