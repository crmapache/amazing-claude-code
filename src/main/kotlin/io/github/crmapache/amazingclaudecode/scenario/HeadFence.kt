package io.github.crmapache.amazingclaudecode.scenario

import io.github.crmapache.amazingclaudecode.claude.PermissionChannel
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * The fence around what the head may do, as code rather than as a sentence in a prompt.
 *
 * The head is a foreman: it reads the project to check what a card claims, and everything that writes to
 * the disk belongs to a card. Told that in words alone it would hold until four in the morning, when the
 * quickest way to finish a definition of done is to write the file itself - and `echo x > file` is a
 * write, and so are `sed -i`, `git commit` and `rm`.
 *
 * A list of allowed first words rather than a list of forbidden ones. A forbidden list is a guess about
 * every way a shell can write to a disk, and a shell always has one more. Each link of a chain is judged
 * on its own, because `ls && rm -rf .` begins with an allowed word.
 *
 * An allowed first word is not the end of it, and the reason is worth writing down: a program that reads
 * is not the same as a program that only reads. Three kinds of hole had to be closed by hand and are the
 * three lists below. A program whose whole purpose is to write (`tee`) or to run something the fence
 * cannot see (`xargs`) is not on the list at all. A program that writes when a particular flag is given
 * (`sed -i`, `find -delete`, `curl -o`) is judged on its flags wherever in the command they stand, not on
 * its second word. And an interpreter is here to run the project's own checks, so the two ways of handing
 * it a program of one's own - a flag with the code in it, and no program at all, which means the code is
 * coming down the pipe - are refused.
 *
 * None of this makes the fence complete, and it is not pretending to: the list is a list, and a shell
 * always has one more way. It makes the fence mean roughly what is written on it, which a list that lets
 * `node -e` through does not.
 */
internal object HeadFence {

    data class Verdict(val ok: Boolean, val why: String = "")

    private const val BASH = "Bash"

    /**
     * Reading, listing, asking questions of git, and running what a project already has.
     *
     * Deliberately generous about tests and linters: "run the tests and tell me whether that card was
     * honest" is the head's job, and a fence that refused it would push the checking into the cards,
     * where nobody is watching.
     */
    private val ALLOWED = setOf(
        "ls", "cat", "head", "tail", "wc", "stat", "file", "du", "df", "pwd", "which", "whereis", "type",
        "echo", "printf", "date", "basename", "dirname", "realpath", "readlink",
        "grep", "egrep", "fgrep", "rg", "ag", "find", "fd", "sort", "uniq", "cut", "tr", "column", "diff",
        "jq", "yq", "awk", "sed",
        "git", "gh", "hg", "svn",
        "node", "npm", "pnpm", "yarn", "npx", "python", "python3", "pip", "pip3", "uv", "poetry",
        "go", "cargo", "rustc", "java", "javac", "gradle", "./gradlew", "gradlew", "mvn", "make",
        "dotnet", "ruby", "bundle", "rake", "php", "composer", "swift", "kotlinc", "tsc", "eslint",
        "prettier", "pytest", "jest", "vitest", "ctest", "docker", "kubectl", "curl", "true",
    )

