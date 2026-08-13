import org.jetbrains.intellij.platform.gradle.TestFrameworkType
import org.jetbrains.intellij.platform.gradle.tasks.RunIdeTask

plugins {
    id("org.jetbrains.kotlin.jvm")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("org.jetbrains.intellij.platform")
}

group = providers.gradleProperty("group").get()
version = providers.gradleProperty("version").get()

kotlin {
    jvmToolchain(21)
}

// Стандартная библиотека Kotlin и аннотации приходят из самой IDE, причём более
// новых версий. Свои копии в архиве плагина только спорят с платформенными и
// добавляют лишние два мегабайта.
configurations.runtimeClasspath {
    exclude(group = "org.jetbrains.kotlin", module = "kotlin-stdlib")
    exclude(group = "org.jetbrains", module = "annotations")
}

dependencies {
    // Разбор потока событий агента. Версию держим той же, что бандлят другие
    // плагины под эту платформу, чтобы не спорить с классами из IDE.
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")

    testImplementation(kotlin("test"))

    intellijPlatform {
        create(
            providers.gradleProperty("platformType"),
            providers.gradleProperty("platformVersion"),
        )
        // Встроенный браузер вынесен из платформы в отдельный bundled-плагин,
        // без этой зависимости классы JCEF не видны ни при сборке, ни в рантайме.
        bundledPlugin("com.intellij.modules.jcef")
        // Вход в Claude Code интерактивный, поэтому идёт во встроенном терминале.
        bundledPlugin("org.jetbrains.plugins.terminal")
        testFramework(TestFrameworkType.Platform)
    }
}

