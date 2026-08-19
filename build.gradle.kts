import org.jetbrains.changelog.Changelog
import org.jetbrains.intellij.platform.gradle.TestFrameworkType
import org.jetbrains.intellij.platform.gradle.tasks.RunIdeTask
import org.jetbrains.intellij.platform.gradle.tasks.VerifyPluginTask

plugins {
    id("org.jetbrains.kotlin.jvm")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("org.jetbrains.intellij.platform")
    id("org.jetbrains.changelog")
}

group = providers.gradleProperty("group").get()
version = providers.gradleProperty("version").get()

kotlin {
    jvmToolchain(21)

    compilerOptions {
        // Интерфейсы платформы (ToolWindowFactory в первую очередь) несут готовые
        // реализации своих необязательных методов. По умолчанию Kotlin на всякий
        // случай штампует в нашем классе переходники к ним — и со стороны это
        // выглядит так, будто плагин переопределяет десяток чужих методов, включая
        // устаревшие и экспериментальные. Верификатор маркетплейса ровно об этом и
        // сообщал: десять устаревших и шесть экспериментальных обращений, которых
        // в исходниках нет ни одного. Переходники нужны только тем, кто собирался
        // против старых версий этих интерфейсов; у плагина таких потребителей нет.
        jvmDefault = org.jetbrains.kotlin.gradle.dsl.JvmDefaultMode.NO_COMPATIBILITY
    }
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
        // Окно коммита отдаёт перетаскиваемое своим объектом, а не списком
        // файлов, и разобрать его нечем без классов самого VCS (см.
        // WebviewFileDrop.changedPaths).
        bundledModule("intellij.platform.vcs.impl.shared")
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

        /**
         * Список изменений виден в карточке плагина и в диалоге обновления, поэтому
         * в нём должна стоять только новая версия. Раньше он лежал здесь же одним
         * блоком, куда пункты дописывались сверху и никогда не убирались: к 0.7.4
         * там накопилось восемь десятков пунктов за всю историю, и человек, обновив
         * плагин, читал простыню на три экрана вместо пяти строк про эту версию.
         *
         * Теперь пункты живут в CHANGELOG.md по версиям, а сюда попадает ровно
         * секция собираемой версии. Нет такой секции (собираем то, что ещё не
         * выпущено) — берётся Unreleased.
         */
        changeNotes = providers.provider {
            with(changelog) {
                renderItem(
                    (getOrNull(project.version.toString()) ?: getUnreleased())
                        .withHeader(false)
                        .withEmptySections(false),
                    Changelog.OutputType.HTML,
                )
            }
        }

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

        // Что считаем провалом проверки. Список явный, потому что от умолчания он
        // отличается в обе стороны.
        //
        // Строже: экспериментальное тоже роняет задачу. Своего экспериментального
        // в плагине нет ни одного обращения, и держать этот счёт на нуле дешевле,
        // чем однажды разбирать накопившийся список в карточке версии.
        //
        // Мягче: устаревшее и закрытое для плагинов задачу не роняют. Такие места
        // наперечёт, все осознанные, и поддерживаемой замены у платформы для них
        // нет: открытие терминала для входа (ClaudeLogin), прежняя пара методов
        // обработчика ресурсов, без которой не грузится сама панель
        // (WebviewResources.ResourceHandler), перетаскивание из окна коммита
        // (WebviewFileDrop.changedPaths) и прогрев настроек прокси для встроенного
        // браузера (WebviewHost.loadProxySettings). Пока замены не появится,
        // зелёной задачу сделает только отказ от самих возможностей.
        failureLevel = listOf(
            VerifyPluginTask.FailureLevel.COMPATIBILITY_PROBLEMS,
            VerifyPluginTask.FailureLevel.EXPERIMENTAL_API_USAGES,
            VerifyPluginTask.FailureLevel.SCHEDULED_FOR_REMOVAL_API_USAGES,
            VerifyPluginTask.FailureLevel.OVERRIDE_ONLY_API_USAGES,
            VerifyPluginTask.FailureLevel.NON_EXTENDABLE_API_USAGES,
            VerifyPluginTask.FailureLevel.MISSING_DEPENDENCIES,
            VerifyPluginTask.FailureLevel.INVALID_PLUGIN,
        )
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

// --- Список изменений -------------------------------------------------------

changelog {
    version = providers.gradleProperty("version")
    // Пункты пишутся простым списком. Делить пять строк на Added/Fixed/Changed
    // незачем, а пустые заголовки утащило бы в карточку плагина.
    groups.empty()
    repositoryUrl = "https://github.com/crmapache/amazing-claude-code"
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
