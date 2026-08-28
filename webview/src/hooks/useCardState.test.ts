import { describe, expect, it } from 'vitest'
import { planDecisionOf } from './useCardState'

/**
 * What the shell says about a plan, as a screen understands it.
 *
 * Written down because the reading used to be "approve, or else keep planning", and a third answer
 * appeared later: the agent may take the question back before anyone decides (Stop pressed over the card,
 * a hook that answered first). Read as "keep planning", such a plan would leave the feed as though the
 * person had sent it back for revision - the plan's text gone, and a revision nobody asked for implied.
 *
 * Both screens read it through this one function: the panel and the phone must not disagree about what
 * became of a card they are both showing.
 */
describe('what became of a plan', () => {
  it('is the decision the person took', () => {
    expect(planDecisionOf('approve')).toBe('approve')
    expect(planDecisionOf('keepPlanning')).toBe('keepPlanning')
  })

  it('is nobody s decision when the agent took the question back', () => {
    expect(planDecisionOf('withdrawn')).toBe('withdrawn')
  })

  /** An answer from a newer shell than this screen: a plan sent back for revision is the safe reading. */
  it('is a revision when the word is unfamiliar', () => {
    expect(planDecisionOf('something-new')).toBe('keepPlanning')
  })
})