intellijPlatform {
    pluginConfiguration {
        id = "io.github.crmapache.amazingclaudecode"
        name = "Amazing Claude Code"
        version = providers.gradleProperty("version")
        description =
            """
            <p>A native chat panel for Claude Code inside JetBrains IDEs — a real input field and a
            readable output area, instead of a terminal session.</p>
            <p>It has everything the Claude Code CLI does: the same models, subscription, slash
            commands, and permission modes. On top of that, it adds things a terminal can't do:</p>
            <ul>
              <li>Branch any conversation into a new tab at any point, without touching the original</li>
              <li>Quote Claude's own output straight into your next message, as a compact reference</li>
              <li>Send a precise file-and-line reference from the editor, so Claude reads the real
              surrounding code instead of a pasted snippet</li>
              <li>Attach files, folders, and images through the IDE's own picker, or reference project
              files right as you type</li>
            </ul>
            <p>Same Claude Code, properly integrated into your editor.</p>
            """.trimIndent()

        // Маркетплейс требует у автора рабочие адрес и почту: по ним модерация
        // связывается с автором и по ним же пользователь ищет поддержку.
        vendor {
            name = "Maksim Zolotoi"
            email = "mzpizote@gmail.com"
            url = "https://github.com/crmapache"
        }

        // Список изменений виден в карточке плагина и в диалоге обновления.
        changeNotes =
            """
            <ul>
              <li>Fixed: after a usage limit, a crash, or any other stop, an unfinished task list
              stayed on screen and could not be closed — even if you asked Claude to close it. A new
              message now hides the old list; if the work continues, a fresh list appears.</li>
              <li>Fixed: messages sent while <code>/compact</code> was running were swallowed and
              never executed after compaction finished. They now wait in the queue and run once
              compaction is done.</li>
              <li>A fourth composer layout — Compact — for tool windows docked short and wide,
              where the usual bottom layout's separate status line and full-size task list don't
              fit. The input stays at the bottom, but MODEL/EFFORT/MODE move into the composer
              itself, the context bar becomes a vertical strip instead of a horizontal one, the
              branch and its PR share the row with the task list, and the stream switcher collapses
              into chips in the header instead of its own row. The task list itself shows only the
              current task plus a count, with an arrow to expand the rest.</li>
              <li>A question repeated back in a sent message — a line ending in "?" — now shows
              dimmed, with a small gap above it, so the answer next to it reads apart from the
              question it's answering.</li>
              <li>Fixed: shell command output typed with <code>!</code> leaked its raw
              <code>&lt;bash-input&gt;</code>/<code>&lt;bash-stdout&gt;</code> markup into
              conversation titles, tab names, and the queued-message row instead of showing what was
              actually asked.</li>
              <li>Dragging a file from the project tree or the system file explorer now highlights
              the composer as a drop target, the same way a browser-native drag already did. Also
              fixes native drops from outside the IDE being silently rejected.</li>
              <li>Fixed: the drag handle for the left/right input column highlighted and could be
              dragged, but the mouse cursor over it stayed a plain arrow instead of a resize cursor.
              Fixed: Ctrl+Z in the input triggered some other, chip-unaware undo instead of the
              input's own — only Cmd+Z was caught before, so Ctrl+Z fell through to whatever the
              embedded browser does with the underlying content by default.</li>
              <li>The input box can now sit to the left or right of the feed instead of always at the
              bottom — pick it from a new button in the header, next to History/MCP/Plugins/Sounds.
              In the left/right layout the input becomes a resizable column that fills the panel's
              full height, with a drag handle between it and the feed; the choice and the column's
              width are saved and survive a restart.</li>
              <li>Tab names now come from Claude Code itself — its own <code>ai-title</code> event —
              instead of being guessed from the first line of the first message, so a short opener
              like "Давай" or a pasted image placeholder no longer becomes the whole name. Until that
              arrives, the tab shows a live guess built from every meaningful line typed, not just the
              first. <code>/clear</code> now resets the tab's name along with the conversation, and
              each card in History shows the conversation's own id next to the date and message
              count.</li>
              <li>MCP servers are now shown the way the terminal shows them. The list is grouped by
              where each server comes from — this project, your own config, claude.ai connectors,
              built-ins and plugins — and every server says what state it is really in: connected,
              needs authentication, failed, connecting. A server that failed explains why, right
              under its name. A server that needs a sign-in now has an "Authenticate" button: the
              panel opens the sign-in page in your browser, Claude Code catches the answer, and the
              list updates itself. Reconnect now applies to a single server instead of restarting
              the whole conversation. All of this comes from Claude Code itself over the same
              channel the terminal's <code>/mcp</code> uses, instead of being read out of the text
              printed by <code>claude mcp list</code> — which is why the panel used to show
              "Pending approval (run claude to approve)" and offer no way to approve anything.</li>
              <li>An agent or a background command can now be stopped from the chip in the header:
              hover it and a cross appears. It asks first — the cross is small and an agent can be
              half an hour of work — and then stops that one task, leaving the conversation itself
              running.</li>
              <li>A question with options can now be closed without answering it: the cross in its
              header releases the turn, so you can reply in your own words in the message box
              instead. Claude is told the question was closed, so it doesn't sit waiting for a pick
              that will never come.</li>
              <li>Every code block in a reply now has its own copy button, and a short inline piece
              — a branch name, a flag, a path — is copied by clicking it. Copying the whole reply to
              get one command out of it meant cleaning the story around it afterwards.</li>
              <li>A pasted block in a sent message, when nothing follows it, now takes the full
              width and shows how many lines were pasted plus the first few of them, instead of
              seven words in a narrow chip.</li>
              <li>Fixed: a conversation started by a slash command was listed in History under a raw
              tag — "&lt;command-message&gt;task&lt;/command-message&gt;" instead of a name. Such a
              conversation is now named by the command itself, with its argument, and the shell's own
              service messages — the body of a called skill, a background-task notice, an image
              caption — no longer pass for something you typed.</li>
              <li>Fixed: a conversation opened from History showed the context bar full, whatever was
              really in it. The panel guessed the used context from the saved transcript, which
              doesn't record the model's window size, so on a 1M model the guess was divided by the
              usual 200k and always came out full. The panel now asks the conversation itself and
              shows the same number <code>/context</code> prints. Opening a past conversation also
              starts it right away, so it's ready to answer a few seconds earlier.</li>
              <li>The message count in History now counts what you said — your messages and the
              commands you ran. It used to count every service record in the transcript, tool results
              included: "375 messages" where you had written thirty.</li>
              <li>Fixed: a shell command was shown as a subagent. Anything running longer than a few
              seconds took a chip labelled "agent:agent" in the switcher, and a command started in the
              background — a dev server, say — kept one for as long as the process lived, reading
              "1010m 08s" by the next morning. A background command now has a chip of its own that
              names it and counts how long it has been up; when it ends the chip goes away and its own
              card in the feed says how long it ran and how it ended, in red with the exit code if it
              failed. An ordinary long command doesn't appear up there at all.</li>
              <li>Fixed: one subagent took two chips in the switcher — the call that started it and
              the system event about it were counted as two different agents.</li>
              <li>Fixed: an agent that was stopped or failed looked exactly like one that finished its
              work. Its chip and its log now say what actually happened.</li>
              <li>Anything running longer than an hour is now timed in hours: "16h 50m" instead of
              "1010m 08s".</li>
              <li>The paperclip and the slash next to the input now name themselves on hover, the way
              the icons in the header already did — and so does the play button in the sound
              settings, whose label never drew at all.</li>
              <li>Fixed: the panel asked permission for almost everything and the mode you picked
              barely mattered — "Don't ask", "Auto" and "Bypass" still prompted, "Always allow"
              changed nothing, and even <code>ls</code> or <code>git status</code> needed a click.
              The panel no longer second-guesses Claude Code: it asks exactly where the terminal
              would, honours the selected mode, and respects the permission rules you already have.
              "Always allow" now takes hold at once, survives a restart, and applies in the terminal
              too.</li>
              <li>Fixed: conversations started in the terminal were missing from History when the
              project path contained a space or an underscore — and on Windows the list was empty
              every time.</li>
              <li>A command typed with <code>!</code> in front now runs in your own shell, the way it
              does in the Claude Code terminal: <code>!git status</code>, <code>!pnpm test</code>. The
              panel runs it itself, in the project directory, and shows the output as a card in the
              feed — no agent turn spent on it and no permission to approve. Claude sees the command
              and its output attached to your next message.</li>
              <li>A multi-line paste now collapses into a chip showing the start of the text, so a
              pasted log no longer pushes everything else out of the input. The chip expands back
              into plain text with one click, and hovering it shows the whole thing.</li>
              <li>Arrow keys no longer step over an attachment chip: the caret stops on it and
              highlights it, Backspace removes it, and the same arrow again moves past. The
              highlight looks the same on chips of every colour.</li>
              <li>Options in a question and buttons in a permission request are numbered, and the
              number keys pick them — as long as the input is empty, so typing a message still types
              digits. Enter moves to the next question and sends the answers once everything is
              answered.</li>
              <li>The context bar now fills as the turn runs instead of only updating when it ends —
              until now it stood at zero through the longest request of all, the first one.</li>
              <li>Answers to a question are now shown in the feed as question-and-answer pairs
              instead of a bare list of answers.</li>
              <li>Fixed: a link Claude put in a heading (or in bold) was not clickable — it rendered
              as plain bold text.</li>
              <li>Fixed: the gap between two attachment chips was half as wide again as a normal
              word space, so neighbouring chips read as torn apart.</li>
              <li>The panel now calls you out loud when it needs you: a turn that finished, a tool
              call waiting for approval, a question, a plan waiting to be accepted, a subscription
              limit that stopped the run, and trouble — an error, a process that died on its own, a
              session that got signed out. The "♪" button in the header lists all six with a
              checkbox, a volume slider and a play button each.</li>
              <li>A sound only plays when you aren't already looking at what it's about. Anything
              from a background tab always rings; from the open tab it rings only when looking at it
              isn't possible — the panel is collapsed, hidden behind another tool window, or the IDE
              window itself is not the one you're in. A conversation replayed from history stays
              quiet.</li>
              <li>A subscription limit that stops the run is now shown in the feed, with the time it
              resets — until now the panel said nothing at all about it.</li>
              <li>Fixed: the panel crashed with "t.filter is not a function" on /compact — the
              summary arrives as plain text rather than the usual message blocks.</li>
              <li>Fixed: when Claude Code switched the model on its own mid-run (its safeguards do
              that), the panel kept naming the old one. The model that is really running is now shown
              and ticked in the picker, even when the catalog doesn't list it.</li>
              <li>Fixed: the dashes in the context-compaction bar looked uneven — the filled part
              drew its own row of dashes on top of the one underneath.</li>
              <li>The model list now comes from Claude Code itself instead of a list baked into the
              panel: the models your account can actually use, with the ones your plan or your
              organisation blocks marked as unavailable. A model the agent refuses no longer stays
              in the settings, and the panel keeps showing the one that is really running.</li>
              <li>The panel now finds the CLI where it actually is — npm, bun, volta, scoop, and the
              Windows variants of the file name. When it still can't, the screen lists every place
              it looked and what your own shell answers, and lets you point at the file by hand.</li>
              <li>Questions from the agent are answerable now: pick an option or type your own answer,
              and the run continues from the exact point where it asked.</li>
              <li>Plans and answers are rendered as real markdown — headings, nested bullets, inline
              code — instead of a flattened list of steps.</li>
              <li>Context compaction has its own card with a progress bar, so a long silent pause is
              no longer unexplained. The context window is shown as it fills, straight from the CLI.</li>
              <li>Tabs can be reordered by dragging, and a conversation moves together with its forks.</li>
              <li>An error inside the panel now shows a crash screen with a reload button instead of
              going black. Conversations live in the CLI and survive the reload.</li>
              <li>A note typed while a plan is waiting goes to the agent as the reason to keep
              planning — with any images attached to it — and lands in the tab you typed it in.</li>
              <li>Fixed: the panel could hang on "loading" forever while looking for the CLI if the
              login shell was slow to answer.</li>
              <li>Fixed: an interrupted context compaction left the tab without a status line for the
              rest of the session, and reloading the panel dropped every event that arrived during
              the reload.</li>
              <li>Fixed: answering a plan or a question after the conversation restarted silently
              lost what you wrote; it is sent as an ordinary message now.</li>
              <li>Fixed: reopening a past conversation turned the first message into a decision on a
              plan from that old conversation.</li>
              <li>Fixed: a background tab waiting for you on a plan or a question kept showing
              "working" instead of asking for attention.</li>
              <li>Fixed: dragging a tab and releasing it outside the tab strip swallowed the next
              click, and the manual CLI path field opened empty and could wipe a saved path.</li>
              <li>Fixed: a tight console line spacing setting made selected text overlap between
              wrapped lines. The panel now enforces a minimum line height regardless of the
              console font setting.</li>
              <li>Fixed: attachment and quote chips (in the input and once sent) sat slightly below
              the surrounding text instead of centered on it, and their icons didn't line up with
              each other from one chip to the next.</li>
              <li>The selection popover over the agent's reply now offers Quote and Fork from here
              — Copy was dropped, the browser's own copy shortcut already covers a selection.</li>
              <li>The input's placeholder text is shorter — just "Ask, or describe a change…".</li>
              <li>The attach and slash-command buttons are icon-only now, no more "attach" / "command"
              labels next to them.</li>
              <li>A message sent while the agent is working now reaches it right away, the way it
              does in the terminal: the agent picks it up at its next step instead of only after
              the run ends. Queue and Send are separate buttons now — Queue holds the message
              until the current run finishes, Send (and Enter) delivers it now. Both are disabled
              while the input is empty, and Queue is also disabled when nothing is running.</li>
              <li>Fixed: the first Shift+Enter in the input looked like it did nothing — only the
              next press broke the line, and whatever you typed in between landed before the break
              instead of on the new line. Pasted text ending in a line break did the same.</li>
              <li>The input now uses the same console font, size and line spacing as the feed, so a
              message looks exactly the same while you type it and after you send it.</li>
              <li>Fixed: the panel was drawn at a quarter of its size, and changing the console
              font size moved it the wrong way. The zoom that scales the panel to the IDE font
              was being converted twice.</li>
              <li>The panel now takes its fonts from the IDE: the feed is drawn with the console
              font, at its size and line spacing, so it reads like the terminal next to it, and
              the whole panel follows when you change them. The manual font-size control is gone.</li>
              <li>Streamed answers arrive at an even pace instead of in bursts, and new words fade
              in as a left-to-right wave.</li>
              <li>Fixed: multi-line messages collapsed onto a single line once sent, even though
              the line breaks were kept everywhere else.</li>
              <li>Approving a plan now switches permissions to Bypass, so the agent can carry out
              the plan without asking for anything until you change the mode yourself.</li>
              <li>Fixed: a fast burst of tool calls made the group header flicker between the
              current tool's name and a bare count.</li>
              <li>Image references (<code>[Image #N]</code>) are now numbered across the whole
              conversation instead of restarting at 1 on every message.</li>
              <li>Fixed: dragging a queued message to reorder it silently did nothing.</li>
              <li>Fixed: selecting a past conversation from history that contained a plain-text
              message (no attachments) froze the entire panel instead of loading it.</li>
              <li>Subagents now get their own view: a switcher next to the input moves between the
              main conversation and each running agent, with its full log, and the questions and
              permission requests an agent raises stay attached to it.</li>
              <li>Task list, plan, question, and permission panels are pinned above the input
              instead of scrolling away with the feed.</li>
              <li>New colour scheme — a cooler, quieter palette that sits closer to the IDE.</li>
              <li>Fixed: permission requests never reached the panel, so a tool call waiting for
              approval hung silently until it timed out.</li>
              <li>Fixed: choosing "Ask permissions" had no effect — the session fell back to
              whatever permission mode the local Claude Code config specified.</li>
              <li>Fixed: slash commands whose description spans several lines showed a stray
              character instead of the description.</li>
            </ul>
            """.trimIndent()

        ideaVersion {
            sinceBuild = providers.gradleProperty("pluginSinceBuild")
            // Верхнюю границу не фиксируем: плагин живёт на базовом API, ломаться
            // от минорных обновлений IDE ему нечем.
            untilBuild = provider { null }
        }
    }

    // Проверка совместимости архива с реальными сборками IDE. Маркетплейс гоняет
    // тот же верификатор при модерации, поэтому дешевле узнать про несовместимость
    // до загрузки, а не через отказ.
    pluginVerification {
        ides {
            recommended()
        }
    }

    // Подпись архива. Ключ и цепочка сертификатов приходят из окружения: в
    // репозитории им не место. Без переменных задача просто не выполняется, и
    // публикуется неподписанный архив — маркетплейс это принимает.
    signing {
        certificateChain = providers.environmentVariable("ACC_CERTIFICATE_CHAIN")
        privateKey = providers.environmentVariable("ACC_PRIVATE_KEY")
        password = providers.environmentVariable("ACC_PRIVATE_KEY_PASSWORD")
    }

    publishing {
        token = providers.environmentVariable("ACC_PUBLISH_TOKEN")
        // Предрелизные версии уходят в отдельный канал, чтобы не приезжать всем
        // подряд обновлением: подписаться на него надо руками в настройках IDE.
        channels = providers.gradleProperty("version").map { version ->
            listOf(version.substringAfter('-', "default").substringBefore('.'))
        }
    }
}

