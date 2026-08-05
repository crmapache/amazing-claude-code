package io.github.crmapache.amazingclaudecode.webview

import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile

/**
 * Выбор вложения через штатный диалог IDE.
 *
 * Свой список файлов панель не строит намеренно: у IDE уже есть дерево проекта с
 * исключениями, иконками и поиском, и пользователь ждёт именно его.
 */
internal object FilePicker {

    /**
     * Один диалог на всё: файл, картинка и папка выбираются одинаково, и делить их
     * по трём кнопкам незачем — разницу видно по самому пути.
     */
    fun pick(project: Project, onPicked: (kind: String, path: String) -> Unit) {
        // Описатель собираем конструктором: у фабрики нужные нам методы объявлены
        // устаревшими, а поведение здесь и так задаётся флагами.
        val descriptor = FileChooserDescriptor(true, true, false, false, false, true)
            .withTitle("Attach files or folders")

        FileChooser.chooseFiles(descriptor, project, null) { files ->
            for (file in files) onPicked(kindOf(file), relativePath(project, file))
        }
    }

    /**
     * То же описание вложения, но для пути, который пришёл со стороны: файл
     * бросили в поле ввода мышью. Панель знает о нём только строку — папка это
     * или файл и как путь выглядит от корня проекта, видно лишь здесь.
     *
     * Несуществующий путь пропускаем молча: перетащить могли что угодно, вплоть
     * до ссылки из браузера.
     */
    fun describe(project: Project, path: String): Pair<String, String>? {
        val file = LocalFileSystem.getInstance().refreshAndFindFileByPath(path) ?: return null
        return kindOf(file) to relativePath(project, file)
    }

    private fun kindOf(file: VirtualFile): String = when {
        file.isDirectory -> "dir"
        file.extension?.lowercase() in IMAGE_EXTENSIONS -> "img"
        else -> "file"
    }

    /**
     * Внутри проекта путь короткий, от его корня — такой же, как у ссылки из
     * редактора, и агент читает его от своей рабочей директории. Файл снаружи
     * остаётся с полным путём: срезать у него ведущий слэш означало бы отдать
     * агенту путь, которого не существует.
     */
    private fun relativePath(project: Project, file: VirtualFile): String {
        val base = project.basePath ?: return file.path
        val prefix = "$base/"

        return if (file.path.startsWith(prefix)) file.path.removePrefix(prefix) else file.path
    }

    private val IMAGE_EXTENSIONS = setOf("png", "jpg", "jpeg", "gif", "webp", "svg")
}
