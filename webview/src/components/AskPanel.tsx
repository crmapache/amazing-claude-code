import { useCallback, useEffect, useRef, useState } from 'react'
import type { AskItem, AskQuestion } from '../feed/types'
import { MAX_DIGIT_HOTKEYS, useDigitHotkey } from '../hooks/useDigitHotkey'
import s from './composer.module.css'

/** Печатают ли прямо сейчас в поле, которое этой панели не принадлежит. */
const typedOutside = (target: HTMLElement | null, panel: HTMLElement | null): boolean => {
  if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA')) return false
  return !panel?.contains(target)
}

interface AskPanelProps {
  /** Последний заданный агентом вопрос, на который ещё не отвечено — или ничего. */
  item: AskItem | undefined
  /** Пусто ли поле сообщения: от этого зависит, кому достаётся нажатая цифра. */
  composerEmpty: boolean
  /** Ложь, когда цифры заняты панелью разрешения — она держит ход жёстче. */
  hotkeys: boolean
  /**
   * Ответы вместе с самими вопросами: агент узнаёт свой вопрос по тексту, а не
   * по порядку (см. protocol, сообщение askAnswer).
   */
  onSubmit: (itemId: string, answers: { question: string; answer: string }[]) => void
  /**
   * Закрыть вопрос, не отвечая на варианты: человек скажет своими словами в
   * поле ввода. Агент получит отказ на свой вызов и пойдёт дальше — иначе он
   * так и стоял бы, ожидая выбора, которого никто не сделает.
   */
  onDismiss: (itemId: string) => void
}

/**
 * Закреплённая панель над полем ввода — по образцу TaskListPanel/Queue.
 * Вопрос блокирует ход, поэтому не должен теряться где-то посреди ленты:
 * пропадает сразу после отправки ответа, а не остаётся висеть неактивным.
 */
