/**
 * Whether a message has to wait for the turn that is already running rather than go into it.
 *
 * A slash command only means anything as the first word of a turn. Written into a turn already running
 * it is not expanded at all: the CLI hands the agent the bare text "/compact" as a remark made mid-work,
 * and the agent - quite rightly - does nothing with it. An ordinary message in that same place is
 * delivered properly, so Send for everything else still means "reach the agent now".
 *
 * The shell knows this rule (PromptDelivery.waitsForTheTurn) and puts such a message in the queue. The
 * panel has to know it too, because it draws the card in the feed the moment Send is pressed: without
 * the rule the message stands in two places at once - said in the conversation and still waiting in the
 * queue above the field - and its card is left in the middle of somebody else's turn rather than where
 * the command was actually carried out.
 *
 * This is a `Frame.kt`/`frame.ts` case: one rule on both sides of the bridge, each half held by a test
 * of its own, changed on both or on neither.
 */
export const isCommand = (text: string): boolean => text.trimStart().startsWith('/')

export const waitsForTheTurn = (text: string, running: boolean): boolean => running && isCommand(text)
