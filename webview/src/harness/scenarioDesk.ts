import type {
  AgentEvent,
  Scenario,
  ScenarioRun,
  ScenarioRunStep,
  ScenarioRunSummary,
  ScenarioSchedule,
  WebviewMessage,
} from '../protocol'
import { plan } from '../scenarios/rules'

/**
 * The IDE's scenario desk, played by the harness.
 *
 * The screens are the real ones - the hub, the editor, the timeline - and everything they need comes from
 * this side in the IDE: the two shelves, the runs, the state of a live one as it moves, and the log of one
 * step read off the disk. Here there is no disk and no agent, so this invents them, and it invents them
 * moving: a run started from the hub walks its own timeline over half a minute, which is the only way to
 * see a step go from planned to running to judged without an IDE and a subscription.
 */

let shelves: Scenario[] = []
let runs: ScenarioRunSummary[] = []
let records: Record<string, ScenarioRun> = {}
/**
 * The runs going right now, and a walker for each of them.
 *
 * A map rather than one of each, because a scenario may be started as many times as somebody wants -
 * which is the thing this harness has to be able to show. One shared timer meant the second run silently
 * stopped the first one's timeline, and on the screen that reads as the panel being broken.
 */
let live: string[] = []
const walkers: Record<string, ReturnType<typeof setInterval>> = {}
/** The description a model is "writing" right now, by its request's number - see scenarioDraft. */
/** The hours the scenarios are set to start at, as the IDE would keep them (see ScheduleStore). */
let hours: ScenarioSchedule[] = []
let drafting = ''
/** Every third one comes back refused, so the failure is seen as often as the answer. */
let drafted = 0
/**
 * Which runs have already stopped to ask something, so each one does it once.
 *
 * The walk used to go straight through, which meant the one state the whole screen is arranged around -
 * a card standing on a question, with the strip at the top of the hub and the block above the timeline -
 * could not be seen without an IDE and a scenario written to stop.
 */
const asked: Record<string, boolean> = {}
/** Every third step opened answers "no record", so that state is seen rather than merely written. */
let opened = 0
/** Every third run picked up again is refused, so the refusal is seen as often as the pick-up. */
let continued = 0

const send = (message: unknown): void => window.__accReceive?.(message as never)

const card = (id: string, title: string, prompt: string, over: Partial<Scenario['stages'][number]['cards'][number]> = {}) => ({
  id,
  title,
  prompt,
  slots: [],
  dod: '',
  after: '',
  model: '',
  effort: '',
  permissionMode: '',
  ...over,
})

/**
 * What the harness pretends a model wrote: a real scenario built around the words that were typed.
 *
 * Made of the description rather than a fixed sample, so the screen shows the thing being answered - the
 * name in the editor is what was asked for, and the first card says it back. What matters here is the
 * shape: a fresh scenario with no identifier, which is what the editor opens as unsaved.
 */
const written = (description: string): Scenario => {
  const first = description.split(/[.\n]/)[0]?.trim() || 'A round of work'
  const name = first.length > 40 ? `${first.slice(0, 40)}…` : first

  return {
    version: 1,
    id: '',
    name,
    createdAt: 0,
    updatedAt: 0,
    inputs: [{ id: 'd-branch', name: 'branch', label: 'Branch', placeholder: '', required: true }],
    head: {
      briefing: description.trim(),
      model: '',
      effort: '',
      permissionMode: 'acceptEdits',
      onQuestion: 'head',
      retries: 2,
    },
    stages: [
      {
        id: 'd-look',
        title: 'Look at what changed',
        repeat: 1,
        untilDone: false,
        cards: [
          card(
            'd-diff',
            'Collect the diff',
            `Read the diff of {{branch}} against main and write down what it touches. ${first}`,
            { dod: 'Every changed file is named with one line on what happened to it.' },
          ),
        ],
      },
      {
        id: 'd-work',
        title: 'Do it and check it',
        repeat: 3,
        untilDone: true,
        cards: [
          card('d-do', 'Do the work', 'Do what the briefing asks on the files named in [[files]]. Leave everything else alone.', {
            slots: [{ id: 'd-s1', name: 'files', description: 'The files the card above named' }],
            dod: 'The work is done and the project still builds.',
          }),
          card('d-check', 'Check it', 'Run the checks this project has and report what failed, if anything.', {
            dod: 'Every check named in the project has been run.',
          }),
        ],
      },
    ],
    scope: 'project',
  }
}

