import { useCallback, useMemo, useState } from 'react'

/**
 * The cards' state that lives in the interface only: what is expanded, which pieces of an edit have been
 * accepted. The agent knows nothing about this, so it has no place in the feed's shared model.
 */
export interface CardState {
  isOpen: (id: string) => boolean
  toggle: (id: string) => void
  appliedHunks: string[]
  applyHunk: (hunkId: string) => void
  rejectHunk: (hunkId: string) => void
  planDecisions: Record<string, 'approve' | 'keepPlanning'>
  decidePlan: (itemId: string, decision: 'approve' | 'keepPlanning') => void
  answeredAsks: string[]
  answerAsk: (itemId: string) => void
}

export const useCardState = (): CardState => {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [hunks, setHunks] = useState<string[]>([])
  const [planDecisions, setPlanDecisions] = useState<Record<string, 'approve' | 'keepPlanning'>>({})
  const [answeredAsks, setAnsweredAsks] = useState<string[]>([])

  const toggle = useCallback((id: string) => {
    setOpen((current) => ({ ...current, [id]: !current[id] }))
  }, [])

  const isOpen = useCallback((id: string) => open[id] === true, [open])

  const applyHunk = useCallback((hunkId: string) => {
    setHunks((current) => (current.includes(hunkId) ? current : [...current, hunkId]))
  }, [])

  const rejectHunk = useCallback((hunkId: string) => {
    setHunks((current) => current.filter((id) => id !== hunkId))
  }, [])

  const decidePlan = useCallback((itemId: string, decision: 'approve' | 'keepPlanning') => {
    setPlanDecisions((current) => ({ ...current, [itemId]: decision }))
  }, [])

  const answerAsk = useCallback((itemId: string) => {
    setAnsweredAsks((current) => (current.includes(itemId) ? current : [...current, itemId]))
  }, [])

  // An object reassembled afresh would change on every frame of a printing answer, and it travels into
  // every card of the feed - devaluing any memoization there.
  return useMemo(
    () => ({
      isOpen,
      toggle,
      appliedHunks: hunks,
      applyHunk,
      rejectHunk,
      planDecisions,
      decidePlan,
      answeredAsks,
      answerAsk,
    }),
    [isOpen, toggle, hunks, applyHunk, rejectHunk, planDecisions, decidePlan, answeredAsks, answerAsk],
  )
}
