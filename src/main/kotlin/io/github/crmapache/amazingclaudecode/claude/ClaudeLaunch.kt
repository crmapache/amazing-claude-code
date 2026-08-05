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

    /**
     * Канал, по которому CLI спрашивает разрешение у самой панели, а не у хука.
     *
     * Без него потоковый режим считается «безлюдным» и выключает все инструменты,
     * которым нужен живой человек, — в первую очередь ExitPlanMode. Агент про него
     * знает и всё равно вызывает, но получает «No such tool available: ExitPlanMode
     * … is not enabled in this context», после чего пересказывает план текстом и
     * заканчивает ход. В панели это выглядело так: карточка плана с кнопками
     * появлялась (её рисует сам вызов инструмента), а «Approve & run» оказывалось
     * пустышкой — отвечать было уже некому и нечему.
     *
     * Со включённым каналом CLI шлёт control_request `can_use_tool` и ждёт ответа
     * (см. ClaudeSession): «разрешаю» возвращает агенту «User has approved your
     * plan», он тут же продолжает работу в том же ходе, а режим CLI переключает
     * сам и сообщает об этом обычным системным событием.
     *
     * Значение "stdio" — то же, что подставляет себе Agent SDK: спрашивать по
     * тому же потоку, которым идёт разговор.
     */
    const val PERMISSION_CHANNEL_FLAG = "--permission-prompt-tool"

    /**
     * Инструмент вопроса с вариантами ответа. Тот же канал включает и его, но
     * ответить на него панели пока нечем: разрешение — это только «да» или «нет»,
     * а выбранный вариант возвращается отдельным каналом диалогов, которого у нас
     * ещё нет. Разрешённый и неотвеченный, он молча возвращает агенту «пользователь
     * не ответил» — хуже, чем его отсутствие: без него агент просто задаёт свой
     * вопрос обычным текстом, и человек на него отвечает.
     */
    const val ASK_TOOL = "AskUserQuestion"

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

        addAll(listOf(PERMISSION_CHANNEL_FLAG, "stdio"))
        addAll(listOf("--disallowed-tools", ASK_TOOL))

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