const REVIEW: Scenario = {
  version: 1,
  id: 'review-and-fix',
  name: 'Review and fix',
  createdAt: Date.now() - 9 * 24 * 60 * 60 * 1000,
  updatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
  inputs: [
    { id: 'i1', name: 'branch', label: 'Branch', placeholder: 'mzolotoi/checkout-totals', required: true },
  ],
  head: {
    briefing:
      'We review the branch before it goes anywhere near main. A finding is worth fixing only if it can be ' +
      'made to happen; anything else is a note in the report.',
    model: '',
    effort: '',
    permissionMode: 'acceptEdits',
    onQuestion: 'head',
    retries: 2,
  },
  stages: [
    {
      id: 's-look',
      title: 'Read the branch',
      repeat: 1,
      untilDone: false,
      cards: [
        card('c-diff', 'Collect the diff', 'Read the diff of {{branch}} against main and write down what it touches.'),
      ],
    },
    {
      id: 's-round',
      title: 'Review, then fix',
      repeat: 3,
      untilDone: true,
      cards: [
        card('c-review', 'Review it', 'Review the changes on {{branch}} and write every finding to [[findings]].', {
          slots: [{ id: 'sl1', name: 'findings', description: 'Where to write the findings - a path in the run folder' }],
          dod: 'A file of findings exists, and every finding names a file and a line.',
        }),
        card('c-fix', 'Fix what it found', 'Fix the findings written in [[findings]]. Leave the ones you disagree with.', {
          slots: [{ id: 'sl2', name: 'findings', description: 'The same file the reviewer wrote' }],
          dod: 'Every finding is either fixed or answered in words.',
          model: '',
        }),
      ],
    },
  ],
  scope: 'project',
}

const RELEASE: Scenario = {
  version: 1,
  id: 'nightly-tidy',
  name: 'Nightly tidy',
  createdAt: Date.now() - 40 * 24 * 60 * 60 * 1000,
  updatedAt: Date.now() - 6 * 60 * 60 * 1000,
  inputs: [],
  head: {
    briefing: 'Housekeeping I would rather not do by hand. Nothing here may touch anything outside the repository.',
    model: '',
    effort: 'low',
    permissionMode: 'acceptEdits',
    onQuestion: 'stop',
    retries: 1,
  },
  stages: [
    {
      id: 's-tidy',
      title: 'Tidy',
      repeat: 1,
      untilDone: false,
      cards: [
        card('c-dead', 'Remove dead code', 'Find code nothing references any more and take it out.'),
        card('c-tests', 'Run the tests', 'Run the whole test suite and report what fails.'),
      ],
    },
  ],
  scope: 'user',
}

const reset = (): void => {
  shelves = [structuredClone(REVIEW), structuredClone(RELEASE)]
  runs = [
    {
      id: 'run-yesterday',
      scenarioId: 'review-and-fix',
      scenarioName: 'Review and fix',
      scope: 'project',
      startedAt: Date.now() - 26 * 60 * 60 * 1000,
      finishedAt: Date.now() - 25 * 60 * 60 * 1000,
      state: 'done',
      total: 7,
      done: 7,
      failure: '',
      cost: 4.18,
      inputs: { branch: 'mzolotoi/checkout-totals' },
    },
    {
      id: 'run-monday',
      scenarioId: 'nightly-tidy',
      scenarioName: 'Nightly tidy',
      scope: 'user',
      startedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
      finishedAt: Date.now() - 3 * 24 * 60 * 60 * 1000 + 22 * 60 * 1000,
      state: 'failed',
      total: 2,
      done: 1,
      failure: 'undone',
      cost: 0.94,
      inputs: {},
    },
    // The nights that pile up behind those two. A scenario on an hour leaves one every morning, so by the
    // second week the list is longer than the screen - which is what the row at its foot is for (see
    // RUNS_PAGE in ScenariosTab). These have no record behind them on purpose: opening one answers "the
    // run is gone", and that is a state worth seeing here too.
    ...Array.from({ length: 9 }, (_, index) => {
      const nights = index + 4
      const started = Date.now() - nights * 24 * 60 * 60 * 1000
      const stopped = index % 4 === 2

      return {
        id: `run-night-${nights}`,
        scenarioId: 'nightly-tidy',
        scenarioName: 'Nightly tidy',
        scope: 'user' as const,
        startedAt: started,
        finishedAt: started + (14 + index) * 60 * 1000,
        state: stopped ? ('stopped' as const) : ('done' as const),
        total: 2,
        done: stopped ? 1 : 2,
        failure: '',
        cost: 0.6 + index * 0.07,
        inputs: {},
      }
    }),
  ]
  records = { 'run-yesterday': finishedRun(), 'run-monday': brokenRun() }
}

