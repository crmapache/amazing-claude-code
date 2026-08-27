package io.github.crmapache.amazingclaudecode.feedback

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * The same three ceilings are written in three places - the panel greys out the Send button by them, the
 * plugin refuses files by them, and the service refuses a whole request by them - and nothing else would
 * notice if they drifted apart.
 *
 * Drift is not harmless in either direction. Raise it in the plugin alone and the panel keeps refusing
 * what would now go; lower it in the service alone and the panel promises a file will travel while the
 * server throws the request away. So the numbers are watched by reading the other sides' own sources, the
 * way this project already watches the sounds, the achievements and what a phone may ask for (see
 * RemoteCommandsTest).
 */
class FeedbackLimitsTest {

    @Test
    fun `the panel and the plugin agree on all three`() {
        val panel = File(PANEL)
        assertTrue(panel.isFile, "the panel's own source should be readable from the repository root")
        val source = panel.readText()

        assertEquals(FeedbackAttachments.MAX_FILES, number(source, "MAX_ATTACHMENTS"))
        assertEquals(FeedbackAttachments.MAX_FILE_BYTES, number(source, "MAX_ATTACHMENT_BYTES").toLong())
        assertEquals(FeedbackAttachments.MAX_TOTAL_BYTES, number(source, "MAX_TOTAL_BYTES").toLong())
    }

    @Test
    fun `the service allows at least as much as the plugin will send`() {
        val service = File(SERVICE)
        assertTrue(service.isFile, "the service's own configuration should be readable")
        val source = service.readText()

        assertEquals(FeedbackAttachments.MAX_FILES, fallback(source, "FEEDBACK_MAX_FILES"))

        /*
         * A whole request is bigger than the files in it: the report, the fields and multipart's own
         * framing all ride along. So this one is an inequality rather than an equality - but it has to
         * hold, or the largest reports would be refused by the server after the panel promised they
         * would go.
         */
        val body = fallback(source, "FEEDBACK_MAX_BODY_BYTES").toLong()
        assertTrue(
            body > FeedbackAttachments.MAX_TOTAL_BYTES,
            "the service would refuse a request the plugin is willing to send: $body vs ${FeedbackAttachments.MAX_TOTAL_BYTES}",
        )
    }

    /** `export const NAME = 10 * 1024 * 1024` - the product, whatever shape it was written in. */
    private fun number(source: String, name: String): Int {
        val raw = Regex("""$name\s*=\s*([0-9*\s]+)""").find(source)?.groupValues?.get(1)
        assertNotNull(raw, "$name is not written in ${PANEL.substringAfterLast('/')} in a shape this test can read")

        return product(raw)
    }

    /** `number('FEEDBACK_MAX_FILES', 10)` - the default the service falls back to. */
    private fun fallback(source: String, name: String): Int {
        val raw = Regex("""'$name',\s*([0-9*\s]+)\)""").find(source)?.groupValues?.get(1)
        assertNotNull(raw, "$name is not written in the service's config in a shape this test can read")

        return product(raw)
    }

    private fun product(raw: String): Int =
        raw.split('*').map { it.trim() }.filter { it.isNotEmpty() }.fold(1) { total, part -> total * part.toInt() }

    private companion object {
        /** Read from the repository root, the way RemoteCommandsTest reads the protocol. */
        const val PANEL = "webview/src/components/Feedback.tsx"
        const val SERVICE = "feedback-service/src/config.ts"
    }
}
