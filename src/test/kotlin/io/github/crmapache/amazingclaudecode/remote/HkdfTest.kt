package io.github.crmapache.amazingclaudecode.remote

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

/**
 * Checked against the specification's own vectors (RFC 5869, appendix A) rather than against itself.
 *
 * A key derivation that is self-consistent and wrong is the worst kind of wrong: everything works, both
 * sides agree, and the result is not what the standard says - so the day the other half is replaced by
 * a real HKDF, nothing decrypts and the reason is thirty commits back. The browser side already uses
 * the platform's HKDF, so this side has to match it exactly today, not eventually.
 */
class HkdfTest {

    private fun hex(text: String): ByteArray =
        text.chunked(2).map { it.toInt(16).toByte() }.toByteArray()

    private fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }

    /** RFC 5869, A.1: basic case with SHA-256. */
    @Test
    fun `matches the specification's first vector`() {
        val ikm = hex("0b".repeat(22))
        val salt = hex("000102030405060708090a0b0c")
        val info = hex("f0f1f2f3f4f5f6f7f8f9")

        val prk = Hkdf.extract(salt, ikm)
        val okm = Hkdf.expand(prk, info, 42)

        assertEquals("077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5", hex(prk))
        assertEquals(
            "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
            hex(okm),
        )
    }

    /** RFC 5869, A.2: longer inputs and outputs - the case that catches a broken counter. */
    @Test
    fun `matches the specification's second vector`() {
        val ikm = hex((0..79).joinToString("") { "%02x".format(it) })
        val salt = hex((0x60..0xaf).joinToString("") { "%02x".format(it) })
        val info = hex((0xb0..0xff).joinToString("") { "%02x".format(it) })

        val okm = Hkdf.expand(Hkdf.extract(salt, ikm), info, 82)

        assertEquals(
            "b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c" +
                "59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71" +
                "cc30c58179ec3e87c14c01d5c1f3434f1d87",
            hex(okm),
        )
    }

    /** RFC 5869, A.3: an empty salt, which is a different code path rather than a special case. */
    @Test
    fun `matches the specification's third vector, with no salt`() {
        val ikm = hex("0b".repeat(22))

        val prk = Hkdf.extract(ByteArray(0), ikm)
        val okm = Hkdf.expand(prk, ByteArray(0), 42)

        assertEquals("19ef24a32c717b167f33a91d6f648bdf96596776afdb6377ac434c1c293ccb04", hex(prk))
        assertEquals(
            "8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8",
            hex(okm),
        )
    }

    /**
     * The one property everything else rests on: two purposes, one secret, unrelated keys. Without it
     * a message sent to you could be replayed back at you and accepted as your own.
     */
    @Test
    fun `two purposes from one secret are unrelated`() {
        val secret = ByteArray(32) { it.toByte() }
        val salt = "salt".toByteArray()

        val toDevice = Hkdf.derive(salt, secret, "acc/v1/agent-to-device", 32)
        val toAgent = Hkdf.derive(salt, secret, "acc/v1/device-to-agent", 32)

        assertNotEquals(hex(toDevice), hex(toAgent))
    }

    @Test
    fun `the same inputs always give the same keys`() {
        val secret = ByteArray(32) { 7 }
        val salt = "salt".toByteArray()

        assertEquals(
            hex(Hkdf.derive(salt, secret, "acc/v1/agent-to-device", 32)),
            hex(Hkdf.derive(salt, secret, "acc/v1/agent-to-device", 32)),
        )
    }

    /** A different salt is a different exchange, even where the secret happened to repeat. */
    @Test
    fun `a different salt gives different keys`() {
        val secret = ByteArray(32) { 7 }

        assertNotEquals(
            hex(Hkdf.derive("first".toByteArray(), secret, "acc/v1/agent-to-device", 32)),
            hex(Hkdf.derive("second".toByteArray(), secret, "acc/v1/agent-to-device", 32)),
        )
    }
}
