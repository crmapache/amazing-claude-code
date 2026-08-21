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
 * The system clipboard through the panel's eyes.
 *
 * The panel lives in an embedded browser, and that keeps its clipboard apart from the IDE's. On Linux
 * those two never meet at all: what is copied in the editor does not reach the panel, what is copied in
 * the panel does not reach the editor, and only "cut and paste without leaving the input field" works.
 * Through this object the page reaches the real clipboard - the same one the rest of the IDE uses.
 *
 * We go through CopyPasteManager rather than into java.awt.Toolkit directly: the platform keeps its own
 * synchronization over the system clipboard (a different one on different systems) and knows about
 * retries when somebody else is holding it at that moment.
 */
internal object WebviewClipboard {

    /**
     * The clipboard's contents in the shape the page understands.
     *
     * An image comes as a data URL: there is no other way to carry bytes into a browser through a text
     * message channel. The markup is not there for looks: attachments in the input field survive a copy
     * precisely inside it (see feed/tokens).
     */
    data class Content(val text: String, val html: String, val image: String)

    private val EMPTY = Content("", "", "")

    /**
     * Different sources put markup under different flavours: a whole document, a fragment, a selection.
     * We ask in turn and take the first that actually handed over a string.
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
     * Every flavour is asked for separately and in its own wrapper: someone else's Transferable is free
     * to answer with anything at all, up to an exception out of nowhere, and losing the whole clipboard
     * over one unlucky format serves nothing.
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
     * ImageIO writes rasters only, while the clipboard hands over any Image implementation - a
     * "not fully loaded yet" one from another application, for instance. We draw it into a raster of our
     * own with transparency: a screenshot with a transparent background must not turn black.
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
     * What we put into the clipboard: readable text and, if there is any, the same piece as markup.
     *
     * The markup is declared under all three flavours at once, because it will be asked for in different
     * ways: "the whole document" is asked for as a document, so a fragment is wrapped into one, while a
     * fragment and a selection are exactly what was copied. When there is no markup, plain text alone is
     * offered: an empty text/html confuses those who prefer it to plain text.
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
