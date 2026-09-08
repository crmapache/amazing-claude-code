import type { ModelInfo, Scenario, ScenarioCard, ScenarioScope, ScenarioStage } from '../../protocol'
import { effortOptions, modeOptions, modelOptions, modeShortLabel } from '../../catalog'
import type { MenuOption } from '../Menu'
import { modeClass } from '../StatusBar'
import { Picker } from './Picker'
import { blankCard, blankInput, blankSlot, blankStage } from '../../scenarios/blank'
import { MAX_CARD_RETRIES, MAX_STAGE_REPEAT, problemsOf, type Problem } from '../../scenarios/rules'
import { useT, type Dict } from '../../i18n'
import s from './scenarios.module.css'

/**
 * Where a round of work is written down.
 *
 * Everything a scenario is is on this one screen, in the order it is thought about: what the run is for,
 * what it needs to be told before it starts, and then the stages with their cards. Nothing of it appears
 * on the timeline of a run - a card whose text could be changed from inside a run would be a card whose
 * row says something the agent was never told.
 *
 * The problems are listed at the top rather than marked in place, and they are computed here on every
 * keystroke rather than asked of the IDE (see scenarios/rules.ts). A prompt that mentions a name nobody
 * declared is a card that will reach an agent with `[[findings]]` still in it, and the moment to find
 * that out is while it is being typed.
 */
export interface ScenarioEditorProps {
  draft: Scenario
  /** A scenario that has never been saved: the shelf may still be chosen, and Cancel throws it away. */
  fresh: boolean
  canShare: boolean
  /** The catalogue of the account in force, exactly as the menu under the composer gets it. */
  models: ModelInfo[] | null
  /** And the names somebody added by hand: a model exists because they said so (see CustomModels.tsx). */
  customModels: string[]
  onChange: (draft: Scenario) => void
  onSave: (draft: Scenario, scope: ScenarioScope) => void
  onCancel: () => void
}

