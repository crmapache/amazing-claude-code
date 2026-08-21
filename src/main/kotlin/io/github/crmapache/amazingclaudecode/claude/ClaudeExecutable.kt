package io.github.crmapache.amazingclaudecode.claude

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.util.EnvironmentUtil
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * Finding the Claude Code executable.
 *
 * Simply taking PATH out of the process environment will not do on macOS: an application launched from
 * the Dock or from Toolbox gets a trimmed PATH without the user's own folders. So the environment is
 * taken the way a login shell sees it - which is what the IDE's own terminal does.
 *
 * And even that is not always enough: the CLI gets installed in different ways (the native installer,
 * npm, bun, volta, scoop), the file name on Windows differs too, and the IDE shell's PATH may not
 * match the terminal's. Hence the order: a path pointed at by hand, PATH, the usual install locations
 * - and if all of that comes up empty, ask the system itself (`where` / `command -v` in the user's
 * shell), which knows about installs we never guessed at.
 *
 * The path walking itself lives in [ClaudeLookup] - there a test can see it, without someone else's
 * machine at hand.
 */
internal object ClaudeExecutable {

    fun find(): File? = fromCandidates() ?: fromSystem()

    /** Where we looked - for the "Claude Code not found" screen: the list shows why we missed. */
    fun searchedPlaces(): List<String> = candidates()

    /**
     * What the system itself answered to "where is claude" - the other half of the same screen.
     *
     * The line goes to a person in the panel, where everything else is in English: an answer in another
     * language in the middle of an English screen would read as debug rubbish rather than an
     * explanation.
     */
    fun systemAnswer(): String = askSystem() ?: "${lookupCommand().joinToString(" ")}: not found"

    fun environment(): Map<String, String> = EnvironmentUtil.getEnvironmentMap()

    /**
     * Whether the CLI we found knows such a launch flag.
     *
     * We ask the file itself rather than compare version numbers: people have different builds
     * installed, and an unknown flag the CLI does not ignore - it fails while parsing its arguments,
     * and instead of a panel the person would get a dead tab.
     *
     * The answer is kept in memory: `--help` costs tenths of a second, but asking it on every
     * conversation launch is pointless. The cache key includes the file's modification time as well -
     * updating the CLI in place must not leave us with a stale answer.
     */
    fun supportsFlag(executable: File, flag: String): Boolean =
        supportedFlags.getOrPut("${executable.absolutePath}|${executable.lastModified()}|$flag") {
            capture(listOf(executable.absolutePath, "--help"), HELP_TIMEOUT_MS)?.contains(flag) ?: false
        }

    private val supportedFlags = ConcurrentHashMap<String, Boolean>()

    private const val HELP_TIMEOUT_MS = 10_000
    private const val LOOKUP_TIMEOUT_MS = 5_000

    /**
     * A one-off launch with a timeout that actually holds.
     *
     * Reading the output on our own thread is not an option: reading to the end waits for the child
     * process to close the stream, and a limit set after the read never arrives. A login profile that
     * waits for input or a slow network drive is enough - and the thread that asked "where is claude"
     * never comes back, while the panel stays in loading forever. So the output is collected by the
     * platform's handler: it reads the streams apart from us and kills the process itself once the time
     * is up.
     */
    private fun capture(command: List<String>, timeoutMs: Int): String? = runCatching {
        val commandLine = GeneralCommandLine(command)
            .withCharset(Charsets.UTF_8)
            .withRedirectErrorStream(true)

        val output = CapturingProcessHandler(commandLine).runProcess(timeoutMs)

        if (output.isTimeout) {
            thisLogger().warn("${command.joinToString(" ")} timed out after ${timeoutMs}ms")
            null
        } else {
            output.stdout
        }
    }.getOrElse {
        thisLogger().info("${command.joinToString(" ")} failed: ${it.message}")
        null
    }

    private fun candidates(): List<String> = ClaudeLookup.candidates(
        windows = HostOs.isWindows,
        home = System.getProperty("user.home").orEmpty(),
        env = environment(),
        configured = ClaudePreferences.executablePath,
        separator = File.pathSeparatorChar,
    )

    private fun fromCandidates(): File? = candidates()
        .asSequence()
        .map(::File)
        .firstOrNull { it.isFile && it.canExecute() }

    /**
     * The last word belongs to the system: it is asked the same thing a person would have typed into a
     * terminal. That is how installs in places absent from our list get found: nvm, scoop, winget,
     * someone's corporate image.
     *
     * On Unix through a login shell: an IDE launched from the Dock sees a PATH without the user's own
     * folders, while a shell reads the profile and sees the real one.
     */
    private fun fromSystem(): File? {
        val path = askSystem() ?: return null
        val file = File(path)
        return if (file.isFile && file.canExecute()) file else null
    }

    private fun lookupCommand(): List<String> =
        if (HostOs.isWindows) listOf("cmd.exe", "/c", "where claude") else listOf("/bin/sh", "-lc", "command -v claude")

    /** The answer is cached: this starts a process, and every sign-in screen asks about it. */
    @Volatile
    private var systemPath: String? = null

    private fun askSystem(): String? {
        systemPath?.let { return it }

        // `where` prints every match - we take the first one that works.
        val answer = capture(lookupCommand(), LOOKUP_TIMEOUT_MS)
            ?.lineSequence()
            ?.map { it.trim() }
            ?.firstOrNull { it.isNotEmpty() && File(it).isFile }

        systemPath = answer
        return answer
    }
}
