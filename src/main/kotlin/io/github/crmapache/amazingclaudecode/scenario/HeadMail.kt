package io.github.crmapache.amazingclaudecode.scenario

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * What the person writes to the head while the run goes, and when the head gets to read it.
 *
 * The head is one conversation from the first card to the last, so a word said to it stands for the rest of
 * the night - which is what writing to it is for. Before this the same thing took a second chat beside the
 * run: talk the run over there, stop it, and hand the work to that chat.
 *
 * What makes it more than "send the text" is that the head is not always free to read. Most of the run it
 * waits - a card is at work, a question waits for the person, the run is paused - and then the words go to it
 * at once, as a turn of their own. But while it answers a question of the run's (the slots, a verdict, another
 * pass) its turn has to end with the object the run moves on, and a turn broken into by a conversation comes
 * back without one; so the words wait, and go first in the next thing said to it. And while it does a card's
 * work itself (see ScenarioEngine.takeOver) the turn can be an hour, and the words are most often about that
 * very work - so they are written into the running turn, which the CLI reads between two of its steps.
 *
 * Kept apart from the engine so that the choice can be tested without a process: the engine says what the
 * head is doing, this says which way the words go.
 */
internal object HeadMail {

    /** Which way words written to the head go right now. */
    enum class Way {
        /** A turn of their own: the head is free to answer them. */
        NOW,

        /** Into the turn that is going: the head is doing a card's work. */
        INTO_WORK,

        /** Not yet: they go first in the next thing said to the head, or on their own once it is free. */
        LATER,
    }

    /**
     * Which way the words go.
     *
     * [headUp] is whether there is a head process to say anything to. [turnOpen] is whether a turn of the
     * head's is in flight - one of ours being answered, or one an interrupt has not finished closing yet: a
     * word sent over a turn still closing would be read as part of it. [answeringPerson] is whether that turn
     * is the head answering the person, [doingCardWork] whether it is a card's work, and [waitingOnOthers]
     * whether the run is in a phase where the head has nothing asked of it - a card at work, a question
     * standing for the person, a pause.
     */
    fun way(
        headUp: Boolean,
        turnOpen: Boolean,
        answeringPerson: Boolean,
        doingCardWork: Boolean,
        waitingOnOthers: Boolean,
    ): Way = when {
        !headUp -> Way.LATER
        answeringPerson -> Way.LATER
        doingCardWork && turnOpen -> Way.INTO_WORK
        !turnOpen && waitingOnOthers -> Way.NOW
        else -> Way.LATER
    }

    /** What the person wrote that has not reached the head yet, oldest first. */
    fun waiting(notes: List<RunNote>): List<RunNote> =
        notes.filter { it.who == RunNote.PERSON && it.deliveredAt == 0L }.sortedBy { it.at }

    /** The notes with the given ones marked as read by the head at [now]. */
    fun delivered(notes: List<RunNote>, which: Collection<RunNote>, now: Long): List<RunNote> {
        val stamps = which.mapTo(HashSet()) { it.at }
        return notes.map { if (it.who == RunNote.PERSON && it.at in stamps) it.copy(deliveredAt = now) else it }
    }

    /**
     * The notes with the given ones waiting again - a turn that carried them died before the head answered
     * (its process was taken down and raised again, see ScenarioEngine.raiseHead), so they are said again.
     */
    fun undelivered(notes: List<RunNote>, stamps: Collection<Long>): List<RunNote> {
        val wanted = stamps.toHashSet()
        return notes.map { if (it.who == RunNote.PERSON && it.at in wanted) it.copy(deliveredAt = 0) else it }
    }

    /**
     * The moment a new note is written down at: now, or a moment after the last one.
     *
     * Notes are told apart and put in order by this stamp - on the screen and here (see [delivered]) - and a
     * reply written in the same millisecond as the words it answers would be the same note twice.
     */
    fun stamp(notes: List<RunNote>, now: Long): Long = maxOf(now, (notes.maxOfOrNull { it.at } ?: 0L) + 1)

    /**
     * What the person's field held, as the timeline will draw it: the same tokens, with the bytes of pasted
     * pictures taken out.
     *
     * The record of a run is written on every change and goes to every window and every paired phone, and a
     * screenshot is a megabyte of base64. The chip keeps its caption and the path the panel saved the bytes to
     * (see PastedFiles), which is what a chat's sent message keeps too; the bytes themselves go to the head
     * once, with the words (see ScenarioEngine.deliverTold), and nowhere else. Anything that is not the shape
     * the panel sends is dropped rather than kept as it came.
     */
    fun shown(tokens: JsonElement?): JsonElement? {
        val list = tokens as? JsonArray ?: return null
        return JsonArray(
            list.mapNotNull { token ->
                val one = token as? JsonObject ?: return@mapNotNull null
                val chip = one["chip"] as? JsonObject ?: return@mapNotNull one
                JsonObject(one + ("chip" to JsonObject(chip - "data")))
            },
        )
    }

    /** How much of what the person wrote is kept: a message, not a document pasted into a run. */
    const val TOLD_CHARS = 8000
}
