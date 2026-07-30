import { useCallback, useState } from 'react'
import type { PermItem, TodoState } from '../feed/types'

/**
 * Состояние карточек, которое живёт только в интерфейсе: что раскрыто, какие
 * куски правки приняты, что выбрано в вопросах. Агент об этом ничего не знает,
 * поэтому в общей модели ленты ему не место.
 */
export interface CardState {
  isOpen: (id: string) => boolean
  toggle: (id: string) => void
  appliedHunks: string[]
  applyHunk: (hunkId: string) => void
  rejectHunk: (hunkId: string) => void
  todoOverrides: Record<string, TodoState>
  setTodo: (itemId: string, todoId: string, state: TodoState) => void
  picks: Record<string, string>
  pick: (itemId: string, questionId: string, optionId: string) => void
  decisions: Record<string, PermItem['decision']>
  decide: (itemId: string, decision: PermItem['decision']) => void
  approvedPlans: string[]
  approvePlan: (itemId: string) => void
}

export const useCardState = (): CardState => {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [hunks, setHunks] = useState<string[]>([])
  const [todos, setTodos] = useState<Record<string, TodoState>>({})
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [decisions, setDecisions] = useState<Record<string, PermItem['decision']>>({})
  const [plans, setPlans] = useState<string[]>([])

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

  // Ключ склеенный: один и тот же номер пункта встречается в разных списках задач.
  const setTodo = useCallback((itemId: string, todoId: string, state: TodoState) => {
    setTodos((current) => ({ ...current, [`${itemId}:${todoId}`]: state }))
  }, [])

  const pick = useCallback((itemId: string, questionId: string, optionId: string) => {
    setPicks((current) => ({ ...current, [`${itemId}:${questionId}`]: optionId }))
  }, [])

  const decide = useCallback((itemId: string, decision: PermItem['decision']) => {
    setDecisions((current) => ({ ...current, [itemId]: decision }))
  }, [])

  const approvePlan = useCallback((itemId: string) => {
    setPlans((current) => (current.includes(itemId) ? current : [...current, itemId]))
  }, [])

  return {
    isOpen,
    toggle,
    appliedHunks: hunks,
    applyHunk,
    rejectHunk,
    todoOverrides: todos,
    setTodo,
    picks,
    pick,
    decisions,
    decide,
    approvedPlans: plans,
    approvePlan,
  }
}

/** Достаёт отметки одного списка задач из общего словаря. */
export const todoOverridesFor = (
  overrides: Record<string, TodoState>,
  itemId: string,
): Record<string, TodoState> => {
  const prefix = `${itemId}:`
  const result: Record<string, TodoState> = {}

  for (const [key, value] of Object.entries(overrides)) {
    if (key.startsWith(prefix)) result[key.slice(prefix.length)] = value
  }

  return result
}

/** То же для выбранных вариантов в карточке вопросов. */
export const picksFor = (picks: Record<string, string>, itemId: string): Record<string, string> => {
  const prefix = `${itemId}:`
  const result: Record<string, string> = {}

  for (const [key, value] of Object.entries(picks)) {
    if (key.startsWith(prefix)) result[key.slice(prefix.length)] = value
  }

  return result
}
