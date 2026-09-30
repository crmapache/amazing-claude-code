package io.github.crmapache.amazingclaudecode.scenario

import io.github.crmapache.amazingclaudecode.claude.ClaudeLaunch
import io.github.crmapache.amazingclaudecode.claude.PermissionChannel

/**
 * The rules of a take-over: when the head does a card's work itself, and what it may do while it does.
 *
 * Pulled out of the engine because both are decisions a night turns on and neither needs a process to be
 * checked. The engine is the one that raises and lowers the head; this only says whether it should, and
 * how the head's own permission prompts are answered while the fence is down (see HeadFence for the
 * fence itself).
 */
internal object TakeOver {

    /**
     * Whether a card its session could not finish goes to the head rather than ending the run.
     *
     * Once per card: a head that could not finish it either is a card nobody here can finish, and a
     * second take-over would be the same session trying the same thing again. And never over a stop the
     * head named as one that is not its to get past - asked at the verdict (see HeadTalk.verdictRequest),
     * because a scenario's hard stops live in its briefing and only the head has read it.
     */
    fun wanted(settings: HeadSettings, alreadyTaken: Boolean, stopAsked: Boolean): Boolean =
        settings.onGiveUp == HeadSettings.ON_GIVE_UP_HEAD && !alreadyTaken && !stopAsked

    /**
     * The head's own permission prompt, answered while it is doing a card's work.
     *
     * The same trust as the card it stands in for, and the same answer to whatever that trust does not
     * cover. With questions left to the head, the head asking is the head deciding, so it is allowed; with
     * questions left to a person, nobody here may grant it, so it is refused in words the head can work
     * around - there is no card to stand still, and standing the head still would be the night stopping
     * on the one session that was meant to finish it. A question in words is refused whichever way: the
     * one who would answer it is the one asking.
     */
    fun answer(settings: HeadSettings, request: PermissionChannel.ToolPermission): HeadFence.Verdict = when {
        request.toolName == ClaudeLaunch.ASK_TOOL -> HeadFence.Verdict(ok = false, why = NOBODY_TO_ASK)
        settings.onQuestion == HeadSettings.ON_QUESTION_STOP -> HeadFence.Verdict(ok = false, why = NOT_WITHOUT_A_PERSON)
        else -> HeadFence.Verdict(ok = true)
    }

    const val NOBODY_TO_ASK =
        "Nobody is here to answer: you are the one who decides in this run. Decide it by the briefing and carry on."

    const val NOT_WITHOUT_A_PERSON =
        "This scenario leaves anything its trust does not cover to a person, and nobody is here to grant it. " +
            "Do what the trust allows, and if the card cannot be finished without this, answer that it is not done."
}
