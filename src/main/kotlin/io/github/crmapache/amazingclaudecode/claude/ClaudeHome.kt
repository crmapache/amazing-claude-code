package io.github.crmapache.amazingclaudecode.claude

import com.intellij.execution.wsl.WslPath
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.thisLogger
import io.github.crmapache.amazingclaudecode.feedback.DiagnosticsLog
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * Where Claude Code lives for a project: the directory it keeps its settings and conversations in, the
 * directory an organization's policy sits in, and the project's path as the CLI itself names it.
 *
 * All of that used to be taken from the machine the IDE runs on - `user.home`, the IDE's own
 * environment, the project's path as the IDE spells it - and that holds exactly as long as the CLI runs
 * on that same machine and sees the same paths. It stops holding the moment a project is opened out of
 * WSL: the IDE stays on Windows and spells the project `\\wsl.localhost\Ubuntu\home\ivan\repo`, while the
 * CLI is started inside the distribution, sees `/home/ivan/repo`, and files the conversation under
 * `/home/ivan/.claude/projects/-home-ivan-repo`. The panel meanwhile looked into
 * `C:\Users\Ivan\.claude\projects\--wsl-localhost-Ubuntu-home-ivan-repo` - the wrong machine and the
 * wrong name at once - found nothing, and showed an empty history without a word: a folder that is not
 * there is the ordinary state of a machine with no conversations yet, so nothing was logged. The same
 * assumption sat behind the user's settings layer, the personal commands in the slash hint, today's
 * token count and the search index, and every one of them was quietly empty or wrong there too.
 *
 * So the question "where does the CLI keep its things" is asked of the project rather than of the JVM,
 * and answered once here for every reader of that disk. For a project on this machine nothing changes:
 * [local] is the answer the readers computed for themselves before. For a project inside WSL the answer
 * is the distribution's user home, its own `CLAUDE_CONFIG_DIR`, its `/etc/claude-code`, and the Linux
 * path of the project - all reachable from Windows through the same share the project is opened from,
 * so the readers themselves (listing files, reading lines, asking for dates) do not change at all.
 *
 * The WSL half is asked only on Windows and only for a path that looks like a share (`//` or `\\`):
 * everything else takes the local road without touching a single WSL class. Learning the distribution's
 * user home costs a `wsl.exe` process the first time (the platform keeps the answer afterwards), so it
 * is [warmUp]-ed when the project opens, off every thread anybody waits on, and never asked from the
 * event dispatch thread - the platform answers nothing there rather than block it (see
 * WslDistributionSafeNullableLazyValue), and nothing is the one answer this resolver cannot build on:
 * then it falls back to the local reading, says so in the diagnostics, and tries again later.
 */
