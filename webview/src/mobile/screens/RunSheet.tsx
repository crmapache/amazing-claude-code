import { useState } from 'react'
import { effortOptions, modelOptions, modeLabel, sameModel } from '../../catalog'
import type { ModelInfo } from '../../protocol'
import { Sheet } from './Sheet'
import m from '../mobile.module.css'
import { useT } from '../../i18n'

interface RunSheetProps {
  /** The catalogue as the CLI on that machine reports it, or null until it has said (see catalog.ts). */
  models: ModelInfo[] | null
  /** What this conversation runs on right now. */
  model: string
  effort: string
  mode: string
  onApply: (change: { model?: string; effort?: string }) => void
  onClose: () => void
}

/**
 * How the turn on screen runs: the model, the effort, and the mode it cannot change.
 *
 * The first two are here because they are about what a turn costs and how good it is, and that is a
 * decision somebody away from the desk genuinely has: finding a refactor grinding along on Haiku, or a
 * one-line fix burning a subscription on `max`, is finding the one thing about the run that could be
 * fixed from here in a tap. Neither widens what the agent may touch, which is what every other refusal
 * on this channel guards (see RemoteCommands).
 *
 * The mode is shown and locked, and the sentence under it says why rather than leaving a dead control:
 * it decides whether the agent asks before it writes, and this conversation may have somebody sitting in
 * front of it. A conversation started FROM the phone begins in any mode - that choice is on the screen
 * that starts one.
 *
 * Nothing here writes the machine's settings, unlike the same choice made at the desk: what the next tab
 * opened at that keyboard starts on is not a decision to take from a sofa (see SessionCommands, which
 * passes `remember = local`).
 */
export const RunSheet = ({ models, model, effort, mode, onApply, onClose }: RunSheetProps) => {
  const t = useT()
  const [pickedModel, setPickedModel] = useState(model)
  const [pickedEffort, setPickedEffort] = useState(effort)

  const changed = !sameModel(pickedModel, model) || pickedEffort !== effort

  return (
    <Sheet
      title={t.mobile.run.title}
      meta={t.mobile.run.subtitle}
      height="84%"
      onClose={onClose}
      footer={
        <>
          <button type="button" className={m.buttonSecondary} onClick={onClose}>
            {t.common.cancel}
          </button>
          <button
            type="button"
            className={m.buttonPrimary}
            disabled={!changed}
            onClick={() =>
              onApply({
                model: sameModel(pickedModel, model) ? undefined : pickedModel,
                effort: pickedEffort === effort ? undefined : pickedEffort,
              })
            }
          >
            {t.mobile.run.apply}
          </button>
        </>
      }
    >
      <p className={m.sheetLabel}>{t.selectors.model}</p>
      <div className={m.chipWrap}>
        {modelOptions(t, models).map((option) => (
          <button
            key={option.id}
            type="button"
            className={`${m.pickChip} ${sameModel(option.id, pickedModel) ? m.pickChipOn : ''}`}
            disabled={option.disabled}
            onClick={() => setPickedModel(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className={m.sheetLabel}>{t.selectors.effort}</p>
      <div className={m.chipWrap}>
        {effortOptions(t).map((option) => (
          <button
            key={option.id}
            type="button"
            className={`${m.pickChip} ${option.id === pickedEffort ? m.pickChipOn : ''}`}
            onClick={() => setPickedEffort(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className={m.sheetLabelRow}>
        <span className={m.sheetLabelInline}>{t.selectors.mode}</span>
        <span className={m.lockedTag}>
          <Lock />
          {t.mobile.run.locked}
        </span>
      </div>
      <div className={m.lockedRow}>
        <span className={m.lockedName}>{modeLabel(t, mode)}</span>
        <span className={m.lockedNow}>{t.mobile.run.inForce}</span>
      </div>
      <p className={m.sheetNote}>{t.mobile.run.modeNote}</p>
    </Sheet>
  )
}

const Lock = () => (
  <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <rect x="3" y="7" width="10" height="7" rx="1.6" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </svg>
)
