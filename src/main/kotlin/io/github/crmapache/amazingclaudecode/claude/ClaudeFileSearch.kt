package io.github.crmapache.amazingclaudecode.claude

import java.io.File

/**
 * Список файлов проекта для подсказки "@" в поле ввода — та же цифра, что видит
 * нативный терминал, набирая @путь. Свой список, а не разбор `.gitignore` через
 * индекс IDE: тот же простой прямой обход диска, что уже используют
 * [ClaudeHistory] и [ClaudeTokenUsage] в этом файле — экономит зависимость от
 * PSI/индексации ради одного плоского списка путей.
 */
internal object ClaudeFileSearch {

    private val EXCLUDED_DIRS = setOf(
        ".git", ".idea", ".gradle", "node_modules", "dist", "build", "out",
        "target", ".next", ".turbo", "coverage", ".venv", "venv", "__pycache__",
    )

    // Щедрый, но конечный запас: подсказка фильтрует на стороне интерфейса, ей
    // незачем видеть буквально каждый файл огромного репозитория.
    private const val LIMIT = 4000
    private const val MAX_DEPTH = 14

    fun list(workingDirectory: String?): List<String> {
        val root = workingDirectory?.let { File(it) }?.takeIf { it.isDirectory } ?: return emptyList()

        // .take() на ленивой Sequence останавливает сам обход — не тратим время
        // на остаток огромного репозитория после набранного лимита.
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
