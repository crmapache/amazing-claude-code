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
            <p>A native panel for Claude Code inside JetBrains IDEs: a real chat surface with an
            input field and a rich output area instead of a terminal session.</p>
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
              <li>First public release.</li>
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
}
