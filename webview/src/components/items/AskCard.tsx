import { useState } from 'react'
import type { AskItem } from '../../feed/types'
import s from '../feed.module.css'

interface AskCardProps {
  item: AskItem
  picks: Record<string, string>
  onPick: (questionId: string, optionId: string) => void
  onSubmit: (answers: string[]) => void
}

export const AskCard = ({ item, picks, onPick, onSubmit }: AskCardProps) => {
  const [custom, setCustom] = useState<Record<string, string>>({})

  const answerFor = (questionId: string): string => {
    const typed = custom[questionId]?.trim()
    if (typed) return typed

    const question = item.questions.find((candidate) => candidate.id === questionId)
    const option = question?.options.find((candidate) => candidate.id === picks[questionId])
    return option?.label ?? ''
  }

  const answers = item.questions.map((question) => answerFor(question.id))
  const answered = answers.every((answer) => answer.length > 0)

  return (
    <div className={s.ask}>
      <div className={s.askHead}>
        <span className={s.askLabel}>CLAUDE ASKS</span>
        <span className={s.compactText}>{item.meta}</span>
        <div className={s.spacer} />
      </div>

      <div className={s.askBody}>
        {item.questions.map((question) => (
          <div key={question.id} className={s.question}>
            <div className={s.questionHead}>
              <span className={s.questionTitle}>{question.title}</span>
              <span className={s.questionHint}>{question.hint}</span>
            </div>

            <div className={s.options}>
              {question.options.map((option, index) => {
                const on = picks[question.id] === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`${s.option} ${on ? s.optionOn : ''}`}
                    onClick={() => onPick(question.id, option.id)}
                  >
                    <span className={`${s.optionKey} ${on ? s.optionKeyOn : ''}`}>{index + 1}</span>
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
        ))}
      </div>

      <div className={s.askFoot}>
        <button
          type="button"
          className={`${s.primary} ${answered ? s.primaryBranch : s.primaryOff}`}
          onClick={() => (answered ? onSubmit(answers) : undefined)}
        >
          {item.sent ? '✓ Answers sent' : answered ? 'Send answers' : 'Pick to continue'}
        </button>
        <div className={s.spacer} />
        <span className={s.askNote}>answers are sent as your next message</span>
      </div>
    </div>
  )
}
