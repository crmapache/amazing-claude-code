package io.github.crmapache.amazingclaudecode.scenario

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/**
 * Reading the object the head answered with - a model's JSON, and therefore any shape at all.
 *
 * The head is asked for a small object with named fields (see HeadTalk), and it usually writes one. What
 * it is not is a promise: asked for a sentence in `handoff` it may answer with an object of notes, asked
 * for `reason` it may answer with a list. Read with kotlinx's `jsonPrimitive`, every one of those throws
 * - and the throw lands on the thread reading the CLI's output, so what a person sees is not a run that
 * went wrong but the IDE's own "Exception in plugin" dialog, with the run standing still behind it.
 *
 * Recorded live: a head on Haiku answered `handoff` with an object, and this is what came of it.
 *
 * So every field is read as "a primitive, or nothing" - the same forgiving reading the model's own
 * scenarios are put through (see ScenarioAuthor.scenarioOf). A field of the wrong shape is then a field
 * nobody said, which is a thing the engine already knows how to handle: it asks again, once, and gives
 * up with a verdict rather than an exception.
 */
internal object HeadAnswer {

    /** A field the head was asked to write in words. Empty when it is missing or is not a word at all. */
    fun text(body: JsonObject, name: String): String = (body[name] as? JsonPrimitive)?.contentOrNull.orEmpty()

    /**
     * A yes or a no, and null when neither was said.
     *
     * The string forms are taken too ("true", "false"): the head writes JSON by hand, and a model that
     * quotes a boolean has still answered the question it was asked.
     */
    fun flag(body: JsonObject, name: String): Boolean? = (body[name] as? JsonPrimitive)?.let { value ->
        value.booleanOrNull ?: value.contentOrNull?.lowercase()?.let {
            when (it) {
                "true", "yes" -> true
                "false", "no" -> false
                else -> null
            }
        }
    }
}
