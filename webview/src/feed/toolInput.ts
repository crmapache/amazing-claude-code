import { parseParagraphs } from './markdown'
import type { AskQuestion, Paragraph, TodoEntry } from './types'

/**
 * Reading what a tool was called with.
 *
 * A tool's input is arbitrary JSON: the panel takes out of it only what it draws, and treats anything
 * unexpected as absent. Kept apart from the feed's assembly because the same input is read from two
 * places - by the main stream's calls and by a subagent's - and those two readings must not drift apart.
 */

export const readTodos = (input: Record<string, unknown>): TodoEntry[] => {
  const raw = Array.isArray(input.todos) ? input.todos : []

  return raw.map((entry, index) => {
    const item = (entry ?? {}) as Record<string, unknown>
    const status = typeof item.status === 'string' ? item.status : 'pending'

    return {
      id: `todo-${index}`,
      text: typeof item.content === 'string' ? item.content : '',
      state: status === 'completed' ? 'done' : status === 'in_progress' ? 'active' : 'todo',
      activeForm: (typeof item.activeForm === 'string' ? item.activeForm : '') || undefined,
    }
  })
}

/**
 * A plan arrives as one piece of markdown text - and we show it with the same parsing as an ordinary
 * answer from the agent (see PlanItem.paragraphs).
 */
export const readPlan = (input: Record<string, unknown>): Paragraph[] =>
  parseParagraphs(typeof input.plan === 'string' ? input.plan : '')

export const readQuestions = (input: Record<string, unknown>): AskQuestion[] => {
  const raw = Array.isArray(input.questions) ? input.questions : []

  return raw.map((entry, index) => {
    const question = (entry ?? {}) as Record<string, unknown>
    const options = Array.isArray(question.options) ? question.options : []

    return {
      id: `q-${index}`,
      title: typeof question.question === 'string' ? question.question : '',
      hint: typeof question.header === 'string' ? question.header : '',
      multiSelect: question.multiSelect === true,
      options: options.map((optionRaw, optionIndex) => {
        const option = (optionRaw ?? {}) as Record<string, unknown>
        return {
          id: `o-${optionIndex}`,
          label: typeof option.label === 'string' ? option.label : '',
          sub: typeof option.description === 'string' ? option.description : '',
        }
      }),
    }
  })
}
