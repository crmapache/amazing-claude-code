package io.github.crmapache.amazingclaudecode.feedback

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Base64

/**
 * A few characters of a hash, standing in for something that must not travel.
 *
 * The same digest the statistics already use for file names and project keys (see StatsCollector), kept
 * here in one place because two parts of the feedback report need it: the outline of a conversation, where
 * a path becomes a mark that says "the same file again", and the buffer of technical lines, where a path
 * that turned up inside somebody else's error message becomes the same kind of mark.
 *
 * Short on purpose. This is not a commitment that two different paths can never collide - it is a way to
 * say "this one again" inside one report without saying which one.
 */
internal object ShortHash {

    fun of(text: String, length: Int = 12): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(text.toByteArray(StandardCharsets.UTF_8))
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes).take(length)
    }
}