    /**
     * The words that make an allowed program a writing one.
     *
     * `git status` is a question; `git commit` is a change to the repository, and both begin with `git`.
     * The same for the package managers, whose install writes a lockfile the cards are working against.
     */
    private val REFUSED_SUBCOMMANDS = mapOf(
        "git" to setOf(
            "commit", "push", "merge", "rebase", "reset", "checkout", "switch", "restore", "clean", "add",
            "rm", "mv", "apply", "am", "cherry-pick", "revert", "stash", "tag", "branch", "pull", "fetch",
            "clone", "init", "gc", "prune", "filter-branch", "worktree", "submodule", "config", "remote",
        ),
        "gh" to setOf("pr", "issue", "release", "repo", "api", "workflow", "gist", "secret", "auth"),
        "npm" to setOf("install", "i", "ci", "publish", "link", "uninstall", "update", "version"),
        "pnpm" to setOf("install", "i", "add", "remove", "publish", "link", "update"),
        "yarn" to setOf("install", "add", "remove", "publish", "link", "upgrade"),
        "docker" to setOf("run", "exec", "build", "rm", "rmi", "push", "compose", "cp", "load", "commit"),
        "kubectl" to setOf("apply", "delete", "create", "patch", "edit", "exec", "scale", "rollout"),
        "pip" to setOf("install", "uninstall", "download", "wheel"),
        "pip3" to setOf("install", "uninstall", "download", "wheel"),
        "uv" to setOf("add", "remove", "sync", "lock", "install", "venv", "pip"),
        "poetry" to setOf("add", "remove", "install", "update", "lock", "publish", "build"),
        "bundle" to setOf("install", "add", "remove", "update"),
        "composer" to setOf("install", "require", "remove", "update", "dump-autoload"),
        "cargo" to setOf("install", "publish", "add", "remove", "new", "init", "fix", "clean"),
        "go" to setOf("install", "get", "mod", "work", "generate", "clean"),
        "dotnet" to setOf("add", "remove", "new", "publish", "pack", "clean", "nuget"),
    )

    /**
     * The options a program takes before its subcommand, and which of them swallow the next word.
     *
     * Without this the subcommand is "the second word", and every one of these turns a refused change into
     * a reading: `git -C /repo commit`, `git -c user.name=x push`, `npm --prefix /tmp install`. The set is
     * per program because the same letter means different things - `docker -c` is a context, `git -c` is a
     * setting - and a value mistaken for a subcommand is the hole read backwards: `git -C commit status`
     * would be refused for standing in a directory called commit.
     */
    private val VALUE_OPTIONS = mapOf(
        "git" to setOf(
            "-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix",
            "--config-env",
        ),
        "gh" to setOf("-R", "--repo"),
        "npm" to setOf(
            "-C", "--prefix", "-w", "--workspace", "--userconfig", "--globalconfig", "--registry",
            "--cache", "--loglevel",
        ),
        "pnpm" to setOf(
            "-C", "--dir", "-F", "--filter", "--store-dir", "--registry", "--loglevel", "--config",
        ),
        "yarn" to setOf("--cwd", "--registry", "--cache-folder", "--modules-folder"),
        "docker" to setOf(
            "-H", "--host", "-c", "--context", "--config", "-l", "--log-level", "--tlscacert",
            "--tlscert", "--tlskey",
        ),
        "kubectl" to setOf(
            "-n", "--namespace", "--context", "--cluster", "--user", "--kubeconfig", "-s", "--server",
            "--token", "--as", "--as-group", "--request-timeout", "--cache-dir", "-v", "--v",
        ),
        "pip" to setOf(
            "--cache-dir", "--log", "--proxy", "--timeout", "--retries", "--exists-action", "--cert",
            "--client-cert", "--python",
        ),
        "pip3" to setOf(
            "--cache-dir", "--log", "--proxy", "--timeout", "--retries", "--exists-action", "--cert",
            "--client-cert", "--python",
        ),
        "uv" to setOf(
            "--directory", "--project", "--config-file", "--cache-dir", "--python", "--color",
            "--index-url", "--offline",
        ),
        "poetry" to setOf("-C", "--directory", "-P", "--project"),
        "bundle" to setOf("--gemfile"),
        "composer" to setOf("-d", "--working-dir"),
        "cargo" to setOf("-Z", "--config", "--color", "--manifest-path"),
        "go" to setOf("-C"),
        "dotnet" to setOf("--verbosity", "-v"),
    )