export const ScenarioEditor = ({
  draft,
  fresh,
  canShare,
  models,
  customModels,
  onChange,
  onSave,
  onCancel,
}: ScenarioEditorProps) => {
  const t = useT()
  const problems = problemsOf(draft)
  const blockers = problems.filter((problem) => problem.kind !== 'unusedSlot')

  const editStage = (id: string, change: (stage: ScenarioStage) => ScenarioStage) =>
    onChange({ ...draft, stages: draft.stages.map((stage) => (stage.id === id ? change(stage) : stage)) })

  return (
    <div className={s.root}>
      <div className={s.head}>
        <button type="button" className={s.headBack} aria-label={t.common.back} onClick={onCancel}>
          ‹
        </button>
        <div className={s.headTitles}>
          <span className={s.title}>{fresh ? t.scenarios.editor.newTitle : t.scenarios.editor.title}</span>
          <span className={s.hint}>{draft.name}</span>
        </div>
        <span className={s.headSpace} />
        <button
          type="button"
          className={`${s.button} ${s.buttonMain}`}
          onClick={() => onSave(draft, draft.scope)}
        >
          {t.scenarios.editor.save}
        </button>
      </div>

      <div className={s.body}>
        {problems.length > 0 ? (
          <div className={s.problems}>
            {blockers.length > 0 ? t.scenarios.editor.problems : t.scenarios.editor.warnings}
            <ul className={s.problemsList}>
              {problems.map((problem, index) => (
                <li key={`${problem.kind}:${problem.name ?? ''}:${index}`}>{describe(t, draft, problem)}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/*
          The caption stands over the field rather than beside it, like every other caption on this
          screen. A label in a column of its own put the one field here a hundred pixels to the right of
          everything under it - the briefing, the chips, the stages all begin at the same left edge, and
          the first field of the form was the only thing that did not.
        */}
        <div className={s.section}>
          <div className={s.label}>
            {t.scenarios.editor.name}
            <span className={s.labelLine} />
          </div>

          <div className={s.form}>
            <div className={s.formRow}>
              <input
                className={s.field}
                value={draft.name}
                onChange={(event) => onChange({ ...draft, name: event.target.value })}
              />
            </div>

            {/*
              The shelf, and it is not a setting: it is which file this is. Saving under the other one
              moves the file, so the two never hold the same scenario answering to one identifier.
            */}
            <div className={s.chips}>
              <Picker
                label={t.scenarios.editor.shelf}
                title={t.scenarios.editor.shelf}
                value={draft.scope}
                options={[
                  { id: 'project', label: t.scenarios.editor.inRepository, disabled: !canShare },
                  { id: 'user', label: t.scenarios.editor.mine },
                ]}
                onPick={(scope) => onChange({ ...draft, scope: scope as ScenarioScope })}
              />
            </div>
          </div>
        </div>

        {/* --- The head ------------------------------------------------------------- */}

        <div className={s.section}>
          <div className={s.label}>
            {t.scenarios.editor.head}
            <span className={s.labelLine} />
          </div>

          <div className={s.form}>
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
          </div>
        </div>

        {/* --- What it asks before it starts ---------------------------------------- */}

        <div className={s.section}>
          <div className={s.label}>
            {t.scenarios.editor.inputs}
            <span className={s.labelLine} />
            <button
              type="button"
              className={s.iconButton}
              aria-label={t.scenarios.editor.addInput}
              data-tooltip={t.scenarios.editor.addInput}
              onClick={() => onChange({ ...draft, inputs: [...draft.inputs, blankInput()] })}
            >
              +
            </button>
          </div>

          {draft.inputs.length === 0 ? (
            <p className={s.empty}>{t.scenarios.editor.noInputs}</p>
          ) : (
            <div className={s.form}>
              {draft.inputs.map((input, index) => (
                <div key={input.id} className={s.formRow}>
                  <input
                    className={s.field}
                    style={{ maxWidth: 130 }}
                    value={input.name}
                    placeholder={t.scenarios.editor.inputName}
                    onChange={(event) =>
                      onChange({
                        ...draft,
                        inputs: draft.inputs.map((one, at) =>
                          at === index ? { ...one, name: event.target.value } : one,
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
                        inputs: draft.inputs.map((one, at) =>
                          at === index ? { ...one, label: event.target.value } : one,
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
                          inputs: draft.inputs.map((one, at) =>
                            at === index ? { ...one, required: event.target.checked } : one,
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
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* --- The stages ------------------------------------------------------------ */}

        <div className={s.section}>
          <div className={s.label}>
            {t.scenarios.editor.stages}
            <span className={s.labelLine} />
          </div>

          {draft.stages.map((stage, index) => (
            <StageBlock
              key={stage.id}
              stage={stage}
              first={index === 0}
              last={index === draft.stages.length - 1}
              models={models}
              customModels={customModels}
              onEdit={(change) => editStage(stage.id, change)}
              onMove={(by) =>
                onChange({ ...draft, stages: moved(draft.stages, index, index + by) })
              }
              onRemove={() =>
                onChange({ ...draft, stages: draft.stages.filter((one) => one.id !== stage.id) })
              }
            />
          ))}

          <button
            type="button"
            className={s.button}
            onClick={() =>
              onChange({
                ...draft,
                stages: [...draft.stages, blankStage(t.scenarios.editor.stageNumber(draft.stages.length + 1))],
              })
            }
          >
            {t.scenarios.editor.addStage}
          </button>
        </div>
      </div>
    </div>
  )
}

const StageBlock = ({
  stage,
  first,
  last,
  models,
  customModels,
  onEdit,
  onMove,
  onRemove,
}: {
  stage: ScenarioStage
  first: boolean
  last: boolean
  models: ModelInfo[] | null
  customModels: string[]
  onEdit: (change: (stage: ScenarioStage) => ScenarioStage) => void
  onMove: (by: number) => void
  onRemove: () => void
}) => {
  const t = useT()

  return (
    <div className={s.stageBlock}>
      <div className={s.cardHead}>
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
          className={`${s.iconButton} ${s.iconDanger}`}
          aria-label={t.scenarios.editor.remove}
          onClick={onRemove}
        >
          ×
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

      <div className={s.subLabel}>{t.scenarios.editor.cards}</div>

      <div className={s.cards}>
        {stage.cards.map((card, at) => (
          <CardBlock
            key={card.id}
            card={card}
            first={at === 0}
            last={at === stage.cards.length - 1}
            models={models}
            customModels={customModels}
            onEdit={(change) =>
              onEdit((one) => ({
                ...one,
                cards: one.cards.map((each) => (each.id === card.id ? change(each) : each)),
              }))
            }
            onMove={(by) => onEdit((one) => ({ ...one, cards: moved(one.cards, at, at + by) }))}
            onRemove={() =>
              onEdit((one) => ({ ...one, cards: one.cards.filter((each) => each.id !== card.id) }))
            }
          />
        ))}

        <button
          type="button"
          className={s.button}
          onClick={() => onEdit((one) => ({ ...one, cards: [...one.cards, blankCard()] }))}
        >
          {t.scenarios.editor.addCard}
        </button>
      </div>
    </div>
  )
}

const CardBlock = ({
  card,
  first,
  last,
  models,
  customModels,
  onEdit,
  onMove,
  onRemove,
}: {
  card: ScenarioCard
  first: boolean
  last: boolean
  models: ModelInfo[] | null
  customModels: string[]
  onEdit: (change: (card: ScenarioCard) => ScenarioCard) => void
  onMove: (by: number) => void
  onRemove: () => void
}) => {
  const t = useT()

  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <input
          className={s.field}
          value={card.title}
          placeholder={t.scenarios.editor.cardTitle}
          onChange={(event) => onEdit((one) => ({ ...one, title: event.target.value }))}
        />
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
          className={`${s.iconButton} ${s.iconDanger}`}
          aria-label={t.scenarios.editor.remove}
          onClick={onRemove}
        >
          ×
        </button>
      </div>

      {/* What this card's own session will be told - the only thing here that reaches an agent. */}
      <textarea
        className={s.area}
        value={card.prompt}
        placeholder={t.scenarios.editor.promptHint}
        onChange={(event) => onEdit((one) => ({ ...one, prompt: event.target.value }))}
      />

      <div className={s.subLabel}>{t.scenarios.editor.slots}</div>
      {/*
        The button that adds one lives inside the block rather than under it. On its own it sat flush
        against the last slot - nothing at all between the row being filled in and the button that makes
        the next one - because a lone inline-flex button under a block gets no room of its own. In here
        it is a row of the form like the slots are, and it keeps the same 6px they keep from each other.
      */}
      <div className={s.form}>
        {card.slots.length === 0 ? <p className={s.empty}>{t.scenarios.editor.noSlots}</p> : null}
        {card.slots.map((slot) => (
          <div key={slot.id} className={s.formRow}>
            <input
              className={s.field}
              style={{ maxWidth: 120 }}
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
              onClick={() =>
                onEdit((one) => ({ ...one, slots: one.slots.filter((each) => each.id !== slot.id) }))
              }
            >
              ×
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

      <div className={s.subLabel}>{t.scenarios.editor.dod}</div>
      <textarea
        className={s.area}
        style={{ minHeight: 40 }}
        value={card.dod}
        placeholder={t.scenarios.editor.dodHint}
        onChange={(event) => onEdit((one) => ({ ...one, dod: event.target.value }))}
      />

      <div className={s.subLabel}>{t.scenarios.editor.after}</div>
      <textarea
        className={s.area}
        style={{ minHeight: 40 }}
        value={card.after}
        placeholder={t.scenarios.editor.afterHint}
        onChange={(event) => onEdit((one) => ({ ...one, after: event.target.value }))}
      />

      <div className={s.subLabel}>{t.scenarios.editor.overrides}</div>
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
