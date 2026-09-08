import type { Scenario, ScenarioCard, ScenarioCardSlot, ScenarioInput, ScenarioScope, ScenarioStage } from '../protocol'

/**
 * What a fresh scenario, stage, card or slot is made of.
 *
 * The identifiers are made here rather than by the IDE, for the reason the tab strip's are: the editor
 * has to draw a new card the instant the button is pressed, and a round trip before a row appears would
 * be felt. They only ever have to be unique inside one scenario, and the IDE writes down what it is
 * given.
 */

const freshId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export const blankCard = (): ScenarioCard => ({
  id: freshId(),
  title: '',
  prompt: '',
  slots: [],
  dod: '',
  after: '',
  model: '',
  effort: '',
  permissionMode: '',
})

export const blankSlot = (): ScenarioCardSlot => ({ id: freshId(), name: '', description: '' })

export const blankInput = (): ScenarioInput => ({
  id: freshId(),
  name: '',
  label: '',
  placeholder: '',
  required: false,
})

export const blankStage = (title: string): ScenarioStage => ({
  id: freshId(),
  title,
  repeat: 1,
  untilDone: false,
  // A stage with one card rather than nothing at all: an empty flow is a screen with a plus sign on it
  // and no hint of what the plus makes, while one stage and one card is the shape of the thing.
  cards: [blankCard()],
})

export const blankScenario = (name: string, stageTitle: string, scope: ScenarioScope): Scenario => ({
  version: 1,
  id: '',
  name,
  createdAt: 0,
  updatedAt: 0,
  inputs: [],
  head: { briefing: '', model: '', effort: '', permissionMode: 'default', onQuestion: 'head', retries: 2 },
  stages: [blankStage(stageTitle)],
  scope,
})