const stepsOf = (scenario: Scenario): ScenarioRunStep[] =>
  plan(scenario).map((planned) => ({
    key: planned.key,
    cardId: planned.cardId,
    stageId: planned.stageId,
    pass: planned.pass,
    title: planned.title,
    state: 'waiting',
    conversationId: '',
    startedAt: 0,
    finishedAt: 0,
    slots: {},
    prompt: '',
    said: '',
    summary: '',
    nudges: [],
    verdict: '',
    verdictReason: '',
    handoff: '',
    failure: '',
    error: '',
    cost: 0,
    tokens: 0,
  }))

const blankRun = (scenario: Scenario, id: string, inputs: Record<string, string>): ScenarioRun => ({
  id,
  scenarioId: scenario.id,
  scenarioName: scenario.name,
  scope: scenario.scope,
  snapshot: scenario,
  startedAt: Date.now(),
  finishedAt: 0,
  state: 'running',
  runFrom: '',
  inputs,
  total: plan(scenario).length,
  headConversationId: `head-${id}`,
  steps: stepsOf(scenario),
  notes: [],
  question: null,
  failure: '',
  error: '',
  cost: 0,
  tokens: 0,
})

/** A run of last night, whole: three passes of the loop, the last of them never needed. */
const finishedRun = (): ScenarioRun => {
  const started = Date.now() - 26 * 60 * 60 * 1000
  const run = blankRun(structuredClone(REVIEW), 'run-yesterday', { branch: 'mzolotoi/checkout-totals' })
  const findings = '/tmp/acc/run-yesterday/findings.md'

  run.startedAt = started
  run.finishedAt = started + 61 * 60 * 1000
  run.state = 'done'
  run.cost = 4.18
  run.tokens = 1_284_000
  run.steps = run.steps.map((step, index) => {
    const at = started + index * 8 * 60 * 1000
    if (step.pass === 3) return { ...step, state: 'skipped', finishedAt: run.finishedAt }

    return {
      ...step,
      state: 'done',
      verdict: 'done',
      conversationId: `conv-${step.key}`,
      startedAt: at,
      finishedAt: at + 6 * 60 * 1000,
      cost: 0.6,
      tokens: 84_000 + index * 12_000,
      slots: step.cardId === 'c-diff' ? ({} as Record<string, string>) : { findings },
      prompt:
        step.cardId === 'c-diff'
          ? 'Read the diff of mzolotoi/checkout-totals against main and write down what it touches.'
          : step.cardId === 'c-review'
            ? `Review the changes on mzolotoi/checkout-totals and write every finding to ${findings}.`
            : `Fix the findings written in ${findings}. Leave the ones you disagree with.`,
      summary:
        step.cardId === 'c-review'
          ? 'Four findings, two of them in the totals: a discount larger than the subtotal, and rounding done twice.'
          : 'Both totals findings are fixed and the tests pass.',
      verdictReason:
        step.cardId === 'c-review' ? 'The findings name a file and a line each.' : 'Everything it was handed is answered.',
      handoff: step.cardId === 'c-review' ? findings : '',
    }
  })
  run.notes = [
    { at: started + 60_000, stepKey: '', text: 'Read the briefing. This is a review of one branch, and nothing is to be pushed.' },
    { at: started + 9 * 60 * 1000, stepKey: 's-round:c-review:1', text: `Pointing the reviewer at ${findings}, which is empty so far.` },
    {
      at: started + 16 * 60 * 1000,
      stepKey: 's-round:c-review:1',
      text: 'Four findings, all of them with a way to make them happen. Worth a pass of the fixer.',
    },
    {
      at: started + 44 * 60 * 1000,
      stepKey: 's-round:c-fix:2',
      text: 'The second pass found nothing new, so a third would only cost money. Ending the loop here.',
    },
  ]
  return run
}

