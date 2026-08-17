package io.github.crmapache.amazingclaudecode.webview

import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.ide.CopyPasteManager
import java.awt.Image
import java.awt.datatransfer.DataFlavor
import java.awt.datatransfer.Transferable
import java.awt.datatransfer.UnsupportedFlavorException
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.util.Base64
import javax.imageio.ImageIO

/**
 * Системный буфер обмена глазами панели.
 *
 * Панель живёт во встроенном браузере, а тот держит свой буфер отдельно от
 * буфера IDE. На Linux эти два буфера не встречаются вовсе: скопированное в
 * редакторе до панели не доходит, скопированное в панели — до редактора, и
 * работает только «вырезал и вставил, не выходя из поля ввода». Через этот
 * объект страница ходит в настоящий буфер — тот же самый, которым пользуется
 * вся остальная IDE.
 *
 * Ходим через CopyPasteManager, а не в java.awt.Toolkit напрямую: платформа
 * держит поверх системного буфера свою синхронизацию (на разных системах она
 * разная) и знает про повторные попытки, когда буфером в этот момент занят
 * кто-то ещё.
 */
internal object WebviewClipboard {

    /**
     * Содержимое буфера в том виде, в котором его понимает страница.
     *
     * Картинка — data-URL: другого способа занести байты в браузер через
     * текстовый канал сообщений нет. Разметка нужна не для красоты: вложения в
     * поле ввода переживают копирование именно в ней (см. feed/tokens).
     */
    data class Content(val text: String, val html: String, val image: String)

    private val EMPTY = Content("", "", "")

    /**
     * Разметку разные источники кладут под разными флаворами: полный документ,
     * фрагмент, выделение. Спрашиваем по очереди — берём первый, который
     * реально отдал строку.
     */
    private val HTML_FLAVORS = listOf(
        DataFlavor.selectionHtmlFlavor,
        DataFlavor.fragmentHtmlFlavor,
        DataFlavor.allHtmlFlavor,
    )

    fun read(): Content {
        val transferable = runCatching { CopyPasteManager.getInstance().contents }
            .onFailure { error -> thisLogger().warn("Clipboard read failed", error) }
            .getOrNull() ?: return EMPTY

        val text = stringOf(transferable, DataFlavor.stringFlavor)
        val html = HTML_FLAVORS
            .firstNotNullOfOrNull { flavor -> stringOf(transferable, flavor).takeIf { it.isNotEmpty() } }
            .orEmpty()

        return Content(text, html, imageOf(transferable))
    }

    fun write(text: String, html: String) {
        runCatching { CopyPasteManager.getInstance().setContents(TextWithHtml(text, html)) }
            .onFailure { error -> thisLogger().warn("Clipboard write failed", error) }
    }

    /**
     * Каждый флавор спрашиваем отдельно и в своей обёртке: чужой Transferable
     * волен отвечать чем угодно, вплоть до исключения на ровном месте, а из-за
     * одного неудачного формата терять весь буфер целиком незачем.
     */
    private fun stringOf(transferable: Transferable, flavor: DataFlavor): String = runCatching {
        if (!transferable.isDataFlavorSupported(flavor)) return@runCatching ""
        transferable.getTransferData(flavor) as? String ?: ""
    }.getOrDefault("")

    private fun imageOf(transferable: Transferable): String = runCatching {
        if (!transferable.isDataFlavorSupported(DataFlavor.imageFlavor)) return@runCatching ""
        val image = transferable.getTransferData(DataFlavor.imageFlavor) as? Image ?: return@runCatching ""

        val bytes = ByteArrayOutputStream()
        ImageIO.write(rasterize(image), "png", bytes)
        "data:image/png;base64,${Base64.getEncoder().encodeToString(bytes.toByteArray())}"
    }.getOrDefault("")

    /**
     * ImageIO пишет только растр, а из буфера приходит любая реализация Image —
     * например, «ещё не догруженная» из другого приложения. Рисуем её в свой
     * растр с прозрачностью: скриншот с прозрачным фоном не должен почернеть.
     */
    private fun rasterize(image: Image): BufferedImage {
        if (image is BufferedImage) return image

        val width = image.getWidth(null).coerceAtLeast(1)
        val height = image.getHeight(null).coerceAtLeast(1)
        val target = BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB)

        val graphics = target.createGraphics()
        try {
            graphics.drawImage(image, 0, 0, null)
        } finally {
            graphics.dispose()
        }
        return target
    }

    /**
     * Что кладём в буфер: читаемый текст и, если он есть, тот же кусок разметкой.
     *
     * Разметку объявляем всеми тремя флаворами сразу, потому что спрашивать её
     * будут по-разному: «весь документ» просят как документ, поэтому фрагмент
     * туда заворачиваем, а фрагмент и выделение — это ровно то, что скопировали.
     * Когда разметки нет, наружу торчит один текст: пустой text/html сбивает с
     * толку тех, кто предпочитает его простому тексту.
     */
    private class TextWithHtml(private val text: String, private val html: String) : Transferable {

        private val flavors: Array<DataFlavor> =
            if (html.isEmpty()) arrayOf(DataFlavor.stringFlavor)
            else (HTML_FLAVORS + DataFlavor.stringFlavor).toTypedArray()

        override fun getTransferDataFlavors(): Array<DataFlavor> = flavors.copyOf()

        override fun isDataFlavorSupported(flavor: DataFlavor): Boolean = flavors.any { it == flavor }

        override fun getTransferData(flavor: DataFlavor): Any = when {
            flavor == DataFlavor.stringFlavor -> text
            flavor == DataFlavor.allHtmlFlavor && html.isNotEmpty() -> "<html><body>$html</body></html>"
            flavor in HTML_FLAVORS && html.isNotEmpty() -> html
            else -> throw UnsupportedFlavorException(flavor)
        }
    }
}
