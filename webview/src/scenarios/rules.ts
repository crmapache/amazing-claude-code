import type { Scenario, ScenarioCard, ScenarioCardSlot, ScenarioStage } from '../protocol'

/**
 * What a scenario means, as arithmetic rather than as opinion: which names its text mentions, what gets
 * written where, and what is wrong with it.
 *
 * Mirrored in the IDE's scenario/ScenarioRules.kt, and that is a deliberate second copy rather than an
 * oversight - the same case as core/frame.ts and feed/searchText.ts. The editor has to say what is wrong
 * while somebody types, which is a question asked on every keystroke and cannot be a round trip to the
 * IDE; and the run has to be refused before a process is raised, which cannot be left to a screen that a
 * stale page might not have run. Tests on both sides hold the same examples.
 */

/** How many passes a stage may be given. Ten because the picker has to end somewhere. */
export const MAX_STAGE_REPEAT = 10

/** How many extra goes the head may give one card before the card is called failed. */
export const MAX_CARD_RETRIES = 5

const SCENARIO_RE = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g
const SLOT_RE = /\[\[\s*([a-zA-Z0-9_-]+)\s*\]\]/g
const NAME_RE = /^[a-zA-Z0-9_-]+$/

const names = (text: string, re: RegExp): string[] => {
  const found: string[] = []
  for (const match of text.matchAll(re)) found.push(match[1])
  return [...new Set(found)]
}

/** The `{{name}}` a piece of text mentions, in the order it mentions them, without repeats. */
export const mentionedInputs = (text: string): string[] => names(text, SCENARIO_RE)

/** The `[[name]]` a piece of text mentions - the slots the head has to fill before it may start. */
export const mentionedSlots = (text: string): string[] => names(text, SLOT_RE)

/**
 * A card's text with the run's answers written into it.
 *
 * An unknown name is left standing rather than emptied. A prompt that says `{{ticket}}` out loud is a
 * mistake somebody can see; one that quietly lost the ticket number is a turn that goes off and does the
 * wrong thing to the wrong branch.
 */
export const fillInputs = (text: string, values: Record<string, string>): string =>
  text.replace(SCENARIO_RE, (whole, name: string) => values[name] ?? whole)

/** The same for the slots the head filled in. */
export const fillSlots = (text: string, values: Record<string, string>): string =>
  text.replace(SLOT_RE, (whole, name: string) => values[name] ?? whole)

/**
 * The slots a card really has: the ones it declared, plus any `[[name]]` in the prompt nobody declared.
 *
 * The second half matters more than it looks. A name left in a prompt with no declaration behind it is a
 * name nobody will ever be asked to fill, and the card's session would be handed the literal text
 * `[[findings]]` and asked to make sense of it. Listing it here turns a silent wrong answer into a slot
 * the head can see and fill.
 */
export const declaredSlots = (card: ScenarioCard): ScenarioCardSlot[] => {
  const declared = card.slots.filter((slot) => slot.name.trim().length > 0)
  const known = new Set(declared.map((slot) => slot.name))
  const stray = mentionedSlots(card.prompt)
    .filter((name) => !known.has(name))
    .map((name) => ({ id: name, name, description: '' }))
  return [...declared, ...stray]
}

/** How many passes a stage is given - clamped, because the file on disk is not to be trusted. */
export const passesOf = (stage: ScenarioStage): number =>
  Math.min(MAX_STAGE_REPEAT, Math.max(1, Math.floor(stage.repeat || 1)))

/** How many cards a whole run of the scenario will start, every pass counted. */
export const cardRuns = (scenario: Scenario): number =>
  scenario.stages.reduce((sum, stage) => sum + stage.cards.length * passesOf(stage), 0)

/**
 * What is wrong with a scenario, as names the interface has words for.
 *
 * Checked rather than trusted because a scenario is edited in a form and run at midnight: the gap between
 * the two is where a missing name in a prompt turns into a card asking an agent to read the file at
 * `[[findings]]`.
 */
export type ProblemKind =
  | 'noStages'
  | 'emptyStage'
  | 'noPrompt'
  | 'unknownInput'
  | 'undeclaredSlot'
  | 'unusedSlot'
  | 'duplicateInput'
  | 'duplicateSlot'
  | 'badInputName'
  | 'badSlotName'

