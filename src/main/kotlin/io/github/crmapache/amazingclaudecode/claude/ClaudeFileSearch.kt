package io.github.crmapache.amazingclaudecode.claude

import java.io.File

/**
 * The project's file list for the "@" hint in the input field - the same thing the native terminal
 * sees while a @path is typed. A list of our own rather than parsing `.gitignore` through the IDE's
 * index: the same plain direct disk walk [ClaudeHistory] and [ClaudeTokenUsage] already use - it saves
 * a dependency on PSI and indexing for the sake of one flat list of paths.
 */
internal object ClaudeFileSearch {

    private val EXCLUDED_DIRS = setOf(
        ".git", ".idea", ".gradle", "node_modules", "dist", "build", "out",
        "target", ".next", ".turbo", "coverage", ".venv", "venv", "__pycache__",
    )

    // A generous but finite allowance: the hint filters on the interface side, it has no need to see
    // literally every file of a huge repository.
    private const val LIMIT = 4000
    private const val MAX_DEPTH = 14

    fun list(workingDirectory: String?): List<String> {
        val root = workingDirectory?.let { File(it) }?.takeIf { it.isDirectory } ?: return emptyList()

        // .take() on a lazy Sequence stops the walk itself - we do not spend time on the rest of a huge
        // repository once the limit is reached.
        return root.walkTopDown()
            .maxDepth(MAX_DEPTH)
            .onEnter { it == root || (it.name !in EXCLUDED_DIRS && !it.name.startsWith(".")) }
            .filter { it != root }
            .take(LIMIT)
            .map { file ->
                val relative = file.relativeTo(root).invariantSeparatorsPath
                if (file.isDirectory) "$relative/" else relative
            }
            .toList()
    }
}