    /**
     * Flags that make a reading program a writing one, wherever in the command they stand.
     *
     * Not the second word: `sed -n -i` and `find . -name '*.kt' -delete` both put it further along, and a
     * check on the second word alone reads them as harmless. Short flags are matched on the cluster they
     * are in and before any suffix, because `-i.bak` is `-i` with a backup name and `-ni` is `-i` as well.
     */
    private val REFUSED_FLAGS = mapOf(
        // In-place editing: the whole of a rewrite in one letter.
        "sed" to Flags(short = "i", long = setOf("--in-place")),
        "yq" to Flags(short = "i", long = setOf("--inplace", "--in-place")),
        // A search that runs something, or deletes what it found, is not a search any more.
        "find" to Flags(long = setOf("-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprintf", "-fls")),
        "fd" to Flags(short = "xX", long = setOf("--exec", "--exec-batch")),
        // Fetching prints to the screen; the flags that make it land on the disk do not.
        "curl" to Flags(
            short = "oOTD",
            long = setOf(
                "--output", "--output-dir", "--remote-name", "--remote-name-all", "--create-dirs",
                "--upload-file", "--dump-header", "--trace", "--trace-ascii", "--config",
            ),
        ),
        // An interpreter given the program on the command line is a shell with extra steps.
        "node" to Flags(short = "ep", long = setOf("--eval", "--print", "--input-type")),
        "python" to Flags(short = "c", long = setOf()),
        "python3" to Flags(short = "c", long = setOf()),
        "ruby" to Flags(short = "e", long = setOf()),
        "php" to Flags(short = "r", long = setOf()),
    )

    /** How a program's refused flags are written: a cluster of short letters, and whole long names. */
    private data class Flags(val short: String = "", val long: Set<String> = emptySet())

    /**
     * Programs that read their program from standard input when they are not given one to run.
     *
     * `echo 'code' | node` writes whatever it likes, and every word of it is on the allowed list. So an
     * interpreter has to be pointed at something - a file of the project's, a module, a task - and one
     * with nothing but flags after it is refused.
     */
    private val INTERPRETERS = setOf("node", "python", "python3", "ruby", "php")

    /** Flags that are a question about the program itself, so an interpreter carrying one reads no pipe. */
    private val ASKING = setOf("--version", "-v", "-V", "--help", "-h")

    /**
     * `awk` is here to read text, and its one door out of that is [system].
     *
     * Its other way of writing, `print > "file"`, is caught by [WRITING] like any other redirection.
     * Judged on the program text rather than on a flag, because that is where it is written.
     */
    private const val AWK_ESCAPE = "system("

    /** The shell's own ways of writing that no first word can excuse. */
    private val WRITING = listOf(">", ">>", "$(", "`", "<<")

    /**
     * Everything the shell joins two commands with, longest first.
     *
     * The order is the rule, not tidiness: `&&` and `||` have to be offered before the single characters
     * inside them, or one chain link would be read as two empty ones with the halves of an operator for
     * words. And the lone `&` belongs here as much as the rest - it is a whole command put in the
     * background with another one after it, so leaving it out meant only the first word was ever judged
     * and the tail went to the shell unread, which is the one thing this fence exists to prevent.
     */
    private val SPLIT = Regex("&&|\\|\\||;|&|\\||\\n")

    /**
     * What the head may do with the tool it is asking about.
     *
     * Anything that is not a shell is refused outright: reading the project is allowed by the CLI itself
     * and never reaches here, so what does reach here is a tool that changes something or hands the work
     * to somebody the timeline cannot show.
     */
    fun judge(request: PermissionChannel.ToolPermission): Verdict {
        if (request.toolName != BASH) {
            return Verdict(
                ok = false,
                why = "${request.toolName} is not yours to use: you are the main thread of this run, and doing the " +
                    "work is a card's job. Ask a card for it, or say so in your verdict.",
            )
        }

        val command = request.input["command"]?.jsonPrimitive?.contentOrNull.orEmpty()
        return judgeCommand(command)
    }