export interface Problem {
  kind: ProblemKind
  stageId?: string
  cardId?: string
  name?: string
}

export const problemsOf = (scenario: Scenario): Problem[] => {
  const problems: Problem[] = []
  const inputNames = new Set<string>()

  for (const input of scenario.inputs) {
    if (!NAME_RE.test(input.name)) problems.push({ kind: 'badInputName', name: input.name })
    else if (inputNames.has(input.name)) problems.push({ kind: 'duplicateInput', name: input.name })
    inputNames.add(input.name)
  }

  if (scenario.stages.length === 0) problems.push({ kind: 'noStages' })

  for (const stage of scenario.stages) {
    if (stage.cards.length === 0) problems.push({ kind: 'emptyStage', stageId: stage.id })

    for (const card of stage.cards) {
      if (card.prompt.trim().length === 0) problems.push({ kind: 'noPrompt', cardId: card.id })

      const slotNames = new Set<string>()
      for (const slot of card.slots) {
        if (!NAME_RE.test(slot.name)) problems.push({ kind: 'badSlotName', cardId: card.id, name: slot.name })
        else if (slotNames.has(slot.name)) problems.push({ kind: 'duplicateSlot', cardId: card.id, name: slot.name })
        slotNames.add(slot.name)
      }

      // The prompt is the only place either kind is read from, because the prompt is the only thing that
      // reaches an agent.
      for (const name of mentionedInputs(card.prompt)) {
        if (!inputNames.has(name)) problems.push({ kind: 'unknownInput', cardId: card.id, name })
      }
      const used = new Set(mentionedSlots(card.prompt))
      for (const name of used) {
        if (!slotNames.has(name)) problems.push({ kind: 'undeclaredSlot', cardId: card.id, name })
      }
      for (const slot of card.slots) {
        if (slot.name.length > 0 && !used.has(slot.name)) {
          problems.push({ kind: 'unusedSlot', cardId: card.id, name: slot.name })
        }
      }
    }
  }

  return problems
}

/**
 * Which problems stop a run and which are only worth saying out loud.
 *
 * A slot declared and never used is untidy; a slot used and never declared is a card whose prompt reaches
 * the agent with `[[findings]]` still in it, because nobody was ever asked to fill it.
 */
export const blocking = (problem: Problem): boolean => problem.kind !== 'unusedSlot'

/** Whether the scenario may be started at all. A warning is not a refusal. */
export const runnable = (scenario: Scenario): boolean => !problemsOf(scenario).some(blocking)

/** The inputs the person left empty that the scenario said it needed. */
export const missingInputs = (scenario: Scenario, values: Record<string, string>): string[] =>
  scenario.inputs
    .filter((input) => input.required && input.name.trim().length > 0 && (values[input.name] ?? '').trim().length === 0)
    .map((input) => input.name)

/**
 * What one go at one card is called.
 *
 * The card's own identifier is not enough: a stage set to go round three times contributes three of
 * these, and they are three different things that happened.
 */
export const keyOf = (stageId: string, cardId: string, pass: number): string => `${stageId}:${cardId}:${pass}`

export interface Planned {
  key: string
  stageId: string
  cardId: string
  pass: number
  title: string
}

/**
 * The whole walk written out before it starts: every card of every pass, in the order they will run.
 *
 * Written down rather than worked out as it goes, because it is the picture: the timeline shows six cards
 * for two cards looped three times, and it shows them before any of them has happened. A stage that stops
 * as soon as the head says so simply leaves the tail of its passes unrun - the plan is what was intended,
 * not a promise.
 */
export const plan = (scenario: Scenario): Planned[] => {
  const planned: Planned[] = []
  for (const stage of scenario.stages) {
    for (let pass = 1; pass <= passesOf(stage); pass += 1) {
      for (const card of stage.cards) {
        planned.push({
          key: keyOf(stage.id, card.id, pass),
          stageId: stage.id,
          cardId: card.id,
          pass,
          title: card.title || 'Untitled',
        })
      }
    }
  }
  return planned
}
