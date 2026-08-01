package io.github.crmapache.amazingclaudecode.claude

/**
 * С чем поднимается процесс разговора.
 *
 * Вынесено из сессии отдельно, потому что это единственное место, где решается
 * судьба разговора на весь его срок: часть решений после запуска уже не поменять,
 * и проверять их лучше тестом, а не глазами по логам.
 */
internal object ClaudeLaunch {

    /**
     * Разрешает переключиться в режим «без вопросов» посреди разговора.
     *
     * Сам по себе ключ ничего не разрешает — он лишь делает режим доступным. Без
     * него CLI отвечает на просьбу сменить режим отказом («сессия запущена без
     * --dangerously-skip-permissions»), и кнопка «Approve & run» под планом
     * оказывалась пустышкой: человек одобрял план, панель откатывалась обратно в
     * plan, а агент продолжал спрашивать разрешение на каждый шаг.
     *
     * Стартовать сразу в «без вопросов» CLI позволяет и без ключа — ломалось
     * именно переключение на лету, то есть ровно тот путь, которым идёт одобрение
     * плана.
     */
    const val ALLOW_BYPASS_FLAG = "--allow-dangerously-skip-permissions"

    fun arguments(
        settingsJson: String?,
        model: String,
        effort: String,
        permissionMode: String?,
        conversationId: String?,
        forkFrom: String?,
        allowBypassSwitch: Boolean,
    ): List<String> = buildList {
        add("--print")
        // Без --verbose поток событий не отдаётся, это требование самого CLI.
        add("--verbose")
        addAll(listOf("--output-format", "stream-json"))
        addAll(listOf("--input-format", "stream-json"))
        add("--include-partial-messages")

        settingsJson?.let { addAll(listOf("--settings", it)) }

        if (model.isNotEmpty()) addAll(listOf("--model", model))
        if (effort.isNotEmpty()) addAll(listOf("--effort", effort))

        // Режим передаём всегда — даже «спрашивать всегда». Умолчание у CLI своё
        // (permissions.defaultMode из личного конфига), и промолчав здесь, мы
        // отдавали бы выбор ему: см. PermissionModes.
        permissionMode
            ?.let(PermissionModes::normalize)
            ?.let { addAll(listOf("--permission-mode", it)) }

        // Только если этот CLI вообще знает такой ключ: неизвестный он не пропустит
        // мимо ушей, а откажется запускаться вовсе.
        if (allowBypassSwitch) add(ALLOW_BYPASS_FLAG)

        when {
            // Продолжаем свой разговор после перезапуска процесса.
            conversationId != null -> addAll(listOf("--resume", conversationId))
            // Первый запуск ветки: копируем переписку родителя, но с новым номером.
            forkFrom != null -> addAll(listOf("--resume", forkFrom, "--fork-session"))
        }
    }
}
