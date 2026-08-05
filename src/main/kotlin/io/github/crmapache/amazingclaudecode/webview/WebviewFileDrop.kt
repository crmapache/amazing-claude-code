package io.github.crmapache.amazingclaudecode.webview

import com.intellij.ide.dnd.DnDEvent
import com.intellij.ide.dnd.DnDSupport
import com.intellij.ide.dnd.FileCopyPasteUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import javax.swing.JComponent

/**
 * Приём файлов и папок, брошенных мышью в панель.
 *
 * Ловим это здесь, а не в самой странице, потому что перетаскивание внутри IDE —
 * из дерева проекта, из вкладок редактора — идёт не системным механизмом, а
 * собственным (DnDManager платформы): он ведёт перетаскиваемое сам, по событиям
 * мыши, и до встроенного браузера оно попросту не доходит — страница не получает
 * ни одного события, сколько бы обработчиков там ни висело.
 *
 * enableAsNativeTarget добавляет к этому и системное перетаскивание — то, чем
 * файл приезжает из проводника.
 */
internal object WebviewFileDrop {

    fun install(component: JComponent, parentDisposable: Disposable, onDropped: (List<VirtualFile>) -> Unit) {
        DnDSupport.createBuilder(component)
            // Панель — только приёмник: тащить из неё нечего.
            .disableAsSource()
            .enableAsNativeTarget()
            .setTargetChecker { event ->
                val possible = files(event).isNotEmpty()
                thisLogger().debug("Drag over the panel: ${if (possible) "files" else "nothing we can attach"}")
                event.setDropPossible(possible)
                // Рамкой по всей панели: бросать можно куда угодно в неё, и
                // подсвечивать один лишь composer значило бы соврать про это.
                if (possible) event.setHighlighting(component, DnDEvent.DropTargetHighlightingType.RECTANGLE)
                true
            }
            .setDropHandler { event ->
                val files = files(event)
                thisLogger().info("Dropped into the panel: ${files.size} file(s)")
                if (files.isNotEmpty()) onDropped(files)
            }
            .setDisposableParent(parentDisposable)
            .install()
    }

    /**
     * Что именно бросили. Перетаскивание внутри IDE несёт свои объекты (узлы
     * дерева, файлы проекта), системное — обычный список файлов; спрашиваем оба,
     * потому что снаружи эти два случая для панели ничем не отличаются.
     */
    private fun files(event: DnDEvent): List<VirtualFile> {
        val attached = FileCopyPasteUtil.getVirtualFileListFromAttachedObject(event.attachedObject)
        if (attached.isNotEmpty()) return attached

        val system = FileCopyPasteUtil.getFileList(event) ?: return emptyList()
        return system.mapNotNull { file -> LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file) }
    }
}
