package io.github.crmapache.amazingclaudecode.webview

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject

/** A restored draft's pasted pictures get their bytes back from their files - and nothing else is touched. */
class DraftImagesTest {

    private fun json(text: String) = Json.parseToJsonElement(text).jsonObject

    @Test
    fun `a pasted picture gets its bytes back from its file`() {
        val draft = json("""{"tokens":[{"kind":"chip","chip":{"kind":"img","value":"Image #1","path":"/p/a.png"}}],"quotes":[]}""")

        val back = DraftImages.rehydrate(draft) { path -> if (path == "/p/a.png") "data:image/png;base64,AAA" else null }

        assertEquals(
            json("""{"tokens":[{"kind":"chip","chip":{"kind":"img","value":"Image #1","path":"/p/a.png","data":"data:image/png;base64,AAA"}}],"quotes":[]}"""),
            back,
        )
    }

    /* The file is gone: the chip is left as it is, and the page turns it into a reference (see restoredDraft). */
    @Test
    fun `a picture whose file is gone and everything else stay as they were`() {
        val draft = json(
            """{"tokens":[{"kind":"text","value":"see"},{"kind":"chip","chip":{"kind":"file","value":"a.ts"}},""" +
                """{"kind":"chip","chip":{"kind":"img","value":"Image #2","path":"/gone.png"}}],"quotes":[]}""",
        )

        assertEquals(draft, DraftImages.rehydrate(draft) { null })
    }
}
