import { useEffect, useRef } from 'react'
import type { ModelInfo, Scenario, ScenarioCard, ScenarioScope, ScenarioStage } from '../../protocol'
import { effortOptions, modeOptions, modelOptions, modeShortLabel } from '../../catalog'
import type { MenuOption } from '../Menu'
import { modeClass } from '../StatusBar'
import { Picker } from './Picker'
import { PromptField } from './PromptField'
import { blankCard, blankInput, blankSlot, blankStage } from '../../scenarios/blank'
import { cardRuns, MAX_CARD_RETRIES, MAX_STAGE_REPEAT, passesOf, problemsOf, blocking, type Problem } from '../../scenarios/rules'
import { useT, type Dict } from '../../i18n'
import { CrossIcon, DuplicateIcon } from './icons'
import type { EditorPlace } from './view'
import s from './scenarios.module.css'

/**
 * Where a round of work is written down: an outline on the left, and on the right only the part of it
 * being edited.
 *
 * It used to be one column with everything in it - the name, the main thread, the questions and every
 * card of every stage, one under another - which is a kilometre of textareas to scroll through to change
 * one sentence in the third stage. The outline is the map: stages and their cards are a list to jump
 * around in, and what is wrong with the scenario lives beside it rather than in a paragraph above the
 * form, because a problem names a card and the card is one click away in the same column.
 *
 * Nothing of this appears on the timeline of a run - a card whose text could be changed from inside a run
 * would be a card whose row says something the agent was never told.
 */
export interface ScenarioEditorProps {
  draft: Scenario
  /** A scenario that has never been saved: the shelf may still be chosen, and Cancel throws it away. */
  fresh: boolean
  /** Which part of it the right-hand pane is holding - kept in the view, see EditorPlace. */
  at: EditorPlace
  canShare: boolean
  /** The catalogue of the account in force, exactly as the menu under the composer gets it. */
  models: ModelInfo[] | null
  /** And the names somebody added by hand: a model exists because they said so (see CustomModels.tsx). */
  customModels: string[]
  onChange: (draft: Scenario) => void
  onPlace: (at: EditorPlace) => void
  onSave: (draft: Scenario, scope: ScenarioScope) => void
  onCancel: () => void
}

