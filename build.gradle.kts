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
        // The platform's interfaces (ToolWindowFactory first of all) carry ready implementations of
        // their optional methods. By default Kotlin stamps bridge methods to them into our class just in
        // case - and from the outside that looks as though the plugin overrides a dozen foreign methods,
        // deprecated and experimental ones included. That is exactly what the marketplace's verifier
        // reported: ten deprecated and six experimental usages, not one of which exists in the sources.
        // Bridges are needed only by code compiled against older versions of those interfaces; the
        // plugin has no such consumers.
        jvmDefault = org.jetbrains.kotlin.gradle.dsl.JvmDefaultMode.NO_COMPATIBILITY
    }
}

// The Kotlin standard library and the annotations come from the IDE itself, and in newer versions at
// that. Copies of our own in the plugin's archive only argue with the platform's and add two megabytes
// for nothing.
configurations.runtimeClasspath {
    exclude(group = "org.jetbrains.kotlin", module = "kotlin-stdlib")
    exclude(group = "org.jetbrains", module = "annotations")
}

dependencies {
    // Parsing the agent's event stream. We keep the version the other plugins for this platform bundle,
    // so as not to argue with the IDE's own classes.
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")

    testImplementation(kotlin("test"))

    intellijPlatform {
        create(
            providers.gradleProperty("platformType"),
            providers.gradleProperty("platformVersion"),
        )
        // The embedded browser was moved out of the platform into a separate bundled plugin; without
        // this dependency the JCEF classes are visible neither at build time nor at runtime.
        bundledPlugin("com.intellij.modules.jcef")
        // Signing in to Claude Code is interactive, so it goes through the built-in terminal.
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

        // The marketplace requires a working address and email from the author: moderation contacts the
        // author by them, and users look for support by them too.
        vendor {
            name = "Maksim Zolotoi"
            email = "mzpizote@gmail.com"
            url = "https://github.com/crmapache"
        }

        /**
         * The change list is visible in the plugin's card and in the update dialog, so it must hold the
         * new version only. It used to live right here as one block, with entries appended at the top and
         * never removed: by 0.7.4 it had gathered eighty entries covering the whole history, and a person
         * updating the plugin read three screens of text instead of five lines about this version.
         *
         * Now the entries live in CHANGELOG.md by version, and exactly the section of the version being
         * built lands here. When there is no such section (we are building what has not been released
         * yet), Unreleased is taken.
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
            // We do not pin the upper bound: the plugin lives on the base API and has nothing to break
            // over a minor IDE update.
            untilBuild = provider { null }
        }
    }

    // Checking the archive's compatibility against real IDE builds. The marketplace runs the same
    // verifier during moderation, so learning about an incompatibility before uploading is cheaper than
    // learning about it through a rejection.
    pluginVerification {
        ides {
            recommended()
        }

        // What counts as a failed check. The list is explicit because it differs from the default in
        // both directions.
        //
        // Stricter: experimental usages fail the task too. The plugin has not a single experimental
        // usage of its own, and keeping that count at zero is cheaper than one day sorting through an
        // accumulated list in a version's card.
        //
        // Softer: deprecated usages do not fail the task. There are two such places, both deliberate,
        // and the platform offers no supported replacement for either: opening a terminal for the sign-in
        // (ClaudeLogin) and the resource handler's previous pair of methods, without which the panel does
        // not load at all (WebviewResources.ResourceHandler).
        //
        // There is not a single usage of what is closed to plugins left - and none should appear: the
        // marketplace does not let a version through moderation because of those. So they fail the task
        // on a par with an incompatibility.
        failureLevel = listOf(
            VerifyPluginTask.FailureLevel.COMPATIBILITY_PROBLEMS,
            VerifyPluginTask.FailureLevel.INTERNAL_API_USAGES,
            VerifyPluginTask.FailureLevel.EXPERIMENTAL_API_USAGES,
            VerifyPluginTask.FailureLevel.SCHEDULED_FOR_REMOVAL_API_USAGES,
            VerifyPluginTask.FailureLevel.OVERRIDE_ONLY_API_USAGES,
            VerifyPluginTask.FailureLevel.NON_EXTENDABLE_API_USAGES,
            VerifyPluginTask.FailureLevel.MISSING_DEPENDENCIES,
            VerifyPluginTask.FailureLevel.INVALID_PLUGIN,
        )
    }

    // Signing the archive. The key and the certificate chain come from the environment: they have no
    // place in the repository. Without those variables the task simply does not run and an unsigned
    // archive is published - the marketplace accepts that.
    signing {
        certificateChain = providers.environmentVariable("ACC_CERTIFICATE_CHAIN")
        privateKey = providers.environmentVariable("ACC_PRIVATE_KEY")
        password = providers.environmentVariable("ACC_PRIVATE_KEY_PASSWORD")
    }

    publishing {
        token = providers.environmentVariable("ACC_PUBLISH_TOKEN")
        // Pre-release versions go into a channel of their own, so as not to arrive as an update for
        // everyone: subscribing to it takes a deliberate step in the IDE's settings.
        channels = providers.gradleProperty("version").map { version ->
            listOf(version.substringAfter('-', "default").substringBefore('.'))
        }
    }
}

// --- The change list --------------------------------------------------------

changelog {
    version = providers.gradleProperty("version")
    // The entries are written as a plain list. Splitting five lines across Added/Fixed/Changed serves
    // nothing, and empty headings would be dragged into the plugin's card.
    groups.empty()
    repositoryUrl = "https://github.com/crmapache/amazing-claude-code"
}

// --- The React interface ----------------------------------------------------

private val webviewDir = layout.projectDirectory.dir("webview")
private val webviewDist = webviewDir.dir("dist")

val installWebview by tasks.registering(Exec::class) {
    description = "Installs the interface's dependencies"
    workingDir = webviewDir.asFile
    commandLine("pnpm", "install")

    inputs.file(webviewDir.file("package.json"))
    outputs.dir(webviewDir.dir("node_modules"))
    // node_modules outlives a clean, so the decision to skip the task is made from a snapshot of
    // package.json rather than from the folder being there.
    outputs.cacheIf { false }
}

val buildWebview by tasks.registering(Exec::class) {
    description = "Builds the interface's static assets"
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

// The sandbox IDE. We pass the dev server's address when it is set: the panel then loads the interface
// from it, and edits are visible without rebuilding the plugin.
tasks.withType<RunIdeTask>().configureEach {
    systemProperty(
        "acc.webview.devUrl",
        providers.gradleProperty("webviewDevUrl").getOrElse(""),
    )

    // The panel belongs to a project, so it cannot be seen on the empty welcome screen.
    // -PopenProject=<path> opens a project right as the sandbox IDE starts.
    providers.gradleProperty("openProject").orNull?.let { path -> args(path) }

    // In the sandbox IDE the panel opens itself: hunting for the button every run serves nothing.
    systemProperty("acc.autoOpen", "true")

    // -PjcefDebugPort=9222 opens the panel to an external debugger over the Chrome DevTools protocol: a
    // browser or a script can attach to it and look at the real panel in a real IDE rather than at its
    // copy in a browser. Off by default - keeping a port open outwards for no reason serves nothing.
    providers.gradleProperty("jcefDebugPort").orNull?.let { port ->
        systemProperty("ide.browser.jcef.debug.port", port)
    }
}