// --- Интерфейс на React -----------------------------------------------------

private val webviewDir = layout.projectDirectory.dir("webview")
private val webviewDist = webviewDir.dir("dist")

val installWebview by tasks.registering(Exec::class) {
    description = "Ставит зависимости интерфейса"
    workingDir = webviewDir.asFile
    commandLine("pnpm", "install")

    inputs.file(webviewDir.file("package.json"))
    outputs.dir(webviewDir.dir("node_modules"))
    // node_modules переживает clean, поэтому решение о пропуске задачи принимаем
    // по слепку package.json, а не по факту наличия папки.
    outputs.cacheIf { false }
}

val buildWebview by tasks.registering(Exec::class) {
    description = "Собирает статику интерфейса"
    dependsOn(installWebview)
    workingDir = webviewDir.asFile
    commandLine("pnpm", "run", "build")

    inputs.dir(webviewDir.dir("src"))
    inputs.files(
        webviewDir.file("package.json"),
        webviewDir.file("index.html"),
        webviewDir.file("vite.config.ts"),
        webviewDir.file("tsconfig.json"),
    )
    outputs.dir(webviewDist)
}

tasks.processResources {
    dependsOn(buildWebview)
    from(webviewDist) {
        into("webview")
    }
}

// Тестовая IDE. Передаём адрес dev-сервера, если он задан: тогда панель грузит
// интерфейс с него и правки видны без пересборки плагина.
tasks.withType<RunIdeTask>().configureEach {
    systemProperty(
        "acc.webview.devUrl",
        providers.gradleProperty("webviewDevUrl").getOrElse(""),
    )

    // Панель проектная, поэтому на пустом экране приветствия её не увидеть.
    // -PopenProject=<путь> открывает проект сразу при старте тестовой IDE.
    providers.gradleProperty("openProject").orNull?.let { path -> args(path) }

    // В тестовой IDE панель открывается сама: искать кнопку каждый прогон незачем.
    systemProperty("acc.autoOpen", "true")

    // -PjcefDebugPort=9222 открывает панель для внешнего отладчика по протоколу
    // Chrome DevTools: к ней можно подключиться браузером или скриптом и смотреть
    // настоящую панель в настоящей IDE, а не её копию в браузере. По умолчанию
    // выключено — порт наружу просто так держать незачем.
    providers.gradleProperty("jcefDebugPort").orNull?.let { port ->
        systemProperty("ide.browser.jcef.debug.port", port)
    }
}
