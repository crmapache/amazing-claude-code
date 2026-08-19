package io.github.crmapache.amazingclaudecode.webview

import com.intellij.ide.dnd.DnDEvent
import com.intellij.ide.dnd.DnDSupport
import com.intellij.ide.dnd.FileCopyPasteUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import javax.swing.JComponent

/**
 * Приём файлов и папок, брошенных мышью в панель, — и из самой IDE, и из
 * системного проводника.
 *
 * Ловим это здесь, а не в самой странице, потому что перетаскивание внутри IDE —
 * из дерева проекта, из вкладок редактора — идёт не системным механизмом, а
 * собственным (DnDManager платформы): он ведёт перетаскиваемое сам, по событиям
 * мыши, и до встроенного браузера оно попросту не доходит — страница не получает
 * ни одного события, сколько бы обработчиков там ни висело.
 *
 * enableAsNativeTarget добавляет к этому и системное перетаскивание — то, чем
 * файл приезжает из проводника.
 *
 * Бросать можно куда угодно в панель, а подсвечивается при этом одно поле ввода:
 * файл станет плашкой именно в нём, и рамка показывает, где он окажется, а не
 * куда целиться мышью (см. onDragging).
 */
internal object WebviewFileDrop {

    fun install(
        component: JComponent,
        parentDisposable: Disposable,
        /** Над панелью держат файл (или увели его прочь) — подсветку рисует сама страница. */
        onDragging: (Boolean) -> Unit,
        onDropped: (List<String>) -> Unit,
    ) {
        DnDSupport.createBuilder(component)
            // Панель — только приёмник: тащить из неё нечего.
            .disableAsSource()
            .enableAsNativeTarget()
            .setTargetChecker { event ->
                val possible = canAttach(event)
                event.setDropPossible(possible)
                // Своей рамки платформа не рисует: подсветить надо одно поле
                // ввода, а его границы известны только странице.
                onDragging(possible)
                true
            }
            .setCleanUpOnLeaveCallback { onDragging(false) }
            // Жест закончился как угодно — броском, отменой, уходом из окна:
            // подсветка не должна остаться висеть ни в одном из случаев.
            .setDropEndedCallback { onDragging(false) }
            .setDropHandler { event ->
                onDragging(false)
                val paths = paths(event)
                thisLogger().info("Dropped into the panel: ${paths.size} file(s)")
                if (paths.isNotEmpty()) onDropped(paths)
            }
            .setDisposableParent(parentDisposable)
            .install()
    }

    /**
     * Можно ли принять то, что тащат, — по одним лишь видам содержимого, не
     * заглядывая в него.
     *
     * Само содержимое до броска и не прочитать: системное перетаскивание отдаёт
     * его только в момент, когда файл отпустили. Раньше проверка спрашивала
     * именно файлы — и для файла из проводника всегда получала пусто: панель
     * считала, что принять нечего, не подсвечивалась и бросок не принимала
     * вовсе. Изнутри IDE при этом всё работало: там перетаскиваемое известно
     * сразу.
     */
    private fun canAttach(event: DnDEvent): Boolean =
        FileCopyPasteUtil.isFileListFlavorAvailable(event) || paths(event).isNotEmpty()

    /**
     * Пути того, что бросили. Перетаскивание внутри IDE несёт свои объекты (узлы
     * дерева, файлы проекта), системное — обычный список файлов; платформа
     * разбирает оба случая, а для панели они и так ничем не отличаются.
     *
     * Именно пути, а не файлы проекта: превращать путь в файл — значит идти в
     * виртуальную файловую систему, а бросок панель обрабатывает в потоке
     * интерфейса, где такое запрещено (в логе — «slow operations are prohibited
     * on EDT»). Путь дальше и так уходит в фоновый поток, где его разбирают
     * спокойно (см. attachDropped).
     *
     * Единственное, что панель принять не может, — бросок из окна коммита.
     * Список изменений отдаёт при перетаскивании не файлы, а собственный объект
     * с правками, и платформа держит его закрытым для плагинов: публичного
     * способа прочитать оттуда пути нет вовсе. Разбирать закрытое панель больше
     * не берётся — из-за этого маркетплейс не пропускал версию на модерации, а
     * стоила такая настойчивость одного способа перетащить файл из двух-трёх
     * возможных.
     */
    private fun paths(event: DnDEvent): List<String> =
        FileCopyPasteUtil.getFileListFromAttachedObject(event.attachedObject).map { file -> file.path }
}