/** And one that stopped on a card the head gave up on - the state the timeline has to say plainly. */
const brokenRun = (): ScenarioRun => {
  const started = Date.now() - 3 * 24 * 60 * 60 * 1000
  const run = blankRun(structuredClone(RELEASE), 'run-monday', {})

  run.startedAt = started
  run.finishedAt = started + 22 * 60 * 1000
  run.state = 'failed'
  run.failure = 'undone'
  run.error = 'Run the tests: the suite does not finish on this machine'
  run.cost = 0.94
  run.tokens = 302_400
  run.steps = [
    {
      ...run.steps[0],
      state: 'done',
      verdict: 'done',
      conversationId: 'conv-dead',
      startedAt: started,
      finishedAt: started + 9 * 60 * 1000,
      cost: 0.41,
      tokens: 131_000,
      prompt: 'Find code nothing references any more and take it out.',
      summary: 'Removed two exports nothing imported and the CSS class that went with them.',
      verdictReason: 'Nothing it removed is referenced anywhere.',
    },
    {
      ...run.steps[1],
      state: 'failed',
      verdict: 'undone',
      failure: 'undone',
      conversationId: 'conv-tests',
      startedAt: started + 9 * 60 * 1000,
      finishedAt: started + 22 * 60 * 1000,
      cost: 0.53,
      tokens: 171_400,
      nudges: ['The suite did not finish - say which test hangs.'],
      prompt: 'Run the whole test suite and report what fails.',
      summary: 'The suite hangs on the relay tests and I could not tell which one.',
      verdictReason: 'It was asked twice which test hangs and could not say.',
      error: 'It was asked twice which test hangs and could not say.',
    },
  ]
  run.notes = [
    { at: started + 30_000, stepKey: '', text: 'Housekeeping only. Nothing here is to leave the repository.' },
    {
      at: started + 21 * 60 * 1000,
      stepKey: 's-tidy:c-tests:1',
      text: 'Two goes and still no name for the test that hangs. Giving up rather than spending the night on it.',
    },
  ]
  return run
}

const sendList = (): void => {
  send({ type: 'scenarios', scenarios: shelves, runs, schedules: hours, canShare: true })
  sendLive()
}

/**
 * What is going, as summaries - the message the hub's live band and the phone's screen are drawn from.
 *
 * The records are looked up BEFORE anything is built from them. An identifier left on the live list with
 * its record already gone is exactly the kind of thing a stand-in for the IDE gets wrong, and building
 * first threw inside the message handler - after which the screen received nothing at all, ever again.
 */
const sendLive = (): void => {
  const going = live.map((id) => records[id]).filter((run): run is ScenarioRun => run !== undefined)

  send({ type: 'scenarioLive', runs: going.map(summarise) })
}

/**
 * What the IDE's own `summarise` builds, including where the run has got to.
 *
 * The half under `inputs` is what a card of a going run draws - the stage it is in, the card it is on,
 * what it has burnt and what it has stopped to ask - so a harness that left it out would show the one
 * band of the hub that this redesign is about as a row of blanks.
 */
