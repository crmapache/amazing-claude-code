import { useState } from 'react'
import { useT } from '../../i18n'
import type { ModelInfo, Scenario, ScenarioStage } from '../../protocol'
import { effortOptions, modeOptions, modelOptions } from '../../catalog'
import { blankCard, blankInput, blankStage } from '../../scenarios/blank'
import { cardRuns, MAX_CARD_RETRIES, MAX_STAGE_REPEAT, passesOf, problemsOf } from '../../scenarios/rules'
import { Back } from './Back'
import { PickSheet } from './ScenarioPick'
import {
  repositoryOfOption,
  shelfLabel,
  shelfOptionId,
  shelfOptions,
  type RepositoryChoice,
  type ShelfChoice,
} from '../scenarios'
import m from '../mobile.module.css'

/**
 * The editor as a screen: the scenario folded into rows, stages that open, cards that drill in.
 *
 * A screen rather than a sheet because it is long, and folded rather than laid out flat because the desk's
 * two columns do not fit a thumb: an outline beside a pane needs a pane, and there is one column here.
 * What is left is the same map - what the round of work is, what it asks for, and the stages in order -
 * with one card at a time taking the whole screen (see ScenarioCardScreen).
 *
 * Nothing is written until Save. What comes back from a model arrives here unsaved for exactly that
 * reason: it is read before it is kept.
 */