export const ScenarioEditor = ({
  draft,
  fresh,
  at,
  canShare,
  models,
  customModels,
  onChange,
  onPlace,
  onSave,
  onCancel,
}: ScenarioEditorProps) => {
  const t = useT()
  const problems = problemsOf(draft)
  const blockers = problems.filter(blocking)

  const editStage = (id: string, change: (stage: ScenarioStage) => ScenarioStage) =>
    onChange({ ...draft, stages: draft.stages.map((stage) => (stage.id === id ? change(stage) : stage)) })

  /*
   * A pin that has lost what it pointed at.
   *
   * A stage can be deleted from the outline while the pane is holding it, and a scenario written by a
   * model arrives with stages of its own - in both cases the place remembered in the view names nothing.
   * Falling back to the top of the outline rather than drawing an empty pane, which reads as a scenario
   * that lost its stages.
   */
  const place: EditorPlace =
    at.part === 'stage' && !draft.stages.some((stage) => stage.id === at.stageId) ? { part: 'name' } : at

  return (
    <div className={s.root}>
      <div className={s.head}>
        <button type="button" className={s.headBack} aria-label={t.common.back} onClick={onCancel}>
          ‹
        </button>
        <div className={s.headTitles}>
          <span className={s.editorName}>{draft.name || t.scenarios.newName}</span>
          <span className={s.hint}>
            {fresh
              ? t.scenarios.unsaved
              : [
                  draft.scope === 'project' ? t.scenarios.editor.inRepository : t.scenarios.editor.mine,
                  t.scenarios.stages(draft.stages.length),
                  t.scenarios.cards(cardRuns(draft)),
                ].join(' · ')}
          </span>
        </div>
        <span className={s.headSpace} />

        {/* How much is worth tidying, as a count: the list of them stands at the foot of the outline,
            where each one names the card it is about. */}
        {problems.length > 0 ? (
          <span className={`${s.issueCount} ${blockers.length > 0 ? s.issueCountBad : ''}`}>
            {t.scenarios.editor.issues(problems.length)}
          </span>
        ) : null}

        <button type="button" className={s.button} onClick={onCancel}>
          {fresh ? t.scenarios.discard : t.common.cancel}
        </button>
        <button
          type="button"
          className={`${s.button} ${s.buttonMain}`}
          onClick={() => onSave(draft, draft.scope)}
        >
          {t.scenarios.editor.save}
        </button>
      </div>

      <div className={s.editor}>
        <div className={s.outline}>
          <div className={s.outlineLabel}>{t.scenarios.editor.outline}</div>

          <button
            type="button"
            className={`${s.outlineRow} ${place.part === 'name' ? s.outlineOn : ''}`}
            onClick={() => onPlace({ part: 'name' })}
          >
            {t.scenarios.editor.nameAndShelf}
          </button>
          <button
            type="button"
            className={`${s.outlineRow} ${place.part === 'head' ? s.outlineOn : ''}`}
            onClick={() => onPlace({ part: 'head' })}
          >
            {t.scenarios.editor.head}
          </button>
          <button
            type="button"
            className={`${s.outlineRow} ${place.part === 'inputs' ? s.outlineOn : ''}`}
            onClick={() => onPlace({ part: 'inputs' })}
          >
            {t.scenarios.editor.inputs}
            <span className={s.outlineCount}>{draft.inputs.length}</span>
          </button>

          <div className={s.outlineLabel}>{t.scenarios.editor.stages}</div>

          {draft.stages.map((stage, index) => {
            const on = place.part === 'stage' && place.stageId === stage.id
            const passes = passesOf(stage)

            return (
              <div key={stage.id}>
                <button
                  type="button"
                  className={`${s.outlineRow} ${on ? s.outlineOn : ''}`}
                  onClick={() => onPlace({ part: 'stage', stageId: stage.id })}
                >
                  <span className={s.outlineNumber}>{index + 1}</span>
                  <span className={s.outlineText}>
                    <span className={s.outlineTitle}>{stage.title || t.scenarios.editor.untitledStage}</span>
                    {passes > 1 ? (
                      <span className={s.outlineNote}>
                        {stage.untilDone
                          ? t.scenarios.editor.roundsUntilShort(passes)
                          : t.scenarios.editor.roundsShort(passes)}
                      </span>
                    ) : null}
                  </span>
                  <span className={s.outlineCount}>{stage.cards.length}</span>
                </button>

                {/* The cards of the stage in the pane, so a click lands on a card rather than on the
                    stage it happens to belong to. */}
                {on
                  ? stage.cards.map((card) => (
                      <button
                        key={card.id}
                        type="button"
                        className={`${s.outlineCard} ${place.cardId === card.id ? s.outlineCardOn : ''}`}
                        onClick={() => onPlace({ part: 'stage', stageId: stage.id, cardId: card.id })}
                      >
                        {card.title || t.scenarios.editor.untitledCard}
                      </button>
                    ))
                  : null}
              </div>
            )
          })}

          <button
            type="button"
            className={s.outlineAdd}
            onClick={() => {
              const stage = blankStage(t.scenarios.editor.stageNumber(draft.stages.length + 1))
              onChange({ ...draft, stages: [...draft.stages, stage] })
              onPlace({ part: 'stage', stageId: stage.id })
            }}
          >
            {t.scenarios.editor.addStage}
          </button>

          {/*
            What is wrong with it, beside the outline rather than above the form: every one of these
            names a card, and the card is one click away in the same column.
          */}
          {problems.length > 0 ? (
            <div className={s.tidy}>
              <div className={s.tidyLabel}>
                {blockers.length > 0 ? t.scenarios.editor.problems : t.scenarios.editor.warnings}
              </div>
              {problems.map((problem, index) => (
                <button
                  key={`${problem.kind}:${problem.name ?? ''}:${index}`}
                  type="button"
                  className={`${s.tidyRow} ${blocking(problem) ? s.tidyBad : ''}`}
                  onClick={() => {
                    const stage = draft.stages.find((one) =>
                      problem.stageId ? one.id === problem.stageId : one.cards.some((card) => card.id === problem.cardId),
                    )
                    if (stage) onPlace({ part: 'stage', stageId: stage.id, cardId: problem.cardId })
                    else onPlace({ part: 'inputs' })
                  }}
                >
                  {describe(t, draft, problem)}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className={s.pane}>
          {place.part === 'name' ? (
            <>
              <div className={s.paneLabel}>{t.scenarios.editor.name}</div>
              <input
                className={s.field}
                value={draft.name}
                onChange={(event) => onChange({ ...draft, name: event.target.value })}
              />

              {/*
                The shelf, and it is not a setting: it is which file this is. Saving under the other one
                moves the file, so the two never hold the same scenario answering to one identifier.
              */}
              <div className={s.paneLabel}>{t.scenarios.editor.shelf}</div>
              <span className={s.segmented}>
                <button
                  type="button"
                  className={`${s.segment} ${draft.scope === 'project' ? s.segmentOn : ''}`}
                  disabled={!canShare}
                  onClick={() => onChange({ ...draft, scope: 'project' })}
                >
                  {t.scenarios.editor.inRepository}
                </button>
                <button
                  type="button"
                  className={`${s.segment} ${draft.scope === 'user' ? s.segmentOn : ''}`}
                  onClick={() => onChange({ ...draft, scope: 'user' })}
                >
                  {t.scenarios.editor.mine}
                </button>
              </span>
            </>
          ) : null}

          {place.part === 'head' ? (
            <>
              <div className={`${s.paneLabel} ${s.paneLabelPlain}`}>
                {t.scenarios.editor.head}
                <span className={s.paneNote}>{t.scenarios.editor.headNote}</span>
              </div>
              <textarea
                className={s.area}
                value={draft.head.briefing}
                placeholder={t.scenarios.editor.briefingHint}
                onChange={(event) => onChange({ ...draft, head: { ...draft.head, briefing: event.target.value } })}
              />

              <div className={s.chips}>
                <Picker
                  label={t.selectors.model}
                  title={t.selectors.model}
                  value={draft.head.model}
                  options={modelChoices(t, models, customModels, t.scenarios.editor.defaultModel, draft.head.model)}
                  onPick={(model) => onChange({ ...draft, head: { ...draft.head, model } })}
                />
                <Picker
                  label={t.selectors.effort}
                  title={t.selectors.effort}
                  value={draft.head.effort}
                  options={[{ id: '', label: t.scenarios.editor.defaultEffort }, ...effortOptions(t)]}
                  onPick={(effort) => onChange({ ...draft, head: { ...draft.head, effort } })}
                />
                {/*
                  The same word this selector carries under the input field, and the same colour: a mode
                  answers for what the agent may do without asking, and that is said by the accent before
                  anything is read (see modeClass).
                */}
                <Picker
                  label={t.selectors.mode}
                  title={t.selectors.mode}
                  value={draft.head.permissionMode}
                  className={modeClass(draft.head.permissionMode)}
                  short={(option) => modeShortLabel(t, option.id)}
                  options={modeOptions(t)}
                  onPick={(permissionMode) => onChange({ ...draft, head: { ...draft.head, permissionMode } })}
                />
                <Picker
                  label={t.scenarios.editor.onQuestion}
                  title={t.scenarios.editor.onQuestion}
                  value={draft.head.onQuestion}
                  options={[
                    { id: 'head', label: t.scenarios.editor.questionHead },
                    { id: 'stop', label: t.scenarios.editor.questionStop },
                  ]}
                  onPick={(onQuestion) =>
                    onChange({ ...draft, head: { ...draft.head, onQuestion: onQuestion as 'head' | 'stop' } })
                  }
                />
                <Picker
                  label={t.scenarios.editor.retries}
                  title={t.scenarios.editor.retries}
                  value={String(draft.head.retries)}
                  options={Array.from({ length: MAX_CARD_RETRIES + 1 }, (_, n) => ({
                    id: String(n),
                    label: n === 0 ? t.scenarios.editor.noRetries : t.scenarios.editor.retriesCount(n),
                  }))}
                  onPick={(retries) => onChange({ ...draft, head: { ...draft.head, retries: Number(retries) } })}
                />
              </div>
            </>
          ) : null}

          {place.part === 'inputs' ? (
            <>
              <div className={s.paneLabel}>
                {t.scenarios.editor.inputsLabel}
                <span className={s.paneLine} />
                <button
                  type="button"
                  className={s.button}
                  onClick={() => onChange({ ...draft, inputs: [...draft.inputs, blankInput()] })}
                >
                  {t.scenarios.editor.addInput}
                </button>
              </div>

              {draft.inputs.length === 0 ? (
                <div className={s.emptyShelf}>
                  <span className={s.emptyTitle}>{t.scenarios.editor.noInputs}</span>
                </div>
              ) : (
                <div className={s.form}>
                  {draft.inputs.map((input, index) => (
                    <div key={input.id} className={s.formRow}>
                      <input
                        className={`${s.field} ${s.fieldName}`}
                        value={input.name}
                        placeholder={t.scenarios.editor.inputName}
                        onChange={(event) =>
                          onChange({
                            ...draft,
                            inputs: draft.inputs.map((one, atOne) =>
                              atOne === index ? { ...one, name: event.target.value } : one,
                            ),
                          })
                        }
                      />
                      <input
                        className={s.field}
                        value={input.label}
                        placeholder={t.scenarios.editor.inputLabel}
                        onChange={(event) =>
                          onChange({
                            ...draft,
                            inputs: draft.inputs.map((one, atOne) =>
                              atOne === index ? { ...one, label: event.target.value } : one,
                            ),
                          })
                        }
                      />
                      <label className={s.check}>
                        <input
                          type="checkbox"
                          checked={input.required}
                          onChange={(event) =>
                            onChange({
                              ...draft,
                              inputs: draft.inputs.map((one, atOne) =>
                                atOne === index ? { ...one, required: event.target.checked } : one,
                              ),
                            })
                          }
                        />
                        {t.scenarios.editor.required}
                      </label>
                      <button
                        type="button"
                        className={`${s.iconButton} ${s.iconDanger}`}
                        aria-label={t.scenarios.editor.remove}
                        onClick={() =>
                          onChange({ ...draft, inputs: draft.inputs.filter((one) => one.id !== input.id) })
                        }
                      >
                        <CrossIcon />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}

          {place.part === 'stage'
            ? draft.stages
                .filter((stage) => stage.id === place.stageId)
                .map((stage) => (
                  <StagePane
                    key={stage.id}
                    stage={stage}
                    index={draft.stages.findIndex((one) => one.id === stage.id)}
                    total={draft.stages.length}
                    openCard={place.cardId}
                    models={models}
                    customModels={customModels}
                    onEdit={(change) => editStage(stage.id, change)}
                    onMove={(by) => {
                      const from = draft.stages.findIndex((one) => one.id === stage.id)
                      onChange({ ...draft, stages: moved(draft.stages, from, from + by) })
                    }}
                    onRemove={() => {
                      onChange({ ...draft, stages: draft.stages.filter((one) => one.id !== stage.id) })
                      onPlace({ part: 'name' })
                    }}
                  />
                ))
            : null}
        </div>
      </div>
    </div>
  )
}

const StagePane = ({
  stage,
  index,
  total,
  openCard,
  models,
  customModels,
  onEdit,
  onMove,
  onRemove,
}: {
  stage: ScenarioStage
  index: number
  total: number
  /** Which card the outline was pointing at, so the pane brings it into view. */
  openCard?: string
  models: ModelInfo[] | null
  customModels: string[]
  onEdit: (change: (stage: ScenarioStage) => ScenarioStage) => void
  onMove: (by: number) => void
  onRemove: () => void
}) => {
  const t = useT()
  const passes = passesOf(stage)

  return (
    <>
      <div className={s.paneLabel}>
        {t.scenarios.editor.stageHead(index + 1, stage.title || t.scenarios.editor.untitledStage)}
        <span className={s.paneLine} />
        {passes > 1 ? (
          <span className={s.paneNote}>
            {stage.untilDone ? t.scenarios.editor.goesRoundUntil(passes) : t.scenarios.editor.goesRound(passes)}
          </span>
        ) : null}
      </div>

      <div className={s.stageHead}>
        <input
          className={s.field}
          value={stage.title}
          placeholder={t.scenarios.stage}
          onChange={(event) => onEdit((one) => ({ ...one, title: event.target.value }))}
        />
        <button
          type="button"
          className={s.iconButton}
          aria-label={t.scenarios.editor.moveUp}
          data-tooltip={t.scenarios.editor.moveUp}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          className={s.iconButton}
          aria-label={t.scenarios.editor.moveDown}
          data-tooltip={t.scenarios.editor.moveDown}
          disabled={index === total - 1}
          onClick={() => onMove(1)}
        >
          ↓
        </button>
        {/* The last stage cannot be removed, and the button says so by being dead rather than by doing
            nothing: a scenario is its stages, and an empty one is a screen with a plus sign on it. */}
        <button
          type="button"
          className={`${s.iconButton} ${s.iconDanger}`}
          aria-label={t.scenarios.editor.remove}
          data-tooltip={t.scenarios.editor.remove}
          disabled={total === 1}
          onClick={onRemove}
        >
          <CrossIcon />
        </button>
      </div>

      <div className={s.chips}>
        <Picker
          label={t.scenarios.editor.passes}
          title={t.scenarios.editor.passes}
          width={200}
          value={String(stage.repeat)}
          options={Array.from({ length: MAX_STAGE_REPEAT }, (_, n) => ({
            id: String(n + 1),
            label: n === 0 ? t.scenarios.editor.once : t.scenarios.editor.times(n + 1),
          }))}
          onPick={(repeat) => onEdit((one) => ({ ...one, repeat: Number(repeat) }))}
        />
        {/*
          A loop that ends when there is nothing left to do rather than when the counter runs out. The
          number stays a ceiling either way, so a scenario cannot spend a night going round.
        */}
        {stage.repeat > 1 ? (
          <label className={s.check}>
            <input
              type="checkbox"
              checked={stage.untilDone}
              onChange={(event) => onEdit((one) => ({ ...one, untilDone: event.target.checked }))}
            />
            {t.scenarios.editor.untilDone}
          </label>
        ) : null}
      </div>

      {stage.cards.map((card, at) => (
        <CardBlock
          key={card.id}
          card={card}
          number={at + 1}
          first={at === 0}
          last={at === stage.cards.length - 1}
          open={openCard === card.id}
          models={models}
          customModels={customModels}
          onEdit={(change) =>
            onEdit((one) => ({
              ...one,
              cards: one.cards.map((each) => (each.id === card.id ? change(each) : each)),
            }))
          }
          onMove={(by) => onEdit((one) => ({ ...one, cards: moved(one.cards, at, at + by) }))}
          onCopy={() =>
            onEdit((one) => ({
              ...one,
              cards: [
                ...one.cards.slice(0, at + 1),
                { ...structuredClone(card), id: blankCard().id },
                ...one.cards.slice(at + 1),
              ],
            }))
          }
          onRemove={() => onEdit((one) => ({ ...one, cards: one.cards.filter((each) => each.id !== card.id) }))}
        />
      ))}

      <button
        type="button"
        className={s.addCard}
        onClick={() => onEdit((one) => ({ ...one, cards: [...one.cards, blankCard()] }))}
      >
        {t.scenarios.editor.addCardHere}
      </button>
    </>
  )
}

const CardBlock = ({
  card,
  number,
  first,
  last,
  open,
  models,
  customModels,
  onEdit,
  onMove,
  onCopy,
  onRemove,
}: {
  card: ScenarioCard
  number: number
  first: boolean
  last: boolean
  open: boolean
  models: ModelInfo[] | null
  customModels: string[]
  onEdit: (change: (card: ScenarioCard) => ScenarioCard) => void
  onMove: (by: number) => void
  onCopy: () => void
  onRemove: () => void
}) => {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)

  // Brought into view when the outline pointed at it, once - a card that scrolled itself into place on
  // every keystroke would take the screen away from whoever is typing in the one below.
  useEffect(() => {
    if (open) box.current?.scrollIntoView({ block: 'nearest' })
  }, [open])

  const inherits = !card.model && !card.effort && !card.permissionMode

  return (
    <div className={`${s.cardBlock} ${open ? s.cardOpen : ''}`} ref={box}>
      <div className={s.cardHead}>
        <span className={s.cardNumber}>{number}</span>
        <input
          className={s.cardTitle}
          value={card.title}
          placeholder={t.scenarios.editor.cardTitle}
          onChange={(event) => onEdit((one) => ({ ...one, title: event.target.value }))}
        />
        {inherits ? <span className={s.cardInherits}>{t.scenarios.editor.sameAsHead}</span> : null}
        <button
          type="button"
          className={s.iconButton}
          aria-label={t.scenarios.editor.moveUp}
          disabled={first}
          onClick={() => onMove(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          className={s.iconButton}
          aria-label={t.scenarios.editor.moveDown}
          disabled={last}
          onClick={() => onMove(1)}
        >
          ↓
        </button>
        <button
          type="button"
          className={s.iconButton}
          aria-label={t.scenarios.duplicate}
          data-tooltip={t.scenarios.duplicate}
          onClick={onCopy}
        >
          <DuplicateIcon />
        </button>
        <button
          type="button"
          className={`${s.iconButton} ${s.iconDanger}`}
          aria-label={t.scenarios.editor.remove}
          onClick={onRemove}
        >
          <CrossIcon />
        </button>
      </div>

      {/* What this card's own session will be told - the only thing here that reaches an agent, and the
          only field on the screen that keeps the console font. */}
      <div className={s.cardLabel}>{t.scenarios.editor.prompt}</div>
      <PromptField
        value={card.prompt}
        placeholder={t.scenarios.editor.promptHint}
        onChange={(prompt) => onEdit((one) => ({ ...one, prompt }))}
      />
      <p className={s.cardNote}>{t.scenarios.editor.promptNote}</p>

      {/* Two short answers side by side: what has to be true at the end, and what to carry forward.
          Both are read by the main thread rather than by the card, which is why they sit together. */}
      <div className={s.cardPair}>
        <div className={s.cardHalf}>
          <div className={s.cardLabel}>{t.scenarios.editor.dod}</div>
          <textarea
            className={`${s.area} ${s.areaShort}`}
            value={card.dod}
            placeholder={t.scenarios.editor.dodHint}
            onChange={(event) => onEdit((one) => ({ ...one, dod: event.target.value }))}
          />
        </div>
        <div className={s.cardHalf}>
          <div className={s.cardLabel}>{t.scenarios.editor.after}</div>
          <textarea
            className={`${s.area} ${s.areaShort}`}
            value={card.after}
            placeholder={t.scenarios.editor.afterHint}
            onChange={(event) => onEdit((one) => ({ ...one, after: event.target.value }))}
          />
        </div>
      </div>

      <div className={s.cardLabel}>{t.scenarios.editor.slots}</div>
      <div className={s.form}>
        {card.slots.length === 0 ? <p className={s.cardNote}>{t.scenarios.editor.noSlots}</p> : null}
        {card.slots.map((slot) => (
          <div key={slot.id} className={s.formRow}>
            <input
              className={`${s.field} ${s.fieldName} ${s.fieldMono}`}
              value={slot.name}
              placeholder={t.scenarios.editor.slotName}
              onChange={(event) =>
                onEdit((one) => ({
                  ...one,
                  slots: one.slots.map((each) =>
                    each.id === slot.id ? { ...each, name: event.target.value } : each,
                  ),
                }))
              }
            />
            <input
              className={s.field}
              value={slot.description}
              placeholder={t.scenarios.editor.slotHint}
              onChange={(event) =>
                onEdit((one) => ({
                  ...one,
                  slots: one.slots.map((each) =>
                    each.id === slot.id ? { ...each, description: event.target.value } : each,
                  ),
                }))
              }
            />
            <button
              type="button"
              className={`${s.iconButton} ${s.iconDanger}`}
              aria-label={t.scenarios.editor.remove}
              onClick={() => onEdit((one) => ({ ...one, slots: one.slots.filter((each) => each.id !== slot.id) }))}
            >
              <CrossIcon />
            </button>
          </div>
        ))}

        <button
          type="button"
          className={`${s.button} ${s.addSlot}`}
          onClick={() => onEdit((one) => ({ ...one, slots: [...one.slots, blankSlot()] }))}
        >
          {t.scenarios.editor.addSlot}
        </button>
      </div>

      <div className={s.cardLabel}>{t.scenarios.editor.overrides}</div>
      <div className={s.chips}>
        <Picker
          label={t.selectors.model}
          title={t.selectors.model}
          value={card.model}
          options={modelChoices(t, models, customModels, t.scenarios.editor.sameAsHead, card.model)}
          onPick={(model) => onEdit((one) => ({ ...one, model }))}
        />
        <Picker
          label={t.selectors.effort}
          title={t.selectors.effort}
          value={card.effort}
          options={[{ id: '', label: t.scenarios.editor.sameAsHead }, ...effortOptions(t)]}
          onPick={(effort) => onEdit((one) => ({ ...one, effort }))}
        />
        <Picker
          label={t.selectors.mode}
          title={t.selectors.mode}
          value={card.permissionMode}
          // Empty is "same as the main thread", and it wears no accent: this card decides nothing.
          className={modeClass(card.permissionMode)}
          // And it keeps its own words: "same as the main thread" has no short form to shorten to.
          short={(option) => (option.id ? modeShortLabel(t, option.id) : option.label)}
          options={[{ id: '', label: t.scenarios.editor.sameAsHead }, ...modeOptions(t)]}
          onPick={(permissionMode) => onEdit((one) => ({ ...one, permissionMode }))}
        />
      </div>
    </div>
  )
}

/**
 * The models this account can run, with "whatever a new tab would start with" in front.
 *
 * The same list the menu under the composer draws, from the same function: what a model is called, which
 * of them the plan allows, what stands in until the CLI answers and where a hand-added name goes are all
 * decided in one place (see modelOptions in catalog.ts). A second list here built straight out of the
 * catalogue is how this menu came to be empty in the first place - it had one entry, "default", on every
 * machine whose catalogue had not arrived, and no entry at all for a model somebody added by hand.
 *
 * A free field rather than a list would be a scenario that will not start six months from now, when the
 * name it was written with has gone. A value nobody offers - an older scenario, another account - is kept
 * as an entry of its own all the same, so opening the form does not quietly change what a scenario runs on.
 */
const modelChoices = (
  t: Dict,
  models: ModelInfo[] | null,
  customModels: string[],
  inherit: string,
  value: string,
): MenuOption[] => {
  const offered = modelOptions(t, models, customModels)

  return [
    { id: '', label: inherit },
    ...offered,
    ...(value && !offered.some((option) => option.id === value) ? [{ id: value, label: value }] : []),
  ]
}

const moved = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length) return list
  const copy = [...list]
  const [taken] = copy.splice(from, 1)
  copy.splice(to, 0, taken)
  return copy
}

/** A problem in words, naming the card it is in - a list of "unknownInput" would say nothing. */
const describe = (t: Dict, draft: Scenario, problem: Problem): string => {
  const card = draft.stages.flatMap((stage) => stage.cards).find((one) => one.id === problem.cardId)
  const where = card?.title || t.scenarios.editor.untitledCard
  const name = problem.name ?? ''

  switch (problem.kind) {
    case 'noStages':
      return t.scenarios.problems.noStages
    case 'emptyStage':
      return t.scenarios.problems.emptyStage
    case 'noPrompt':
      return t.scenarios.problems.noPrompt(where)
    case 'unknownInput':
      return t.scenarios.problems.unknownInput(where, name)
    case 'undeclaredSlot':
      return t.scenarios.problems.undeclaredSlot(where, name)
    case 'unusedSlot':
      return t.scenarios.problems.unusedSlot(where, name)
    case 'duplicateInput':
      return t.scenarios.problems.duplicateInput(name)
    case 'duplicateSlot':
      return t.scenarios.problems.duplicateSlot(where, name)
    case 'badInputName':
      return t.scenarios.problems.badInputName(name)
    default:
      return t.scenarios.problems.badSlotName(where, name)
  }
}
