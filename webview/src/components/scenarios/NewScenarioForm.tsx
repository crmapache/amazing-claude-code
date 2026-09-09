import type { ScenarioScope } from '../../protocol'
import { formatDuration } from '../../feed/tools'
import { useFieldHistory } from '../../hooks/useFieldHistory'
import { useTicking } from '../../hooks/useTicking'
import { useT } from '../../i18n'
import { Overlay } from './Overlay'
import s from './scenarios.module.css'

/**
 * How a new scenario begins: a sentence about the round of work, and a model to write it down.
 *
 * The description leads and the empty form stands beside it, because that is the order of the difficulty.
 * Anybody can say what they want done every Monday; almost nobody wants to fill in three stages of cards,
 * slots and definitions of done to find out what the thing even is. What comes back is a draft in the
 * editor, never a saved file - the whole form is on the screen afterwards and every word of it can be
 * changed, which is what makes handing the first draft to a model safe to do at all.
 *
 * The wait is answered rather than left to a spinner: this takes half a minute or more, because the model
 * reads the project before it writes (see ScenarioAuthor). An indeterminate bar, the seconds already
 * spent, and a Cancel that genuinely ends the process - and the field dims, because while it runs it
 * really does take no keystrokes.
 */
export const NewScenarioForm = ({
  description,
  scope,
  canShare,
  since,
  error,
  onChange,
  onScope,
  onDraft,
  onCancel,
  onByHand,
  onClose,
}: {
  description: string
  scope: ScenarioScope
  /** Whether this project has a repository to put a shared scenario in at all. */
  canShare: boolean
  /** When the model started writing, or 0 when nobody is - see draftingSince. */
  since: number
  error: string
  onChange: (description: string) => void
  onScope: (scope: ScenarioScope) => void
  onDraft: () => void
  onCancel: () => void
  onByHand: () => void
  onClose: () => void
}) => {
  const t = useT()
  // Cmd/Ctrl+Backspace, Cmd/Ctrl+Z and the step forward, which this browser does not give a field of its
  // own (see useFieldHistory). Every plain field of the panel goes through it.
  const keys = useFieldHistory(description, onChange)
  const drafting = since > 0

  // Only while the model writes: a form nothing on which changes by itself has no business being redrawn
  // once a second (see useTicking, which is also where the reset on the first tick lives).
  const now = useTicking(drafting)

  return (
    <Overlay
      title={t.scenarios.draft.title}
      subtitle={drafting ? t.scenarios.draft.reading : t.scenarios.draft.subtitle}
      onClose={drafting ? onCancel : onClose}
      foot={
        drafting ? (
          <>
            <span className={s.overlayNote}>
              <span className={s.draftGoing}>{t.scenarios.draft.going}</span>
              {/* How long it has already taken, beside the words rather than instead of them: a line that
                  reads the same at the tenth second and at the ninetieth is a line that cannot be told
                  from one that has stopped. A reading, so it is not translated. */}
              <span className={s.draftElapsed}>{formatDuration(now - since)}</span>
            </span>
            <span className={s.overlayButtons}>
              <button type="button" className={s.button} onClick={onCancel}>
                {t.common.cancel}
              </button>
            </span>
          </>
        ) : (
          <>
            <span className={s.overlayButtons}>
              {/* The way it always worked, kept as a button beside the field rather than behind a choice:
                  it is the same door it has always been, not a decision to make first. */}
              <button type="button" className={s.button} onClick={onByHand}>
                {t.scenarios.draft.byHand}
              </button>
              <button
                type="button"
                className={`${s.button} ${s.buttonMain}`}
                disabled={description.trim().length === 0}
                onClick={onDraft}
              >
                {t.scenarios.draft.write}
              </button>
            </span>
          </>
        )
      }
    >
      <div className={s.overlayLabel}>{t.scenarios.draft.label}</div>

      <textarea
        className={`${s.area} ${s.draftArea}`}
        value={description}
        placeholder={t.scenarios.draft.hint}
        disabled={drafting}
        autoFocus
        onChange={keys.onChange}
        // Enter breaks the line here, unlike in the field for the model's search: a round of work is
        // described in paragraphs more often than in one sentence, and the button under the field is
        // what sends it.
        onKeyDown={keys.onKeyDown}
      />

      {/* Under the field rather than beside the caption: it belongs to what is being written, and it is
          the only thing on the screen that moves while a model works for half a minute. */}
      {drafting ? <div className={s.draftBar} /> : <p className={s.overlayHint}>{t.scenarios.draft.keys}</p>}

      {error ? <p className={s.draftError}>{error}</p> : null}

      <div className={s.overlayLabel}>{t.scenarios.editor.shelf}</div>
      <span className={s.segmented}>
        <button
          type="button"
          className={`${s.segment} ${scope === 'project' ? s.segmentOn : ''}`}
          disabled={!canShare || drafting}
          onClick={() => onScope('project')}
        >
          {t.scenarios.editor.inRepository}
        </button>
        <button
          type="button"
          className={`${s.segment} ${scope === 'user' ? s.segmentOn : ''}`}
          disabled={drafting}
          onClick={() => onScope('user')}
        >
          {t.scenarios.editor.mine}
        </button>
      </span>
    </Overlay>
  )
}