export const ScenarioEditor = ({
  draft,
  fresh,
  tooBig,
  gone,
  shelf,
  repositories,
  models,
  customModels,
  onChange,
  onShelf,
  onOpenCard,
  onSave,
  onBack,
}: {
  /** null while the scenario is on its way from the machine - it is asked for by name (see scenarioFetch). */
  draft: Scenario | null
  /** Never saved: what a model wrote, or an empty form. */
  fresh: boolean
  /** It would not fit through the wire, so it was not sent at all rather than sent short (see RemoteFeed). */
  tooBig: boolean
  /** The machine answered and had none: it is on neither shelf any more. */
  gone: boolean
  /** Where it is kept, and the repositories it could be kept in instead - see shelfOptions. */
  shelf: ShelfChoice
  repositories: RepositoryChoice[]
  models: ModelInfo[] | null
  customModels: string[]
  onChange: (draft: Scenario) => void
  onShelf: (shelf: ShelfChoice) => void
  onOpenCard: (stageId: string, cardId: string) => void
  onSave: (draft: Scenario) => void
  onBack: () => void
}) => {
  const t = useT()
  /** Which of the four rows of the scenario itself is unfolded, and which stage. One at a time. */
  const [open, setOpen] = useState('')
  const [picking, setPicking] = useState<'shelf' | 'model' | 'effort' | 'mode' | 'retries' | ''>('')

  if (!draft) {
    return (
      <>
        <header className={m.threadHeader}>
          <div className={m.threadHeadRow}>
            <Back onClick={onBack} />
            <span className={m.threadTitles}>
              <span className={m.threadTitle}>{t.scenarios.editor.title}</span>
            </span>
          </div>
        </header>
        <div className={m.pageList}>
          {tooBig ? (
            <p className={m.noteBad}>{t.mobile.scenarios.editor.tooBig}</p>
          ) : gone ? (
            <p className={m.noteBad}>{t.scenarios.outcomes.scenarioGone}</p>
          ) : (
            <p className={m.empty}>{t.common.loading}</p>
          )}
        </div>
      </>
    )
  }

  const problems = problemsOf(draft)
  const fold = (key: string) => setOpen((current) => (current === key ? '' : key))

  const editStage = (id: string, change: (stage: ScenarioStage) => ScenarioStage) =>
    onChange({ ...draft, stages: draft.stages.map((stage) => (stage.id === id ? change(stage) : stage)) })

  return (
    <>
      <header className={m.threadHeader}>
        <div className={m.threadHeadRow}>
          <Back onClick={onBack} />
          <span className={m.threadTitles}>
            <span className={m.threadTitle}>{draft.name || t.scenarios.newName}</span>
            <span className={m.threadWhere}>
              {fresh
                ? t.scenarios.unsaved
                : [
                    shelfLabel(shelf, repositories, t.scenarios.editor.mine),
                    t.scenarios.stages(draft.stages.length),
                    t.scenarios.cards(cardRuns(draft)),
                  ].join(' · ')}
            </span>
          </span>
          <button type="button" className={m.headerWord} onClick={() => onSave(draft)}>
            {t.scenarios.editor.save}
          </button>
        </div>
      </header>

      <div className={m.pageList}>
        {problems.length > 0 ? (
          <div className={`${m.noteBad} ${m.tidyNote}`}>
            <span className={m.tidyCount}>{t.mobile.scenarios.editor.tidy(problems.length)}</span>
            {problems.slice(0, 4).map((problem, index) => (
              <span key={`${problem.kind}:${index}`} className={m.tidyLine}>
                {problemWords(t, draft, problem)}
              </span>
            ))}
          </div>
        ) : null}

        <p className={m.bandTitle}>{t.scenarios.editor.outline}</p>

        <div className={m.card}>
          <FoldRow
            name={t.scenarios.editor.name}
            value={draft.name}
            open={open === 'name'}
            onOpen={() => fold('name')}
          >
            <input
              className={m.input}
              value={draft.name}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
            />
          </FoldRow>

          {/* A list to pick from rather than chips in the row: a machine remembers twenty repositories. */}
          <PickRow
            name={t.scenarios.editor.shelf}
            value={shelfLabel(shelf, repositories, t.scenarios.editor.mine)}
            onOpen={() => setPicking('shelf')}
          />

          <FoldRow
            name={t.scenarios.editor.head}
            value={[draft.head.model || t.scenarios.editor.defaultModel, draft.head.effort].filter(Boolean).join(' · ')}
            open={open === 'head'}
            onOpen={() => fold('head')}
          >
            <textarea
              className={`${m.input} ${m.sheetArea}`}
              value={draft.head.briefing}
              placeholder={t.scenarios.editor.briefingHint}
              autoCapitalize="sentences"
              onChange={(event) => onChange({ ...draft, head: { ...draft.head, briefing: event.target.value } })}
            />

            <PickRow
              name={t.selectors.model}
              value={labelOf(modelChoices(t, models, customModels, t.scenarios.editor.defaultModel), draft.head.model)}
              onOpen={() => setPicking('model')}
            />
            <PickRow
              name={t.selectors.effort}
              value={labelOf([{ id: '', label: t.scenarios.editor.defaultEffort }, ...effortOptions(t)], draft.head.effort)}
              onOpen={() => setPicking('effort')}
            />
            <PickRow
              name={t.selectors.mode}
              value={labelOf(modeOptions(t), draft.head.permissionMode)}
              onOpen={() => setPicking('mode')}
            />
            <PickRow
              name={t.scenarios.editor.retries}
              value={
                draft.head.retries === 0
                  ? t.scenarios.editor.noRetries
                  : t.scenarios.editor.retriesCount(draft.head.retries)
              }
              onOpen={() => setPicking('retries')}
            />

            {/* Two answers rather than a list of them: a card asks something, and either the main thread
                deals with it or the run stands still until a person does. */}
            <div className={m.segmented}>
              {(['head', 'stop'] as const).map((how) => (
                <button
                  key={how}
                  type="button"
                  className={`${m.segment} ${draft.head.onQuestion === how ? m.segmentOn : ''}`}
                  onClick={() => onChange({ ...draft, head: { ...draft.head, onQuestion: how } })}
                >
                  {how === 'head' ? t.scenarios.editor.questionHead : t.scenarios.editor.questionStop}
                </button>
              ))}
            </div>
          </FoldRow>

          <FoldRow
            name={t.scenarios.editor.inputs}
            value={draft.inputs.map((input) => input.name).filter(Boolean).join(', ')}
            open={open === 'inputs'}
            onOpen={() => fold('inputs')}
          >
            {draft.inputs.map((input, index) => (
              <div key={input.id} className={m.formRow}>
                <input
                  className={m.input}
                  value={input.name}
                  placeholder={t.scenarios.editor.inputName}
                  autoCapitalize="off"
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
                  className={m.input}
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
                <button
                  type="button"
                  className={m.rowButtonDanger}
                  onClick={() => onChange({ ...draft, inputs: draft.inputs.filter((one) => one.id !== input.id) })}
                >
                  {t.scenarios.editor.remove}
                </button>
              </div>
            ))}
            <button
              type="button"
              className={m.wideButton}
              onClick={() => onChange({ ...draft, inputs: [...draft.inputs, blankInput()] })}
            >
              {t.scenarios.editor.addInput}
            </button>
          </FoldRow>
        </div>

        <p className={m.bandTitle}>{t.scenarios.editor.stages}</p>

        {draft.stages.map((stage, index) => {
          const on = open === stage.id
          const passes = passesOf(stage)

          return (
            <div key={stage.id} className={m.card}>
              <button type="button" className={m.stageFold} onClick={() => fold(stage.id)}>
                <span className={m.stageFoldNumber}>{index + 1}</span>
                <span className={m.stageFoldText}>
                  <span className={m.stageFoldTitle}>{stage.title || t.scenarios.editor.untitledStage}</span>
                  {passes > 1 ? (
                    <span className={m.stageFoldNote}>
                      {stage.untilDone
                        ? t.scenarios.editor.roundsUntilShort(passes)
                        : t.scenarios.editor.roundsShort(passes)}
                    </span>
                  ) : null}
                </span>
                <span className={m.stageFoldCount}>{t.scenarios.cards(stage.cards.length)}</span>
                <span className={m.taskRowChevron}>{on ? '⌄' : '›'}</span>
              </button>

              {on ? (
                <div className={m.stageBody}>
                  <input
                    className={m.input}
                    value={stage.title}
                    placeholder={t.scenarios.stage}
                    onChange={(event) => editStage(stage.id, (one) => ({ ...one, title: event.target.value }))}
                  />

                  <div className={m.chipWrap}>
                    {Array.from({ length: Math.min(MAX_STAGE_REPEAT, 5) }, (_, n) => n + 1).map((count) => (
                      <button
                        key={count}
                        type="button"
                        className={`${m.pickChip} ${stage.repeat === count ? m.pickChipOn : ''}`}
                        onClick={() => editStage(stage.id, (one) => ({ ...one, repeat: count }))}
                      >
                        {count === 1 ? t.scenarios.editor.once : t.scenarios.editor.times(count)}
                      </button>
                    ))}
                    {stage.repeat > 1 ? (
                      <button
                        type="button"
                        className={`${m.pickChip} ${stage.untilDone ? m.pickChipOn : ''}`}
                        onClick={() => editStage(stage.id, (one) => ({ ...one, untilDone: !one.untilDone }))}
                      >
                        {t.scenarios.editor.untilDone}
                      </button>
                    ) : null}
                  </div>

                  {stage.cards.length > 0 ? (
                    <div className={m.stageCards}>
                      {stage.cards.map((card) => (
                        <button
                          key={card.id}
                          type="button"
                          className={m.cardFold}
                          onClick={() => onOpenCard(stage.id, card.id)}
                        >
                          <span className={m.cardFoldName}>{card.title || t.scenarios.editor.untitledCard}</span>
                          <span className={m.taskRowChevron}>›</span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className={m.wideButton}
                    onClick={() => editStage(stage.id, (one) => ({ ...one, cards: [...one.cards, blankCard()] }))}
                  >
                    {t.scenarios.editor.addCard}
                  </button>

                  <button
                    type="button"
                    className={`${m.wideButton} ${m.wideDanger}`}
                    onClick={() =>
                      onChange({ ...draft, stages: draft.stages.filter((one) => one.id !== stage.id) })
                    }
                  >
                    {t.scenarios.editor.remove}
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}

        <button
          type="button"
          className={m.wideButton}
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

      {picking === 'shelf' ? (
        <PickSheet
          title={t.scenarios.editor.shelf}
          value={shelfOptionId(shelf, repositories)}
          options={shelfOptions(repositories, {
            shared: t.scenarios.editor.mine,
            opensProject: t.mobile.scenarios.opensProject,
            closed: t.mobile.sessions.projectClosed,
            noProject: t.scenarios.shelves.noProject,
          })}
          onPick={(id) => {
            const repo = repositoryOfOption(id, repositories)
            onShelf(repo ? { scope: 'project', agentId: repo.agentId, projectKey: repo.projectKey } : { scope: 'user' })
            setPicking('')
          }}
          onClose={() => setPicking('')}
        />
      ) : picking ? (
        <PickSheet
          title={
            picking === 'model'
              ? t.selectors.model
              : picking === 'effort'
                ? t.selectors.effort
                : picking === 'mode'
                  ? t.selectors.mode
                  : t.scenarios.editor.retries
          }
          value={
            picking === 'model'
              ? draft.head.model
              : picking === 'effort'
                ? draft.head.effort
                : picking === 'mode'
                  ? draft.head.permissionMode
                  : String(draft.head.retries)
          }
          options={
            picking === 'model'
              ? modelChoices(t, models, customModels, t.scenarios.editor.defaultModel)
              : picking === 'effort'
                ? [{ id: '', label: t.scenarios.editor.defaultEffort }, ...effortOptions(t)]
                : picking === 'mode'
                  ? modeOptions(t)
                  : Array.from({ length: MAX_CARD_RETRIES + 1 }, (_, n) => ({
                      id: String(n),
                      label: n === 0 ? t.scenarios.editor.noRetries : t.scenarios.editor.retriesCount(n),
                    }))
          }
          onPick={(id) => {
            if (picking === 'model') onChange({ ...draft, head: { ...draft.head, model: id } })
            else if (picking === 'effort') onChange({ ...draft, head: { ...draft.head, effort: id } })
            else if (picking === 'mode') onChange({ ...draft, head: { ...draft.head, permissionMode: id } })
            else onChange({ ...draft, head: { ...draft.head, retries: Number(id) } })
            setPicking('')
          }}
          onClose={() => setPicking('')}
        />
      ) : null}
    </>
  )
}

/** A row of the outline: what it is, what it says right now, and the whole of it when it is opened. */
const FoldRow = ({
  name,
  value,
  open,
  onOpen,
  children,
}: {
  name: string
  value: string
  open: boolean
  onOpen: () => void
  children: React.ReactNode
}) => (
  <>
    <button type="button" className={m.foldRow} onClick={onOpen}>
      <span className={m.foldName}>{name}</span>
      <span className={m.foldValue}>{value}</span>
      <span className={m.taskRowChevron}>{open ? '⌄' : '›'}</span>
    </button>
    {open ? <div className={m.foldBody}>{children}</div> : null}
  </>
)

/** A row that opens a sheet of choices - the phone's answer to the panel's menus. */
export const PickRow = ({
  name,
  value,
  onOpen,
}: {
  name: string
  value: string
  onOpen: () => void
}) => (
  <button type="button" className={m.foldRow} onClick={onOpen}>
    <span className={m.foldName}>{name}</span>
    <span className={m.foldValue}>{value}</span>
    <span className={m.taskRowChevron}>›</span>
  </button>
)

/** The models this account can run, with "whatever a new tab would start with" in front - as at the desk. */
export const modelChoices = (
  t: ReturnType<typeof useT>,
  models: ModelInfo[] | null,
  customModels: string[],
  inherit: string,
): { id: string; label: string }[] => [
  { id: '', label: inherit },
  ...modelOptions(t, models, customModels).map((option) => ({ id: option.id, label: option.label })),
]

export const labelOf = (options: { id: string; label: string }[], value: string): string =>
  options.find((option) => option.id === value)?.label ?? value

/** A problem in words, naming the card it is in - a list of "unknownInput" would say nothing. */
const problemWords = (
  t: ReturnType<typeof useT>,
  draft: Scenario,
  problem: ReturnType<typeof problemsOf>[number],
): string => {
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
