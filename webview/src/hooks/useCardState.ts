import { useCallback, useMemo, useState } from 'react'

/**
 * What became of a plan card. The first two are the person's decision, after which the card has done its
 * job and leaves the feed. 'withdrawn' is nobody's - the agent took the question back (Stop pressed over
 * it, a hook that answered first), and then the plan stays in the feed, simply without buttons: the text
 * is still worth reading, and losing it because the turn was stopped would be the person's loss.
 */
export type PlanDecision = 'approve' | 'keepPlanning' | 'withdrawn'

/** What the shell said about a plan, as this screen understands it - see PlanDecision. */
export const planDecisionOf = (decision: string): PlanDecision => {
  if (decision === 'approve') return 'approve'
  return decision === 'withdrawn' ? 'withdrawn' : 'keepPlanning'
}

/**
 * The cards' state that lives in the interface only: what is expanded, which plans have been answered,
 * which questions have been closed. The agent knows nothing about this, so it has no place in the feed's
 * shared model.
 */
export interface CardState {
  isOpen: (id: string) => boolean
  toggle: (id: string) => void
  planDecisions: Record<string, PlanDecision>
  decidePlan: (itemId: string, decision: PlanDecision) => void
  answeredAsks: string[]
  answerAsk: (itemId: string) => void
  /**
   * Forget everything - for a screen that swaps one conversation for another under the same state.
   *
   * The identifiers this is keyed by are positions in a feed rather than names of their own (see push in
   * panelState), so two conversations hand out the same ones from the start. A phone, which shows one
   * conversation at a time and builds each from nothing, would otherwise carry "this question has been
   * answered" from the conversation just left into the one just opened - and the question standing in it
   * would be counted as answered before it was ever seen.
   */
  reset: () => void
}

export const useCardState = (): CardState => {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [planDecisions, setPlanDecisions] = useState<Record<string, PlanDecision>>({})
  const [answeredAsks, setAnsweredAsks] = useState<string[]>([])

  const toggle = useCallback((id: string) => {
    setOpen((current) => ({ ...current, [id]: !current[id] }))
  }, [])

  const isOpen = useCallback((id: string) => open[id] === true, [open])

  const decidePlan = useCallback((itemId: string, decision: PlanDecision) => {
    setPlanDecisions((current) => ({ ...current, [itemId]: decision }))
  }, [])

  const answerAsk = useCallback((itemId: string) => {
    setAnsweredAsks((current) => (current.includes(itemId) ? current : [...current, itemId]))
  }, [])

  const reset = useCallback(() => {
    setOpen({})
    setPlanDecisions({})
    setAnsweredAsks([])
  }, [])

  // An object reassembled afresh would change on every frame of a printing answer, and it travels into
  // every card of the feed - devaluing any memoization there.
  return useMemo(
    () => ({
      isOpen,
      toggle,
      planDecisions,
      decidePlan,
      answeredAsks,
      answerAsk,
      reset,
    }),
    [isOpen, toggle, planDecisions, decidePlan, answeredAsks, answerAsk, reset],
  )
}
