import org.jetbrains.intellij.platform.gradle.extensions.intellijPlatform

rootProject.name = "amazing-claude-code"

pluginManagement {
    plugins {
        // WebStorm 2026.2 ships Kotlin with 2.4 metadata, so the compiler cannot be older than the
        // platform: otherwise it will not read the platform's own stdlib.
        id("org.jetbrains.kotlin.jvm") version "2.4.10"
        id("org.jetbrains.kotlin.plugin.serialization") version "2.4.10"
        // Builds changeNotes out of CHANGELOG.md - the section of the version being built only.
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