const summarise = (run: ScenarioRun): ScenarioRunSummary => {
  const here =
    run.steps.find((step) => step.state === 'running' || step.state === 'asking' || step.state === 'judging') ??
    [...run.steps].reverse().find((step) => step.startedAt > 0)
  const stage = run.snapshot.stages.findIndex((one) => one.id === here?.stageId)
  const passes = stage >= 0 ? run.snapshot.stages[stage].repeat : 0

  return {
    id: run.id,
    scenarioId: run.scenarioId,
    scenarioName: run.scenarioName,
    scope: run.scope,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    state: run.state,
    total: run.total,
    done: run.steps.filter((step) => step.state === 'done').length,
    failure: run.failure,
    cost: run.cost,
    inputs: run.inputs,
    tokens: run.tokens,
    stage: stage >= 0 ? stage + 1 : 0,
    stages: run.snapshot.stages.length,
    at: here?.title ?? '',
    pass: passes > 1 ? (here?.pass ?? 0) : 0,
    passes: passes > 1 ? passes : 0,
    nudges: here?.nudges.length ?? 0,
    asking: run.question ? run.question.title || run.question.tool : '',
  }
}

const keep = (run: ScenarioRun): void => {
  records[run.id] = run
  runs = runs.map((one) => (one.id === run.id ? summarise(run) : one))
  send({ type: 'scenarioRun', run })
  // The light frame goes with every beat here, where the IDE sends it about once a second: the harness
  // walks a run in seconds rather than hours, and a live band a second behind would never catch up.
  if (live.includes(run.id)) sendLive()
}

/**
 * A run walking its own timeline, a step every couple of seconds.
 *
 * Fast on purpose: what is being looked at is the shape of the screen while things move - a step going
 * from planned to running to judged, the head wedging a line in between, the bar filling - and a real
 * run takes an hour to show it once.
 */
/** A walker that has nothing left to walk. Its own, so that one run ending leaves the others going. */
const stopWalking = (id: string): void => {
  const walker = walkers[id]
  if (!walker) return
  clearInterval(walker)
  delete walkers[id]
}

const walk = (id: string, from = 0, startIn: 'run' | 'judge' = 'run'): void => {
  let at = from
  let phase: 'run' | 'judge' = startIn

  walkers[id] = setInterval(() => {
    const run = records[id]
    if (!run || run.state === 'stopped' || run.state === 'done' || run.state === 'failed') {
      stopWalking(id)
      return
    }
    // A paused run is genuinely still: nothing moves and nothing is spent until it is resumed - and one
    // standing on a question is stiller still, because the card's turn is open and waiting for a person.
    if (run.state === 'paused' || run.state === 'blocked') return

    const step = run.steps[at]
    if (!step) {
      live = live.filter((one) => one !== id)
      keep({ ...run, state: 'done', finishedAt: Date.now() })
      stopWalking(id)
      sendList()
      return
    }

    /*
     * The second card of every run stops to ask, once.
     *
     * Not a refusal and not an error - the ordinary state a scenario set to wait for a person spends its
     * night in (see HeadSettings.onQuestion), and the one the hub, the run and the phone are all arranged
     * around. Answering it here is answering it for real: the walk carries on from where it stood.
     */
    if (phase === 'run' && at === 1 && !asked[id]) {
      asked[id] = true
      keep({
        ...run,
        state: 'blocked',
        question: {
          stepKey: step.key,
          title: 'Write the decision about the rounding into the report, or keep it in the pull request only?',
          tool: 'AskUserQuestion',
          detail: '',
          options: ['Into the report', 'Pull request only'],
          askedAt: Date.now(),
        },
        steps: run.steps.map((one) =>
          one.key === step.key
            ? { ...one, state: 'asking', startedAt: Date.now(), conversationId: `conv-${one.key}` }
            : one,
        ),
      })
      return
    }

    if (phase === 'run') {
      phase = 'judge'
      keep({
        ...run,
        cost: run.cost + 0.31,
        tokens: run.tokens + 46_200,
        steps: run.steps.map((one) =>
          one.key === step.key
            ? {
                ...one,
                state: 'running',
                startedAt: Date.now(),
                conversationId: `conv-${one.key}`,
                slots: one.cardId === 'c-diff' ? ({} as Record<string, string>) : { findings: '/tmp/acc/findings.md' },
                prompt: `${one.title}: what the card's own session was told, with the inputs written in.`,
                said: 'Reading the files it was pointed at…',
              }
            : one,
        ),
        notes: [...run.notes, { at: Date.now(), stepKey: step.key, text: `Handing over ${step.title}.` }],
      })
      return
    }

    phase = 'run'
    at += 1
    keep({
      ...run,
      steps: run.steps.map((one) =>
        one.key === step.key
          ? {
              ...one,
              state: 'done',
              verdict: 'done',
              said: '',
              summary: 'Did what it was asked and said so plainly.',
              verdictReason: 'Meets its definition of done.',
              finishedAt: Date.now(),
              cost: 0.31,
              tokens: 46_200,
            }
          : one,
      ),
      notes: [...run.notes, { at: Date.now(), stepKey: step.key, text: `${step.title} is done - moving on.` }],
    })
  }, 1600)
}