export const AskPanel = ({ item, composerEmpty, hotkeys, onSubmit, onDismiss }: AskPanelProps) => {
  /** Выбранные варианты на вопрос: у обычного — не больше одного, у multiSelect — сколько угодно. */
  const [picks, setPicks] = useState<Record<string, string[]>>({})
  const [custom, setCustom] = useState<Record<string, string>>({})
  /**
   * К какому вопросу относятся цифры. В одном вызове их бывает до шести, и без
   * этого было бы непонятно, что выбирает нажатая «2». Идёт по списку сверху
   * вниз: обычный вопрос пропускает вперёд сам, как только на него ответили, а
   * с несколькими вариантами (multiSelect) остаётся, пока не нажмут Enter, —
   * иначе вторую галочку хоткеем уже не поставить.
   */
  const [activeIndex, setActiveIndex] = useState(0)
  /** Сама панель: по ней отличаем своё поле «свой ответ» от чужой формы на странице. */
  const panel = useRef<HTMLDivElement>(null)

  const questions = item?.questions ?? []
  const active = questions[activeIndex]

  const toggle = useCallback((question: AskQuestion, optionId: string) => {
    setPicks((current) => {
      const selected = current[question.id] ?? []

      if (!question.multiSelect) return { ...current, [question.id]: [optionId] }

      const next = selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId]
      return { ...current, [question.id]: next }
    })
  }, [])

  const answerFor = useCallback(
    (question: AskQuestion): string => {
      const typed = custom[question.id]?.trim()
      if (typed) return typed

      const selected = picks[question.id] ?? []
      const labels = selected
        .map((optionId) => question.options.find((candidate) => candidate.id === optionId)?.label)
        .filter((label): label is string => Boolean(label))
      return labels.join(', ')
    },
    [custom, picks],
  )

  const answers = questions.map((question) => ({ question: question.title, answer: answerFor(question) }))
  const answered = answers.length > 0 && answers.every((entry) => entry.answer.length > 0)

  /** Дальше по списку — на первый вопрос, который ещё ждёт ответа. */
  const advance = useCallback(() => {
    setActiveIndex((current) => {
      const next = questions.findIndex((question, index) => index > current && answerFor(question).length === 0)
      return next < 0 ? current : next
    })
  }, [questions, answerFor])

  const pick = useCallback(
    (index: number) => {
      const option = active?.options[index]
      if (!active || !option) return

      toggle(active, option.id)
      // Обычный вопрос закрыт этим же нажатием — цифры уходят к следующему.
      if (!active.multiSelect) advance()
    },
    [active, toggle, advance],
  )

  useDigitHotkey(Math.min(active?.options.length ?? 0, MAX_DIGIT_HOTKEYS), pick, {
    enabled: hotkeys && Boolean(item),
    composerEmpty,
  })

  /**
   * Что делать по Enter — в ссылке, а не в зависимостях эффекта ниже.
   *
   * Ответы пересобираются на каждой перерисовке (их считает map по вопросам), а
   * перерисовывается панель на каждом кусочке печатающегося ответа агента и на
   * каждом тике секундомера. Стой они в зависимостях — слушатель окна снимался
   * бы и вешался заново по нескольку раз в секунду впустую.
   */
  const respond = useRef(() => {})
  respond.current = () => {
    if (!item) return
    if (answered) onSubmit(item.id, answers)
    else advance()
  }

  /**
   * Enter отправляет ответы, когда отвечено всё, и переводит к следующему
   * вопросу, пока не всё: тот же жест «готово», что и в терминале. Пока фокус в
   * поле сообщения, Enter принадлежит ему — там он отправляет сообщение.
   */
  useEffect(() => {
    if (!item || !hotkeys) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey) return

      const target = event.target as HTMLElement | null
      // Начатое сообщение отправляет своим Enter само поле сообщения.
      if (target?.isContentEditable && !composerEmpty) return
      // Чужое поле ввода Enter принадлежит целиком: он подтверждает то, что в
      // нём набрано, — адрес маркетплейса, команду MCP-сервера. Панель вопроса
      // при этом остаётся висеть над полем и её слушатель жив, поэтому без этой
      // проверки Enter в чужой форме отвечал бы агенту наполовину выбранным
      // вариантом, а сама форма не срабатывала вовсе. Свои поля («свой ответ»
      // под вариантами) — исключение: они часть этой же панели.
      if (typedOutside(target, panel.current)) return

      event.preventDefault()
      respond.current()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [item, hotkeys, composerEmpty])

  if (!item) return null

  return (
    <div className={s.ask} ref={panel}>
      <div className={s.askHead}>
        <span className={s.askLabel}>CLAUDE ASKS</span>
        <span className={s.askMeta}>{item.meta}</span>
        <div className={s.spacer} />
        <button
          type="button"
          className={s.askDismiss}
          title="Close and answer in your own words"
          aria-label="Close the question"
          onClick={() => onDismiss(item.id)}
        >
          ×
        </button>
      </div>

      <div className={s.askBody}>
        {item.questions.map((question, questionIndex) => {
          const selected = picks[question.id] ?? []
          // Цифры выбирают вариант только в одном вопросе за раз — у остальных
          // они приглушены, чтобы не обещать нажатие, которое уйдёт не сюда.
          const keyed = hotkeys && questionIndex === activeIndex

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
                  // Десятому варианту и дальше цифры не досталось — кружок
                  // остаётся пустым, чтобы подписи не разъехались по левому краю.
                  const digit = index < MAX_DIGIT_HOTKEYS ? String(index + 1) : ''

                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`${s.option} ${on ? s.optionOn : ''}`}
                      onClick={() => {
                        setActiveIndex(questionIndex)
                        toggle(question, option.id)
                      }}
                    >
                      {question.multiSelect ? (
                        <span className={`${s.optionCheck} ${on ? s.optionCheckOn : ''} ${keyed ? '' : s.optionKeyIdle}`}>
                          {on ? '✓' : digit}
                        </span>
                      ) : (
                        <span className={`${s.optionKey} ${on ? s.optionKeyOn : ''} ${keyed ? '' : s.optionKeyIdle}`}>
                          {digit}
                        </span>
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
                  onFocus={() => setActiveIndex(questionIndex)}
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
        <span className={s.askNote}>the run continues right where it asked</span>
      </div>
    </div>
  )
}
