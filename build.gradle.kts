import org.jetbrains.changelog.Changelog
import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
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
        name = "Amazing Claude Code GUI"
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
            <p><b>Answer it from your phone.</b> Remote access is off when the plugin is installed and
            does nothing over the network until you turn it on. Once you do, you pair a phone by
            scanning a QR code shown in the panel - confirmed at your desk, with a fingerprint to
            compare - and from then on you can read a conversation, answer a permission request or a
            plan, and send a message from anywhere. What travels goes through a relay server,
            encrypted end to end: the relay passes sealed envelopes between the two and cannot read
            what is inside them. A paired phone cannot run shell commands on your machine, change
            permission modes or install anything; any device can be revoked instantly, even while it
            is switched off, and you can point the plugin at a relay of your own. What travels and
            what the relay can see is described in the
            <a href="https://relay.mzpizote.com/privacy">privacy policy</a>.</p>
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
            // -PverifyIde=/path/to/IDE.app checks the archive against one IDE already lying on this
            // machine and against nothing else. That is for working on compatibility itself: an installed
            // copy answers in seconds, where the set below is gigabytes of downloads.
            val installed = providers.gradleProperty("verifyIde").orNull

            if (installed != null) {
                local(file(installed))
            } else {
                recommended()
                // Android Studio is named on its own because the recommended set never contains it:
                // Google builds it from its own branch and publishes it somewhere the verifier does not
                // look. It is also the reason the lower bound is 261 at all, so leaving it unchecked would
                // mean finding out from a review that a release stopped fitting the IDE the bound was
                // lowered for. The version is the oldest stable Quail: what breaks, breaks against the
                // earliest build we promise to work in.
                create(IntelliJPlatformType.AndroidStudio, "2026.1.1.8")
            }
        }

        // What counts as a failed check. The list is explicit because it differs from the default in
        // both directions.
        //
        // Softer, and newly so: experimental usages do not fail the task either. There is exactly one -
        // taking the write-intent lock before the editors are written out (UnsavedEdits) - and it is
        // experimental only in 2026.1, where the whole write-intent mechanism is marked that way and
        // offers nothing settled to use instead. Dropping the call is not an option: without that lock
        // saving the documents throws, and the point of that code is that the agent reads what is on the
        // screen rather than what was last written to disk.
        //
        // Softer: deprecated usages do not fail the task. Each of them is deliberate and none has a
        // supported replacement: opening a terminal for the sign-in (ClaudeLogin), rereading files after
        // the agent's edits (DiskRefresh), catching the dictation hotkey while the keyboard is the IDE's
        // (VoiceHotkeys), and the list of recent projects (RemoteAgent) - the one that is not deprecated
        // lives in a class closed to plugins, which would fail this very task.
        //
        // Softer: a missing dependency does not fail the task. Exactly one comes up missing and it is
        // not missing at all - the embedded browser, which below 2026.2 is a marketplace plugin rather
        // than part of the IDE (see plugin.xml). The verifier looks for it among the target IDE's bundled
        // plugins and gives up; the IDE, asked the same question, is offered it by the marketplace and
        // installs it with us - checked against the resolver Android Studio itself uses. Keeping this
        // level would mean the task failing against every 2026.1 IDE forever, over the very arrangement
        // that lets the plugin run there. What it used to guard is still guarded: a dependency that is
        // genuinely absent takes its classes with it, and unresolved classes are compatibility problems,
        // which do fail below.
        //
        // There is not a single usage of what is closed to plugins left - and none should appear: the
        // marketplace does not let a version through moderation because of those. So they fail the task
        // on a par with an incompatibility.
        failureLevel = listOf(
            VerifyPluginTask.FailureLevel.COMPATIBILITY_PROBLEMS,
            VerifyPluginTask.FailureLevel.INTERNAL_API_USAGES,
            VerifyPluginTask.FailureLevel.SCHEDULED_FOR_REMOVAL_API_USAGES,
            VerifyPluginTask.FailureLevel.OVERRIDE_ONLY_API_USAGES,
            VerifyPluginTask.FailureLevel.NON_EXTENDABLE_API_USAGES,
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
    // From the root, and for this package alone: the repository is a pnpm workspace (see
    // pnpm-workspace.yaml), and a plain `pnpm install` inside webview/ would install the relay's
    // dependencies as well - a server the plugin does not ship and does not need in order to build.
    workingDir = layout.projectDirectory.asFile
    commandLine("pnpm", "install", "--filter", "./webview")

    inputs.files(
        webviewDir.file("package.json"),
        layout.projectDirectory.file("pnpm-lock.yaml"),
    )
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
        // The second page: the same interface opened in an ordinary browser over the shell's local
        // channel. Without it here the task would be considered up to date after a change to it.
        webviewDir.file("remote.html"),
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

// Starting an IDE that is already installed on this machine, with this build of the plugin in it:
// -PideHome="/Applications/Android Studio.app" ./gradlew runInstalledIde -PopenProject=sandbox-project
//
// The ordinary sandbox starts what the build is made against, and that is exactly the IDE where nothing
// can go wrong. The lower bound exists for Android Studio, which is not on the JetBrains repositories at
// all and lags the base platform by a version - the only copy to try the plugin in is the one a person
// installed. Its own settings are not touched: the run gets a sandbox of its own, like any other.
providers.gradleProperty("ideHome").orNull?.let { home ->
    intellijPlatformTesting.runIde.register("runInstalledIde") {
        localPath = file(home)

        // -PidePlugins=/path/one,/path/two puts unpacked plugins into that run beside ours. Needed for
        // the same reason as the task itself: the embedded browser is a plugin in the IDEs below 2026.2,
        // and there it has to be installed rather than assumed. Dropping it into the sandbox by hand does
        // not work - preparing the sandbox wipes what it did not put there.
        providers.gradleProperty("idePlugins").orNull?.let { paths ->
            plugins {
                paths.split(',').filter { it.isNotBlank() }.forEach { localPlugin(file(it.trim())) }
            }
        }
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
    //
    // Made absolute here rather than trusted as given: a relative path is resolved against the IDE
    // process's own working directory, not this one, so the IDE does not find it - and instead of saying
    // so it starts in LightEdit mode, where there are no projects and therefore no panel at all. The
    // failure looks like the plugin not loading, which is a long way from "the path was relative".
    providers.gradleProperty("openProject").orNull?.let { path -> args(file(path).absolutePath) }

    // In the sandbox IDE the panel opens itself: hunting for the button every run serves nothing.
    systemProperty("acc.autoOpen", "true")

    // -PlocalBridge=true opens the project's conversations to a second client on this machine: the same
    // interface in an ordinary browser beside the IDE (see LocalBridgeServer). The address, with its
    // one-run token, goes into the IDE's log. Off by default - this is scaffolding for finding out what
    // two clients do to each other, not a feature.
    providers.gradleProperty("localBridge").orNull?.let { enabled ->
        systemProperty("acc.localBridge", enabled)
    }

    // -PremoteRelay=ws://localhost:8080 points the sandbox at a relay running on this machine and turns
    // remote access on for that run. It is how the whole chain - relay, agent, phone - gets exercised
    // without clicking through the panel first; an ordinary IDE never sees it.
    providers.gradleProperty("remoteRelay").orNull?.let { url ->
        systemProperty("acc.remote.relay", url)
    }

    // -PfeedbackUrl=http://localhost:8081 points the feedback screen at a receiver running on this
    // machine instead of the published one, and -PfeedbackKey overrides the shared secret it sends with
    // it. The whole chain - screen, report, service, Telegram - has to be checkable end to end, and the
    // address people's real reports go to is not the thing to test against.
    providers.gradleProperty("feedbackUrl").orNull?.let { url ->
        systemProperty("acc.feedback.url", url)
    }

    providers.gradleProperty("feedbackKey").orNull?.let { key ->
        systemProperty("acc.feedback.key", key)
    }

    // -PjcefDebugPort=9222 opens the panel to an external debugger over the Chrome DevTools protocol: a
    // browser or a script can attach to it and look at the real panel in a real IDE rather than at its
    // copy in a browser. Off by default - keeping a port open outwards for no reason serves nothing.
    providers.gradleProperty("jcefDebugPort").orNull?.let { port ->
        systemProperty("ide.browser.jcef.debug.port", port)
    }
}