    fun judgeCommand(command: String): Verdict {
        if (command.isBlank()) return Verdict(false, "Refused: there is no command here to judge.")

        for (mark in WRITING) {
            if (command.contains(mark)) {
                return Verdict(
                    false,
                    "Refused: `$mark` in a command is a way to write or to run something unseen, and the main thread " +
                        "of a run does not write. Ask a card to do it.",
                )
            }
        }

        for (piece in command.split(SPLIT)) {
            val words = piece.trim().split(Regex("\\s+")).filter(String::isNotEmpty)
            if (words.isEmpty()) continue

            val program = words.first().substringAfterLast('/').let { if (it.isEmpty()) words.first() else it }
            val head = if (program == "gradlew") "./gradlew" else program

            if (head !in ALLOWED && program !in ALLOWED) {
                return Verdict(
                    false,
                    "Refused: `$program` is not on the list of things the main thread of a run may run. You may read " +
                        "the project, ask git questions and run its tests and linters; anything that changes " +
                        "the project is a card's job.",
                )
            }

            val arguments = words.drop(1)

            // An interpreter told to run a module is that module: `python3 -m pip install x` installs.
            val module = arguments.moduleAfterDashM().takeIf { program in INTERPRETERS }
            val judged = module ?: program

            val refused = REFUSED_SUBCOMMANDS[judged].orEmpty()
            if (refused.isNotEmpty()) {
                val subcommand = subcommandOf(judged, if (module == null) arguments else arguments.afterModule())
                if (subcommand in refused) {
                    return Verdict(
                        false,
                        "Refused: `$judged $subcommand` changes something, and the main thread of a run does not. " +
                            "Ask a card to do it, or say so in your verdict.",
                    )
                }
            }

            REFUSED_FLAGS[program]?.let { flags ->
                val flag = arguments.firstOrNull { writes(it, flags) }
                if (flag != null) {
                    return Verdict(
                        false,
                        "Refused: `$program $flag` writes, runs or downloads something, and the main thread of a run " +
                            "does none of those. Ask a card to do it, or say so in your verdict.",
                    )
                }
            }

            val pointedAtSomething = arguments.any { (it != "-" && !it.startsWith("-")) || it in ASKING }
            if (program in INTERPRETERS && !pointedAtSomething) {
                return Verdict(
                    false,
                    "Refused: `$program` with nothing to run reads its program from the pipe, which is a way of " +
                        "running code nobody judged. Point it at one of the project's own files or tasks.",
                )
            }

            if (program == "awk" && arguments.any { it.contains(AWK_ESCAPE) }) {
                return Verdict(
                    false,
                    "Refused: `system(` in an awk program runs a command nobody judged. Read the text with it, and " +
                        "ask a card for anything that has to change.",
                )
            }
        }

        return Verdict(true)
    }

    /**
     * The first word after a program's options: its subcommand, or null when it has none.
     *
     * Options are skipped rather than counted, and the ones that swallow the next word take it with them,
     * so that `git -C /repo commit` reads as `git commit` and `git -C commit status` reads as `git status`.
     * An option nobody listed is taken for a plain switch: the word after `git --no-pager commit` is still
     * the subcommand. That is where this stops being airtight, and the fence never claimed to be.
     */
    private fun subcommandOf(program: String, arguments: List<String>): String? {
        val carriers = VALUE_OPTIONS[program].orEmpty()
        var index = 0
        while (index < arguments.size) {
            val word = arguments[index]
            if (!word.startsWith("-")) return word.lowercase()
            // `--git-dir=/repo` carries its value inside itself; `-C /repo` takes the word after it.
            index += if (!word.contains('=') && word in carriers) 2 else 1
        }
        return null
    }

    /** The module an interpreter was pointed at, as in `python3 -m pip`. */
    private fun List<String>.moduleAfterDashM(): String? {
        val at = indexOf("-m")
        val name = if (at >= 0) getOrNull(at + 1) else null
        return name?.takeIf { !it.startsWith("-") }?.substringBefore('.')?.lowercase()?.ifEmpty { null }
    }

    /** What a module was asked to do, which is everything after its own name. */
    private fun List<String>.afterModule(): List<String> = drop(indexOf("-m") + 2)

    /**
     * Whether one word of a command is one of a program's writing flags.
     *
     * A short flag counts wherever it stands in its cluster and whatever is stuck to it: `-i`, `-ni` and
     * `-i.bak` are the same instruction. A long one counts by name, so `--output` is refused and
     * `--output-really-nothing` is a flag nobody has heard of rather than a match.
     */
    private fun writes(word: String, flags: Flags): Boolean {
        if (!word.startsWith("-") || word == "-") return false
        if (word.startsWith("--")) return word.substringBefore('=') in flags.long
        // A single dash: `find`'s own words (`-delete`) are written out in full, short letters are clustered.
        if (word in flags.long) return true
        val cluster = word.drop(1).substringBefore('.').substringBefore('=')
        return cluster.any { it in flags.short }
    }
}
