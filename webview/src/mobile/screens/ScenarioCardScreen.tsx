import { useState } from 'react'
import { useT } from '../../i18n'
import type { ModelInfo, Scenario, ScenarioCard } from '../../protocol'
import { effortOptions, modeOptions } from '../../catalog'
import { blankSlot } from '../../scenarios/blank'
import { PromptField } from '../../components/scenarios/PromptField'
import { Back } from './Back'
import { PickSheet } from './ScenarioPick'
import { labelOf, modelChoices, PickRow } from './ScenarioEditor'
import m from '../mobile.module.css'

/**
 * One card, all of it, on one screen.
 *
 * The whole of what a card is fits a phone as long as it is the only thing on it: the prompt is the one
 * field here that is genuinely code and it wants the width, and the two short answers under it are read
 * by the main thread rather than by the card - which is the whole of understanding one.
 *
 * The prompt is drawn by the panel's own field, lit slot names and all (see PromptField). Not a copy of
 * it: the same component, because the thing that matters about a prompt - which names in it are filled
 * in and by whom - is the same on both screens.
 */
export const ScenarioCardScreen = ({
  draft,
  stageId,
  cardId,
  models,
  customModels,
  onChange,
  onBack,
}: {
  draft: Scenario
  stageId: string
  cardId: string
  models: ModelInfo[] | null
  customModels: string[]
  onChange: (draft: Scenario) => void
  onBack: () => void
}) => {
  const t = useT()
  const [picking, setPicking] = useState<'model' | 'effort' | 'mode' | ''>('')

  const stage = draft.stages.find((one) => one.id === stageId)
  const card = stage?.cards.find((one) => one.id === cardId)
  const stageAt = draft.stages.findIndex((one) => one.id === stageId)
  const cardAt = stage?.cards.findIndex((one) => one.id === cardId) ?? -1

  const edit = (change: (card: ScenarioCard) => ScenarioCard) =>
    onChange({
      ...draft,
      stages: draft.stages.map((one) =>
        one.id !== stageId
          ? one
          : { ...one, cards: one.cards.map((each) => (each.id === cardId ? change(each) : each)) },
      ),
    })

  if (!stage || !card) {
    return (
      <>
        <header className={m.threadHeader}>
          <div className={m.threadHeadRow}>
            <Back onClick={onBack} />
            <span className={m.threadTitles}>
              <span className={m.threadTitle}>{t.scenarios.editor.untitledCard}</span>
            </span>
          </div>
        </header>
        <div className={m.scenarioList}>
          <p className={m.empty}>{t.scenarios.problems.emptyStage}</p>
        </div>
      </>
    )
  }

  return (
    <>
      <header className={m.threadHeader}>
        <div className={m.threadHeadRow}>
          <Back onClick={onBack} />
          <span className={m.threadTitles}>
            <span className={m.threadTitle}>{card.title || t.scenarios.editor.untitledCard}</span>
            <span className={m.threadWhere}>
              {t.mobile.scenarios.editor.card(stageAt + 1, cardAt + 1, stage.cards.length)}
            </span>
          </span>
          <button type="button" className={m.headerWord} onClick={onBack}>
            {t.mobile.scenarios.editor.done}
          </button>
        </div>
      </header>

      <div className={m.scenarioList}>
        <div className={m.formRow}>
          <input
            className={m.input}
            value={card.title}
            placeholder={t.scenarios.editor.cardTitle}
            onChange={(event) => edit((one) => ({ ...one, title: event.target.value }))}
          />
        </div>

        <p className={m.bandTitle}>{t.scenarios.editor.prompt}</p>
        <PromptField
          value={card.prompt}
          placeholder={t.scenarios.editor.promptHint}
          onChange={(prompt) => edit((one) => ({ ...one, prompt }))}
        />
        <p className={m.formNote}>{t.scenarios.editor.promptNote}</p>

        <p className={m.bandTitle}>{t.scenarios.editor.dod}</p>
        <textarea
          className={`${m.input} ${m.sheetArea}`}
          value={card.dod}
          placeholder={t.scenarios.editor.dodHint}
          autoCapitalize="sentences"
          onChange={(event) => edit((one) => ({ ...one, dod: event.target.value }))}
        />

        <p className={m.bandTitle}>{t.scenarios.editor.after}</p>
        <textarea
          className={`${m.input} ${m.sheetArea}`}
          value={card.after}
          placeholder={t.scenarios.editor.afterHint}
          autoCapitalize="sentences"
          onChange={(event) => edit((one) => ({ ...one, after: event.target.value }))}
        />

        <p className={m.bandTitle}>{t.scenarios.editor.slots}</p>
        <div className={m.card}>
          {card.slots.length === 0 ? <p className={m.formNote}>{t.scenarios.editor.noSlots}</p> : null}
          {card.slots.map((slot) => (
            <div key={slot.id} className={m.formRow}>
              <input
                className={`${m.input} ${m.inputMono}`}
                value={slot.name}
                placeholder={t.scenarios.editor.slotName}
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(event) =>
                  edit((one) => ({
                    ...one,
                    slots: one.slots.map((each) =>
                      each.id === slot.id ? { ...each, name: event.target.value } : each,
                    ),
                  }))
                }
              />
              <input
                className={m.input}
                value={slot.description}
                placeholder={t.scenarios.editor.slotHint}
                onChange={(event) =>
                  edit((one) => ({
                    ...one,
                    slots: one.slots.map((each) =>
                      each.id === slot.id ? { ...each, description: event.target.value } : each,
                    ),
                  }))
                }
              />
              <button
                type="button"
                className={m.rowButtonDanger}
                onClick={() => edit((one) => ({ ...one, slots: one.slots.filter((each) => each.id !== slot.id) }))}
              >
                {t.scenarios.editor.remove}
              </button>
            </div>
          ))}
          <button
            type="button"
            className={m.wideButton}
            onClick={() => edit((one) => ({ ...one, slots: [...one.slots, blankSlot()] }))}
          >
            {t.scenarios.editor.addSlot}
          </button>
        </div>

        <p className={m.bandTitle}>{t.scenarios.editor.overrides}</p>
        <div className={m.card}>
          <PickRow
            name={t.selectors.model}
            value={labelOf(modelChoices(t, models, customModels, t.scenarios.editor.sameAsHead), card.model)}
            onOpen={() => setPicking('model')}
          />
          <PickRow
            name={t.selectors.effort}
            value={labelOf([{ id: '', label: t.scenarios.editor.sameAsHead }, ...effortOptions(t)], card.effort)}
            onOpen={() => setPicking('effort')}
          />
          <PickRow
            name={t.selectors.mode}
            value={labelOf(
              [{ id: '', label: t.scenarios.editor.sameAsHead }, ...modeOptions(t)],
              card.permissionMode,
            )}
            onOpen={() => setPicking('mode')}
          />
        </div>
      </div>

      {picking ? (
        <PickSheet
          title={picking === 'model' ? t.selectors.model : picking === 'effort' ? t.selectors.effort : t.selectors.mode}
          value={picking === 'model' ? card.model : picking === 'effort' ? card.effort : card.permissionMode}
          options={
            picking === 'model'
              ? modelChoices(t, models, customModels, t.scenarios.editor.sameAsHead)
              : picking === 'effort'
                ? [{ id: '', label: t.scenarios.editor.sameAsHead }, ...effortOptions(t)]
                : [{ id: '', label: t.scenarios.editor.sameAsHead }, ...modeOptions(t)]
          }
          onPick={(id) => {
            if (picking === 'model') edit((one) => ({ ...one, model: id }))
            else if (picking === 'effort') edit((one) => ({ ...one, effort: id }))
            else edit((one) => ({ ...one, permissionMode: id }))
            setPicking('')
          }}
          onClose={() => setPicking('')}
        />
      ) : null}
    </>
  )
}
