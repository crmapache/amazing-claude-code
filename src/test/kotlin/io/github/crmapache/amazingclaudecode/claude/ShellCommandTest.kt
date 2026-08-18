package io.github.crmapache.amazingclaudecode.claude

import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Команду bash-режима действительно запускаем — иначе не проверить главного:
 * что она уходит в пользовательскую оболочку, видит рабочую директорию проекта
 * и честно возвращает код возврата.
 *
 * Проверяем «содержит», а не «в точности равно»: команда уходит в оболочку
 * человека вместе с его профилем, а тот у многих печатает своё — приветствие
 * менеджера версий, строку статуса, корпоративный баннер. Тест обязан ловить
 * поломку панели, а не настройки того, кто его запускает.
 *
 * Синтаксис здесь POSIX-овский, а на Windows панель зовёт cmd.exe (см.
 * ShellCommand.shell) — там эти строки не значат ничего, поэтому на нём тесты
 * пропускаются целиком.
 */
class ShellCommandTest {

    private val posix: Boolean
        get() = !System.getProperty("os.name").startsWith("Windows", ignoreCase = true)

    @Test
    fun `удавшаяся команда возвращает свой вывод и нулевой код`() {
        if (!posix) return

        val result = ShellCommand.run("echo acc-marker-hi", workingDirectory = null)

        assertEquals(0, result.exitCode)
        assertTrue(result.stdout.contains("acc-marker-hi"), "нет вывода команды: ${result.stdout}")
    }

    @Test
    fun `упавшая команда возвращает свой код и то, что написала в stderr`() {
        if (!posix) return

        val result = ShellCommand.run("echo acc-marker-boom >&2; exit 3", workingDirectory = null)

        assertEquals(3, result.exitCode)
        assertTrue(result.stderr.contains("acc-marker-boom"), "нет stderr команды: ${result.stderr}")
    }

    @Test
    fun `команда выполняется в рабочей директории проекта, а не там, где запущена IDE`() {
        if (!posix) return

        val directory = Files.createTempDirectory("acc-shell").toRealPath()

        val result = ShellCommand.run("pwd", workingDirectory = directory.toString())

        assertEquals(0, result.exitCode)
        assertTrue(result.stdout.contains(directory.toString()), "команда шла не там: ${result.stdout}")
    }

    @Test
    fun `команда, ждущая ввода, завершается сразу, а не стоит до самого срока`() {
        if (!posix) return

        // Набрать ответ на «Are you sure?» в панели некуда, поэтому ввод закрыт:
        // такая команда обязана получить конец файла и закончиться, иначе
        // карточка в ленте две минуты обещала бы работу, которой нет.
        val result = ShellCommand.run("cat", workingDirectory = null)

        assertEquals(0, result.exitCode)
    }

    @Test
    fun `bash получает явное подключение bashrc отдельной строкой — login-оболочка сама его не читает`() {
        // Строкой ниже, не через «;»: алиас, объявленный и тут же использованный
        // через «;» на одной строке, bash молча не разворачивает.
        val command = ShellCommand.withBashrc("/bin/bash", "echo hi")

        assertEquals("[ -f ~/.bashrc ] && source ~/.bashrc\necho hi", command)
    }

    @Test
    fun `у не-bash оболочки withBashrc команду не трогает — там всё уже читает сам -ilc`() {
        assertEquals("echo hi", ShellCommand.withBashrc("/bin/zsh", "echo hi"))
        assertEquals("echo hi", ShellCommand.withBashrc("/bin/sh", "echo hi"))
    }

    @Test
    fun `длинный вывод обрезается — целиком он не влезает ни в карточку, ни в контекст`() {
        if (!posix) return

        // Заведомо больше предела: панель показывает этот вывод и отправляет его
        // агенту, и мегабайтная простыня не годится ни туда, ни туда.
        val result = ShellCommand.run("for i in $(seq 1 20000); do echo 0123456789; done", workingDirectory = null)

        assertEquals(0, result.exitCode)
        assertTrue(result.stdout.endsWith("… output truncated"), "вывод не обрезан: ${result.stdout.length} символов")
    }
}
