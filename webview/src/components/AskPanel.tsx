import { useState } from 'react'
import type { AskItem, AskQuestion } from '../feed/types'
import s from './composer.module.css'

interface AskPanelProps {
  /** Последний заданный агентом вопрос, на который ещё не отвечено — или ничего. */
  item: AskItem | undefined
  onSubmit: (itemId: string, answers: string[]) => void
}

/**
 * Закреплённая панель над полем ввода — по образцу TaskListPanel/Queue.
 * Вопрос блокирует ход, поэтому не должен теряться где-то посреди ленты:
 * пропадает сразу после отправки ответа, а не остаётся висеть неактивным.
 */
export const AskPanel = ({ item, onSubmit }: AskPanelProps) => {
  /** Выбранные варианты на вопрос: у обычного — не больше одного, у multiSelect — сколько угодно. */
  const [picks, setPicks] = useState<Record<string, string[]>>({})
  const [custom, setCustom] = useState<Record<string, string>>({})

  if (!item) return null

  const toggle = (question: AskQuestion, optionId: string) => {
    setPicks((current) => {
      const selected = current[question.id] ?? []

      if (!question.multiSelect) return { ...current, [question.id]: [optionId] }

      const next = selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId]
      return { ...current, [question.id]: next }
    })
  }

  const answerFor = (question: AskQuestion): string => {
    const typed = custom[question.id]?.trim()
    if (typed) return typed

    const selected = picks[question.id] ?? []
    const labels = selected
      .map((optionId) => question.options.find((candidate) => candidate.id === optionId)?.label)
      .filter((label): label is string => Boolean(label))
    return labels.join(', ')
  }

  const answers = item.questions.map((question) => answerFor(question))
  const answered = answers.every((answer) => answer.length > 0)

  return (
    <div className={s.ask}>
      <div className={s.askHead}>
        <span className={s.askLabel}>CLAUDE ASKS</span>
        <span className={s.askMeta}>{item.meta}</span>
        <div className={s.spacer} />
      </div>

      <div className={s.askBody}>
        {item.questions.map((question) => {
          const selected = picks[question.id] ?? []

          return (
            <div key={question.id} className={s.question}>
              <div className={s.questionHead}>
                <span className={s.questionTitle}>{question.title}</span>
                <span className={s.questionHint}>{question.hint}</span>
                {question.multiSelect ? <span className={s.questionMulti}>pick any</span> : null}
              </div>

              <div className={s.options}>
                {question.options.map((option, index) => {
                  const on = selected.includes(option.id)
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`${s.option} ${on ? s.optionOn : ''}`}
                      onClick={() => toggle(question, option.id)}
                    >
                      {question.multiSelect ? (
                        <span className={`${s.optionCheck} ${on ? s.optionCheckOn : ''}`}>{on ? '✓' : ''}</span>
                      ) : (
                        <span className={`${s.optionKey} ${on ? s.optionKeyOn : ''}`}>{index + 1}</span>
                      )}
                      <div>
                        <div className={`${s.optionLabel} ${on ? s.optionLabelOn : ''}`}>{option.label}</div>
                        {option.sub ? <div className={s.optionSub}>{option.sub}</div> : null}
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className={s.other}>
                <span className={s.otherLabel}>OTHER</span>
                <input
                  className={s.otherInput}
                  placeholder="type your own answer…"
                  value={custom[question.id] ?? ''}
                  onChange={(event) =>
                    setCustom((current) => ({ ...current, [question.id]: event.target.value }))
                  }
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className={s.askFoot}>
        <button
          type="button"
          className={`${s.primary} ${answered ? s.primaryBranch : s.primaryOff}`}
          disabled={!answered}
          onClick={() => onSubmit(item.id, answers)}
        >
          {answered ? 'Send answers' : 'Pick to continue'}
        </button>
        <div className={s.spacer} />
        <span className={s.askNote}>answers are sent as your next message</span>
      </div>
    </div>
  )
}