/**
 * One step's log, as the events of its own conversation - the panel builds the feed out of them.
 *
 * The "you" side of it is written in markdown, because that is how it comes in life: nobody types into a
 * scenario's conversation, and the longest thing on that side is a card's own report, handed on to the
 * head as the model wrote it. It is drawn as typed all the same, like any message in a chat.
 */
const logEvents = (title: string): AgentEvent[] => {
  const id = `tool-${Math.random().toString(36).slice(2, 8)}`

  return [
    {
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              `${title}: what this card's session was told.`,
              '',
              '## What is already done',
              '',
              '1. **The totals** are covered by tests, `pnpm test` is green.',
              '2. **The discount** still rounds twice - left alone on purpose.',
              '',
              'Report back in the same shape, and name the files you touched.',
            ].join('\n'),
          },
        ],
      },
    },
    {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id, name: 'Read', input: { file_path: 'src/checkout/totals.ts' } }],
      },
    },
    {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: id, content: 'export const totals = (lines: Line[]) => {' }],
      },
    },
    {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Both findings in the totals are real. I have fixed the negative total and left the rounding alone - it is a display question and the card did not ask for it.',
          },
        ],
      },
    },
    { type: 'result', subtype: 'success', result: 'Done.', total_cost_usd: 0.31, num_turns: 2 },
  ] as AgentEvent[]
}

