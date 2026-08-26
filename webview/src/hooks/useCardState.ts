import { useCallback, useMemo, useState } from 'react'

/**
 * The cards' state that lives in the interface only: what is expanded, which plans have been answered,
 * which questions have been closed. The agent knows nothing about this, so it has no place in the feed's
 * shared model.
 */
export interface CardState {
  isOpen: (id: string) => boolean
  toggle: (id: string) => void
  planDecisions: Record<string, 'approve' | 'keepPlanning'>
  decidePlan: (itemId: string, decision: 'approve' | 'keepPlanning') => void
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
  const [planDecisions, setPlanDecisions] = useState<Record<string, 'approve' | 'keepPlanning'>>({})
  const [answeredAsks, setAnsweredAsks] = useState<string[]>([])

  const toggle = useCallback((id: string) => {
    setOpen((current) => ({ ...current, [id]: !current[id] }))
  }, [])

  const isOpen = useCallback((id: string) => open[id] === true, [open])

  const decidePlan = useCallback((itemId: string, decision: 'approve' | 'keepPlanning') => {
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
