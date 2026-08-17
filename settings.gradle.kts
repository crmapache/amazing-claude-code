import org.jetbrains.intellij.platform.gradle.extensions.intellijPlatform

rootProject.name = "amazing-claude-code"

pluginManagement {
    plugins {
        // WebStorm 2026.2 несёт Kotlin с метаданными 2.4, поэтому компилятор не может
        // быть старше платформы: иначе он не прочитает её же stdlib.
        id("org.jetbrains.kotlin.jvm") version "2.4.10"
        id("org.jetbrains.kotlin.plugin.serialization") version "2.4.10"
        // Собирает changeNotes из CHANGELOG.md — только секцию собираемой версии.
        id("org.jetbrains.changelog") version "2.4.0"
    }
}

plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
    id("org.jetbrains.intellij.platform.settings") version "2.16.0"
}

@Suppress("UnstableApiUsage")
dependencyResolutionManagement {
    repositories {
        mavenCentral()

        intellijPlatform {
            defaultRepositories()
        }
    }
}