/** Everything the hub and a run tab may ask for. Answers nothing else. */
export const answerScenarios = (message: WebviewMessage): void => {
  if (shelves.length === 0) reset()

  if (message.type === 'scenarios') return void setTimeout(sendList, 150)

  if (message.type === 'scenarioSave') {
    const saved: Scenario = {
      ...message.scenario,
      id: message.scenario.id || `scenario-${Date.now().toString(36)}`,
      scope: message.scope,
      updatedAt: Date.now(),
      createdAt: message.scenario.createdAt || Date.now(),
    }
    shelves = shelves.some((one) => one.id === saved.id)
      ? shelves.map((one) => (one.id === saved.id ? saved : one))
      : [...shelves, saved]
    send({ type: 'scenarioSaved', scenario: saved })
    return sendList()
  }

  /*
   * A model writing a scenario out of a sentence, played out: three seconds of it, then a scenario built
   * around the words that were typed - and every third one refuses, so the strip under the field is seen
   * as often as the answer is. Cancelled requests answer nobody, exactly as in the IDE.
   */
  if (message.type === 'scenarioDraft') {
    drafting = message.id
    drafted += 1
    const failing = drafted % 3 === 0
    const said = message.description.trim()

    setTimeout(() => {
      if (drafting !== message.id) return
      drafting = ''
      send(
        failing
          ? { type: 'scenarioDrafted', id: message.id, error: 'Claude Code is not signed in on this machine.' }
          : { type: 'scenarioDrafted', id: message.id, scenario: written(said) },
      )
    }, 3000)
    return
  }

  if (message.type === 'scenarioDraftCancel') {
    if (drafting === message.id) drafting = ''
    return
  }

  /*
   * An hour set on a scenario. The clock itself is not played out - half a minute of waiting for a
   * scheduled run is not a thing anybody reviews an interface with - but everything the row draws from it
   * is: the rhythm, the next time, and a missed hour, which the third schedule set here always has.
   */
  if (message.type === 'scenarioSchedule') {
    const now = Date.now()
    // Tomorrow at that hour: near enough for a row that says "next Tue 09:00", and it never lands in the
    // past, which is what the real clock guarantees by working the answer out properly.
    const next = new Date(now)
    next.setHours(Math.floor(message.at / 60), message.at % 60, 0, 0)
    if (next.getTime() <= now) next.setDate(next.getDate() + 1)

    // Replaced when it names one, added when it does not - a scenario carries as many as somebody wants,
    // and an identifier of this side's making, because a page does not name what a machine stores.
    const wanted: ScenarioSchedule = {
      id: message.scheduleId || `hour-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      scenarioId: message.scenarioId,
      scope: message.scope,
      at: message.at,
      repeat: message.repeat,
      weekday: message.weekday,
      inputs: message.inputs,
      nextAt: next.getTime(),
      lastAt: 0,
      // Every third one has a night behind it that nobody was here for, so the row's missed line is
      // seen as often as the ordinary one.
      missedAt: hours.length % 3 === 2 ? now - 14 * 60 * 60 * 1000 : 0,
    }

    hours = hours.some((one) => one.id === wanted.id)
      ? hours.map((one) => (one.id === wanted.id ? { ...wanted, missedAt: one.missedAt } : one))
      : [...hours, wanted]
    return sendList()
  }

  if (message.type === 'scenarioUnschedule') {
    hours = hours.filter((one) => one.id !== message.scheduleId)
    return sendList()
  }

  /*
   * One scenario with every word of it, asked for by name.
   *
   * The panel opens the editor out of the shelves it already holds; this is the phone's road, and it is
   * answered here so the harness can exercise it (see `scenarioFetch`). A name nothing answers to comes
   * back without a body, which is a state the screen has to be able to say.
   */
  if (message.type === 'scenarioFetch') {
    const found = shelves.find((one) => one.id === message.id && one.scope === message.scope)
    return void setTimeout(
      () => send({ type: 'scenarioFetched', id: message.id, scope: message.scope, scenario: found }),
      120,
    )
  }

  if (message.type === 'scenarioDelete') {
    shelves = shelves.filter((one) => one.id !== message.id)
    return sendList()
  }

  if (message.type === 'scenarioDuplicate') {
    const source = shelves.find((one) => one.id === message.id)
    if (!source) return
    shelves = [...shelves, { ...structuredClone(source), id: `${source.id}-copy`, name: `${source.name} copy` }]
    return sendList()
  }

  if (message.type === 'scenarioRun') {
    const scenario = shelves.find((one) => one.id === message.id)
    if (!scenario) return
    // As many at once as somebody wants, which is the point of the whole thing: no refusal here at all.

    const id = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
    const run = blankRun(structuredClone(scenario), id, message.inputs)
    records[id] = run
    runs = [summarise(run), ...runs]
    live = [...live, id]
    send({ type: 'scenarioStarted', runId: id })
    sendList()
    walk(id)
    return
  }

  if (message.type === 'scenarioOpen') {
    const run = records[message.runId]
    return run ? send({ type: 'scenarioRun', run }) : send({ type: 'scenarioOutcome', ok: false, code: 'runGone' })
  }

  /*
   * The answer to what a card stopped to ask: the question goes and the walk carries on.
   *
   * Nothing is checked about the words - the CLI builds the tool result out of them, and what a stand-in
   * for the IDE has to get right is that answering UNBLOCKS, which is the whole of what the screen
   * promises.
   */
  if (message.type === 'scenarioAnswer') {
    const run = records[message.runId]
    if (run?.question) {
      keep({
        ...run,
        state: 'running',
        question: null,
        steps: run.steps.map((one) => (one.state === 'asking' ? { ...one, state: 'running' } : one)),
        notes: [
          ...run.notes,
          { at: Date.now(), stepKey: run.question.stepKey, text: `Told it: ${message.text || 'yes'}.` },
        ],
      })
    }
    return
  }

  if (message.type === 'scenarioPause') {
    const run = records[message.runId]
    if (run) {
      keep({
        ...run,
        state: 'paused',
        steps: run.steps.map((one) => (one.state === 'running' ? { ...one, state: 'paused' } : one)),
      })
    }
    return
  }

  if (message.type === 'scenarioResume') {
    const run = records[message.runId]
    if (run) {
      keep({
        ...run,
        state: 'running',
        steps: run.steps.map((one) => (one.state === 'paused' ? { ...one, state: 'running' } : one)),
      })
    }
    return
  }

  if (message.type === 'scenarioStop') {
    const run = records[message.runId]
    if (run) {
      keep({
        ...run,
        state: 'stopped',
        failure: 'stopped',
        finishedAt: Date.now(),
        steps: run.steps.map((one) =>
          one.state === 'done' || one.state === 'failed' || one.state === 'skipped'
            ? one
            : { ...one, state: one.state === 'waiting' ? 'skipped' : 'failed', failure: one.state === 'waiting' ? '' : 'stopped', finishedAt: Date.now() },
        ),
      })
      live = live.filter((one) => one !== message.runId)
      stopWalking(message.runId)
      sendList()
    }
    return
  }

  /*
   * Picking a finished run up where it stood, the way the IDE does (see ScenarioEngine.carryOn): the
   * card that was cut short goes back to running and the walk resumes from it; a run stopped between
   * cards resumes at the next one.
   */
  if (message.type === 'scenarioContinue') {
    const run = records[message.runId]
    if (!run || live.includes(message.runId)) return send({ type: 'scenarioOutcome', ok: false, code: 'runBusy' })
    continued += 1
    if (continued % 3 === 0) return send({ type: 'scenarioOutcome', ok: false, code: 'runNotResumable' })

    const lastDone = run.steps.map((one) => one.state).lastIndexOf('done')
    const cut = run.steps.findIndex((one, index) => index > lastDone && one.state === 'failed')
    const from = cut >= 0 ? cut : lastDone + 1
    // The stage being picked up moves its clock past the gap, as the IDE does: every duration on the
    // screen is the difference between two stamps, and left where they were the cut card and its stage
    // would have worked for the three days the record stood.
    const gap = Math.max(0, Date.now() - run.finishedAt)
    const stageId = run.steps[from]?.stageId
    const pastTheGap = (one: ScenarioRunStep): ScenarioRunStep =>
      one.stageId !== stageId || one.startedAt === 0
        ? one
        : { ...one, startedAt: one.startedAt + gap, finishedAt: one.finishedAt > 0 ? one.finishedAt + gap : 0 }

    live = [...live, message.runId]
    keep({
      ...run,
      state: 'running',
      finishedAt: 0,
      failure: '',
      error: '',
      idle: (run.idle ?? 0) + gap,
      steps: run.steps.map((one, index) =>
        index < from
          ? pastTheGap(one)
          : index === cut
            ? { ...pastTheGap(one), state: 'running', finishedAt: 0, failure: '', error: '', verdict: '', verdictReason: '' }
            : { ...one, state: 'waiting', startedAt: 0, finishedAt: 0, failure: '', error: '', said: '', summary: '', verdict: '', verdictReason: '' },
      ),
      notes: [...run.notes, { at: Date.now(), stepKey: run.steps[from]?.key ?? '', text: 'Picked up where it stood.' }],
    })
    walk(message.runId, from, cut >= 0 ? 'judge' : 'run')
    sendList()
    return
  }

  if (message.type === 'scenarioRunDelete') {
    if (live.includes(message.runId)) return send({ type: 'scenarioOutcome', ok: false, code: 'runBusy' })
    runs = runs.filter((one) => one.id !== message.runId)
    delete records[message.runId]
    return sendList()
  }

  if (message.type === 'scenarioLog') {
    opened += 1
    const missing = opened % 3 === 0
    const run = records[message.runId]
    const step = run?.steps.find((one) => one.key === message.key)

    setTimeout(() => {
      send({
        type: 'scenarioLog',
        runId: message.runId,
        key: message.key,
        found: !missing,
        truncated: !missing && opened % 2 === 0,
        events: missing ? [] : logEvents(step?.title ?? 'The head'),
      })
    }, 250)
  }
}