internal class ClaudeHome internal constructor(
    /**
     * The CLI's own directory - settings, conversations, personal commands and skills - as a path this
     * JVM can read. `~/.claude` on the CLI's machine unless `CLAUDE_CONFIG_DIR` moved it, exactly as the
     * CLI itself resolves it.
     */
    val configDirectory: File,
    /**
     * Where an organization's policy settings live on the CLI's machine, as a path this JVM can read.
     * Fixed per system and not movable - that is the point of them (see HostOs.managedSettingsDirectory).
     */
    val managedSettingsDirectory: File,
    /**
     * The project's directory as the CLI names it - the path its conversations are filed under (see
     * ClaudeHistory.slugFor) - and, when it differs, the real path behind it: `/tmp` on macOS is really
     * `/private/tmp`, and a project may well sit behind a symbolic link. The CLI files conversations
     * under the real path while the IDE hands over its own, so both are looked into. Empty when no
     * project directory is known.
     */
    val projectPaths: List<String>,
    /**
     * Whether the CLI's machine is another one than the IDE's. A fact for the diagnostics and for
     * whoever reads them; nothing here branches on it.
     */
    val remote: Boolean,
    /** A path in the CLI's own terms turned into one this JVM can open - the identity on this machine. */
    private val toHost: (String) -> String,
) {

    /**
     * The CLI's `projects` folder: a subfolder per project, named after the project's path (see
     * ClaudeHistory.slugFor), a file per conversation inside.
     */
    val projectsDirectory: File get() = File(configDirectory, "projects")

    /**
     * A path the CLI printed - a plugin's install path, say - turned into one this JVM can open. On this
     * machine it is the same path; from Windows into WSL it is the path on the share.
     */
    fun hostPath(cliPath: String): File = File(toHost(cliPath))

    companion object {

        /**
         * Where Claude Code lives for the project in [workingDirectory] - the IDE's spelling of it, as
         * `Project.basePath` hands it over. Do not call from the event dispatch thread on a WSL project:
         * the first answer there may take a process (see the class comment).
         */
        fun of(workingDirectory: String?): ClaudeHome {
            val wsl = workingDirectory?.let(::wslPathOf) ?: return local(workingDirectory)
            val facts = wslFacts(wsl) ?: return local(workingDirectory)

            return inWsl(
                root = wsl.wslRoot,
                linuxPath = wsl.linuxPath,
                realLinuxPath = realLinuxPath(workingDirectory, wsl),
                home = facts.home,
                configDirectory = facts.configDirectory,
            )
        }

        /**
         * Pay for the first answer now, in the background, rather than at the first question. A project
         * on this machine has nothing to pay for and returns at once.
         */
        fun warmUp(workingDirectory: String?) {
            if (workingDirectory?.let(::wslPathOf) == null) return

            ApplicationManager.getApplication().executeOnPooledThread {
                runCatching { of(workingDirectory) }
                    .onFailure { thisLogger().warn("Could not resolve where Claude Code lives for a WSL project", it) }
            }
        }

        /**
         * The CLI on this very machine - the answer every reader of the CLI's disk used to compute for
         * itself, kept exactly as it was: the JVM's home or `CLAUDE_CONFIG_DIR` from the IDE's own
         * environment, and the project path beside its canonical form.
         */
        internal fun local(workingDirectory: String?): ClaudeHome {
            val paths = workingDirectory?.let { path ->
                val real = runCatching { File(path).canonicalPath }.getOrDefault(path)
                listOf(path, real).distinct()
            } ?: emptyList()

            return ClaudeHome(
                configDirectory = HostOs.configDirectory(),
                managedSettingsDirectory = HostOs.managedSettingsDirectory(),
                projectPaths = paths,
                remote = false,
                toHost = { it },
            )
        }

        /**
         * The CLI inside a WSL distribution, as seen from Windows - apart from `wsl.exe` and the disk, so
         * that a test can check the arithmetic on a machine without WSL.
         *
         * [root] is the share the project is opened from (`\\wsl.localhost\Ubuntu` or `\\wsl$\Ubuntu` -
         * whichever spelling the IDE used, so that the CLI's files are addressed the same way the project
         * is), [linuxPath] the project as the CLI sees it, [home] the distribution user's home, and
         * [configDirectory] that user's `CLAUDE_CONFIG_DIR` if they set one - a `~` in it means their
         * home, and a relative one is taken from their home as well.
         */
        internal fun inWsl(
            root: String,
            linuxPath: String,
            realLinuxPath: String?,
            home: String,
            configDirectory: String?,
        ): ClaudeHome {
            val config = configDirectory?.trim()?.takeIf { it.isNotEmpty() }?.let { linuxAbsolute(it, home) }
                ?: "$home/.claude"

            return ClaudeHome(
                configDirectory = File(windowsPathOf(root, config)),
                managedSettingsDirectory = File(windowsPathOf(root, MANAGED_SETTINGS_LINUX)),
                projectPaths = listOfNotNull(linuxPath, realLinuxPath).distinct(),
                remote = true,
                toHost = { windowsPathOf(root, it) },
            )
        }

        /** A Linux path on the distribution's share: `/home/ivan/.claude` → `\\wsl.localhost\Ubuntu\home\ivan\.claude`. */
        internal fun windowsPathOf(root: String, linuxPath: String): String =
            root.trimEnd('\\') + "\\" + linuxPath.trimStart('/').replace('/', '\\')

        private fun linuxAbsolute(path: String, home: String): String = when {
            path == "~" -> home
            path.startsWith("~/") -> home + path.drop(1)
            path.startsWith("/") -> path
            else -> "$home/$path"
        }

        /** The policy directory on Linux - the same one HostOs names for a Linux IDE. */
        private const val MANAGED_SETTINGS_LINUX = "/etc/claude-code"

        /**
         * The project's path taken apart as a WSL share - or null, which is every project on this
         * machine. The WSL classes are not touched until the path has said it is a share: on macOS and
         * Linux, and for a Windows project on a drive letter, this returns before them.
         */
        private fun wslPathOf(path: String): WslPath? {
            if (!HostOs.isWindows) return null
            if (!path.startsWith("//") && !path.startsWith("\\\\")) return null

            return runCatching { WslPath.parseWindowsUncPath(path) }
                .onFailure { thisLogger().warn("Could not read a project path as a WSL share", it) }
                .getOrNull()
        }

        /**
         * The real path behind a project on a share, in the CLI's terms - the same second look
         * [local] takes for a project on this machine. Only when it stays inside the same distribution:
         * anything else is not a path the CLI could have filed a conversation under.
         */
        private fun realLinuxPath(path: String, wsl: WslPath): String? {
            val canonical = runCatching { File(path).canonicalPath }.getOrNull() ?: return null
            val parsed = runCatching { WslPath.parseWindowsUncPath(canonical) }.getOrNull() ?: return null

            return parsed.linuxPath.takeIf { parsed.distributionId.equals(wsl.distributionId, ignoreCase = true) }
        }

        /** What a distribution had to be asked about: the user's home and their `CLAUDE_CONFIG_DIR`, if any. */
        private class WslFacts(val home: String, val configDirectory: String?)

        /**
         * Kept by distribution: a project's questions come several times a minute (the history, the
         * settings, the hint, the tokens), and the answer does not change while the IDE runs.
         */
        private val facts = ConcurrentHashMap<String, WslFacts>()

        /**
         * When a distribution that gave no answer may be asked again. Asking costs a process, and a
         * distribution that is not answering is not worth one per history request; a minute later it is
         * worth one more.
         */
        private val retryAt = ConcurrentHashMap<String, Long>()

        private const val RETRY_MS = 60_000L

        private fun wslFacts(wsl: WslPath): WslFacts? {
            val id = wsl.distributionId.lowercase()
            facts[id]?.let { return it }
            if ((retryAt[id] ?: 0L) > System.currentTimeMillis()) return null

            val distribution = runCatching { wsl.distribution }.getOrNull()
            // The home comes back null when the platform would rather not block the thread it was asked
            // on, and when the distribution itself gave nothing. Neither is a home to build on.
            val home = runCatching { distribution?.userHome }
                .onFailure { thisLogger().warn("Could not ask WSL for the user's home", it) }
                .getOrNull()
                ?.trim()
                ?.takeIf { it.startsWith("/") }

            if (home == null) {
                retryAt[id] = System.currentTimeMillis() + RETRY_MS
                // No path and no name in the diagnostics: the buffer leaves the machine with a report.
                DiagnosticsLog.note(DiagnosticsLog.AGENT, "wsl: the user's home could not be read, looking at the IDE's own home instead")
                return null
            }

            // A login shell's variable, the way the CLI itself would see it - out of the whole environment
            // (the platform's one-variable question is closed to plugins, and the marketplace does not let
            // a version through moderation over that). A failure to ask is read as "not set": a config
            // directory moved inside WSL and a transient failure on the first ask is an edge of an edge,
            // and the alternative is a process on every question until it answers.
            val configDirectory = runCatching { distribution?.environment?.get(CONFIG_DIR_VARIABLE) }
                .onFailure { thisLogger().warn("Could not ask WSL for its environment", it) }
                .getOrNull()
                ?.trim()
                ?.takeIf { it.isNotEmpty() }

            return WslFacts(home, configDirectory).also {
                facts[id] = it
                retryAt.remove(id)
                DiagnosticsLog.note(
                    DiagnosticsLog.AGENT,
                    "wsl: claude lives inside the distribution, $CONFIG_DIR_VARIABLE ${if (configDirectory == null) "unset" else "set"}",
                )
            }
        }

        private const val CONFIG_DIR_VARIABLE = "CLAUDE_CONFIG_DIR"
    }
}
