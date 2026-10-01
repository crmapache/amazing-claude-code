package io.github.crmapache.amazingclaudecode.remote

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/**
 * A message from a device that did not fit in one frame, put back together.
 *
 * One frame through the relay is capped at 256 KB (see RelayLink.MAX_FRAME_BYTES), and a photo from a
 * phone is not. Squeezed into a single frame, a detailed shot came out at 660 pixels and still did not
 * fit, so the phone refused it with "try one photo at a time" over exactly one photo (2026-10-01). Raising
 * the cap would raise it for every frame of every kind, and for every queue on the way that holds them.
 * Instead a message too big for one frame travels as several, each an ordinary sealed frame, and is
 * joined here.
 *
 * A part carries a slice of the message's own text, so what comes out is exactly what would have arrived
 * whole, and it goes through exactly the same door (see RemoteAgent.part). What is bounded here is what a
 * device can make this side hold: how big a message may grow, how many parts it may claim, how many may
 * be half-built at once and for how long. Every part has already been counted against the device's
 * allowance by weight (see RemoteLimits.allowBytes) - this is about memory, not about rate.
 */
internal class RemoteParts(private val clock: () -> Long = System::currentTimeMillis) {

    sealed interface Outcome {
        /** More to come. */
        data object Waiting : Outcome

        /** The last part arrived: the message as it was sent. */
        data class Whole(val text: String) : Outcome

        /** Not a part this side will hold - why, in words fit for the diagnostic log. */
        data class Refused(val why: String) : Outcome
    }

    private class Assembly(val count: Int, val startedAt: Long) {
        val slices = arrayOfNulls<String>(count)
        var arrived = 0
        var chars = 0L
    }

    /** By device and the sender's name for the message, oldest first - see [MAX_IN_FLIGHT]. */
    private val building = LinkedHashMap<String, Assembly>()

    @Synchronized
    fun take(deviceId: String, payload: JsonObject): Outcome {
        val now = clock()
        // A message whose last part never came: the line dropped half-way, and the phone sends the whole
        // of it again under a new name when it is back (see link.ts). Nothing will ever finish this one.
        building.values.removeAll { now - it.startedAt > PATIENCE_MS }

        // Read as primitives or not at all: a field that is an object where a number belongs would throw
        // out of the plain accessor, and this is text from the other end of a public relay.
        val id = (payload["id"] as? JsonPrimitive)?.contentOrNull.orEmpty()
        val index = (payload["i"] as? JsonPrimitive)?.intOrNull ?: -1
        val count = (payload["n"] as? JsonPrimitive)?.intOrNull ?: 0
        val slice = (payload["d"] as? JsonPrimitive)?.takeIf { it.isString }?.content

        if (!ID.matches(id) || slice == null) return Outcome.Refused("a part without its fields")
        // One part is a message that fitted, and would have been sent as one.
        if (count < 2 || count > MAX_PARTS) return Outcome.Refused("a message claiming $count parts")
        if (index !in 0 until count) return Outcome.Refused("part $index of $count")

        val key = "$deviceId$SEPARATOR$id"
        val assembly = building[key] ?: run {
            // A device sends one message at a time and maybe its retry: past that, the oldest half-built
            // one goes rather than the newest - it is the one least likely to still be coming.
            val mine = building.keys.filter { it.startsWith("$deviceId$SEPARATOR") }
            if (mine.size >= MAX_IN_FLIGHT) building.remove(mine.first())
            Assembly(count, now).also { building[key] = it }
        }

        if (assembly.count != count) {
            building.remove(key)
            return Outcome.Refused("parts of one message disagree on how many there are")
        }

        // A part already here - nothing new in it.
        if (assembly.slices[index] != null) return Outcome.Waiting

        assembly.chars += slice.length
        if (assembly.chars > MAX_CHARS) {
            building.remove(key)
            return Outcome.Refused("a message over ${MAX_CHARS / (1024 * 1024)} MB")
        }

        assembly.slices[index] = slice
        assembly.arrived += 1
        if (assembly.arrived < count) return Outcome.Waiting

        building.remove(key)
        return Outcome.Whole(assembly.slices.joinToString(""))
    }

    /** A device is gone - whatever it was half-way through sending goes with it. */
    @Synchronized
    fun forget(deviceId: String) {
        building.keys.removeAll { it.startsWith("$deviceId$SEPARATOR") }
    }

    companion object {
        /**
         * How big a message may be, put together. The phone's photos take up to three million characters
         * of base64 between them (see mobile/images.ts), and the text and the JSON around them are small
         * next to that.
         */
        const val MAX_CHARS = 4L * 1024 * 1024

        /** A part is a couple of hundred kilobytes, so this is comfortably past [MAX_CHARS]. */
        const val MAX_PARTS = 40

        /** Half-built messages one device may have here at once - the one it is sending and a retry of it. */
        const val MAX_IN_FLIGHT = 2

        /** How long a half-built message is waited for. Minutes, because a phone's uplink can be slow. */
        const val PATIENCE_MS = 3 * 60_000L

        /**
         * Only a message may be this big. Everything else a phone says is a few hundred bytes, so a part
         * that turns out to be anything else is somebody trying the door rather than a photo.
         */
        private val MAY_BE_LARGE = setOf("prompt", "queuePrompt")

        /** Whether [whole], put together, is something allowed to have travelled in parts. */
        fun mayArriveInParts(whole: JsonObject): Boolean {
            if ((whole["k"] as? JsonPrimitive)?.contentOrNull != "cmd") return false
            val message = whole["b"] as? JsonObject ?: return false
            return (message["type"] as? JsonPrimitive)?.contentOrNull in MAY_BE_LARGE
        }

        /** The sender's name for a message - its own words, so held to a shape before it becomes a key. */
        private val ID = Regex("[A-Za-z0-9_-]{1,64}")

        /** Between the device and the message in a key. A device's address is base64url and never holds it. */
        private const val SEPARATOR = '\u0000'
    }
}
