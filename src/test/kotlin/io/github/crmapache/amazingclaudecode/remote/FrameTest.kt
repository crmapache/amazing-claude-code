package io.github.crmapache.amazingclaudecode.remote

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * The envelope has a twin on the relay's side (relay/src/wire/frame.ts), and the two are obliged to
 * agree byte for byte. What is checked here is the shape itself: the offsets, the limits, and the
 * refusals - the parts a mismatch would show up in first.
 */
class FrameTest {

    private fun address(fill: Byte) = ByteArray(Frame.ADDRESS_BYTES) { fill }

    private val max = 256 * 1024

    @Test
    fun `an envelope comes back out exactly as it went in`() {
        val raw = Frame.build(Frame.TYPE_SEALED, address(1), address(2), 42L, "sealed".toByteArray())

        val envelope = Frame.parse(raw, max)

        assertEquals(Frame.WIRE_VERSION, envelope.version)
        assertEquals(Frame.TYPE_SEALED, envelope.type)
        assertContentEquals(address(1), envelope.to)
        assertContentEquals(address(2), envelope.from)
        assertEquals(42L, envelope.counter)
        assertEquals("sealed", String(envelope.body))
    }

    @Test
    fun `the header is exactly forty-two bytes`() {
        val raw = Frame.build(Frame.TYPE_SEALED, address(1), address(2), 0L, ByteArray(0))

        assertEquals(Frame.HEADER_BYTES, raw.size)
    }

    /** The counter becomes part of a nonce in phase 3 - the whole range has to survive the trip. */
    @Test
    fun `a counter near the top of its range survives`() {
        val counter = Long.MAX_VALUE - 3
        val raw = Frame.build(Frame.TYPE_SEALED, address(1), address(2), counter, ByteArray(0))

        assertEquals(counter, Frame.parse(raw, max).counter)
    }

    @Test
    fun `something shorter than a header is refused`() {
        assertFailsWith<Frame.FrameException> { Frame.parse(ByteArray(Frame.HEADER_BYTES - 1), max) }
    }

    @Test
    fun `something over the size limit is refused`() {
        val raw = Frame.build(Frame.TYPE_SEALED, address(1), address(2), 0L, ByteArray(100))

        assertFailsWith<Frame.FrameException> { Frame.parse(raw, 50) }
    }

    @Test
    fun `a version we do not speak is refused`() {
        val raw = Frame.build(Frame.TYPE_SEALED, address(1), address(2), 0L, ByteArray(0))
        raw[0] = 99

        assertFailsWith<Frame.FrameException> { Frame.parse(raw, max) }
    }

    @Test
    fun `a frame type we do not know is refused`() {
        val raw = Frame.build(Frame.TYPE_SEALED, address(1), address(2), 0L, ByteArray(0))
        raw[1] = 0x7f

        assertFailsWith<Frame.FrameException> { Frame.parse(raw, max) }
    }

    @Test
    fun `an address is twenty-two characters and comes back whole`() {
        val text = Frame.encodeAddress(address(7))

        assertEquals(22, text.length)
        assertContentEquals(address(7), Frame.decodeAddress(text))
    }

    @Test
    fun `something that is not an address is refused`() {
        assertFailsWith<Frame.FrameException> { Frame.decodeAddress("short") }
        assertFailsWith<Frame.FrameException> { Frame.decodeAddress("!!! not base64 !!!") }
    }

    /** A log line gets four bytes and never more: the address is the one thing the relay does keep. */
    @Test
    fun `a log hint is four bytes of the address`() {
        val hint = Frame.addressHint(address(0xab.toByte()))

        assertEquals("abababab", hint)
        assertTrue(hint.length < Frame.encodeAddress(address(0xab.toByte())).length)
    }
}
