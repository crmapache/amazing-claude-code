/**
 * Everything the panel says, in English - and the source of truth for every other language.
 *
 * The shape is the contract. Every other dictionary is declared as `Dict`, which is `typeof en`, so the
 * compiler - not a reviewer - is what fails when a key is missing, a key is spelled differently, or a
 * string that takes a number is translated as a plain string. A dictionary cannot be half-finished here
 * the way a properties file can.
 *
 * Rules for writing entries:
 *
 * - Anything with a value in it is a function, not a template with `{0}` in it. The argument gets a name,
 *   the compiler checks the call, and a translator sees what they are given rather than a numbered hole.
 * - Grouped by where it is read, not by what type of word it is: everything the menu says is under
 *   `menu`, everything the composer says is under `composer`. Somebody translating works screen by
 *   screen, and a screen scattered across the file is a screen translated inconsistently.
 * - Product names stay as they are in every language: Claude Code, MCP, Opus, Sonnet, Haiku, Git, PR.
 *   So do the names of the CLI's own tools (READ, EDIT, BASH) - they are identifiers, not words.
 * - The house dash is a plain hyphen with spaces around it, as the English copy has always written it.
 *   Every translation keeps that rather than reaching for its own typographic dash.
 */

export const en = {
  common: {
    back: 'Back',
    close: 'Close',
    closeMenu: 'Close menu',
    loading: 'Loading…',
    cancel: 'Cancel',
    /** The percentage a switched-off sound shows instead of its volume. */
    muted: 'muted',
    /** "7 on" beside the sound row - how many of the alerts are still switched on. */
    countOn: (n: number): string => `${n} on`,
  },

  menu: {
    /** The head of every screen: the word in caps, and the line under it saying what is inside. */
    titles: {
      menu: { title: 'MENU', hint: 'everything the panel keeps out of the way' },
      history: { title: 'HISTORY', hint: 'past conversations of this project' },
      mcp: { title: 'MCP SERVERS', hint: 'status · sign in · reconnect' },
      plugins: { title: 'PLUGINS', hint: 'installed · browse · marketplaces' },
      settings: { title: 'SETTINGS', hint: 'how the panel behaves and sounds' },
      sounds: { title: 'SOUND ALERTS', hint: 'when the panel calls you' },
      calmColors: { title: 'NO-STRESS COLORS', hint: 'how the gauges are painted' },
      remote: { title: 'REMOTE ACCESS', hint: 'state · relay · paired devices' },
      remoteAbout: { title: 'WHAT TRAVELS', hint: 'read this before you turn it on' },
      defaultMode: { title: 'DEFAULT MODE', hint: 'what new tabs start in' },
      composerLayout: { title: 'COMPOSER LAYOUT', hint: 'where the input sits' },
      pasteCollapse: { title: 'PASTED TEXT', hint: 'when a paste folds into a chip' },
      sendKey: { title: 'SENDING A MESSAGE', hint: 'which key sends it' },
      improvePrompt: { title: 'IMPROVE PROMPT', hint: 'what the sparkle button asks for' },
      voice: { title: 'VOICE INPUT', hint: 'dictate instead of typing' },
      voiceLanguage: { title: 'SPOKEN LANGUAGE', hint: 'what dictation listens for' },
      voiceDevice: { title: 'MICROPHONE', hint: 'which one to listen through' },
      customModels: { title: 'CUSTOM MODELS', hint: 'ones Claude Code does not offer' },
      language: { title: 'LANGUAGE', hint: 'what the panel speaks' },
      accounts: { title: 'CLAUDE ACCOUNTS', hint: 'which subscription pays for the work' },
      feedback: { title: 'FEEDBACK', hint: 'a bug, an idea, or just hello' },
      feedbackLog: { title: 'WHAT GETS ATTACHED', hint: 'the whole report, before it goes' },
    },

    rows: {
      history: { label: 'History', sub: 'Past conversations of this project' },
      statistics: { label: 'Statistics', sub: 'Hours, habits, achievements' },
      mcp: { label: 'MCP servers', sub: 'Status, sign-in, reconnect' },
      plugins: { label: 'Plugins', sub: 'Installed, browse, marketplaces' },
      remote: { label: 'Remote access', sub: 'State, relay, paired devices' },
      accounts: { label: 'Claude accounts', sub: 'Switch without signing out' },
      settings: { label: 'Settings', sub: 'Sounds, mode, layout, language' },
      feedback: { label: 'Send feedback', sub: 'A bug, an idea, or just hello' },
    },

    /**
     * The one advertisement in the panel: the author's other product, at the foot of the menu. The
     * name is not here on purpose - "Snakein" is a name, and a name is the same in every language.
     */
    author: {
      title: 'Got an interview coming up?',
      body: 'Ace it with an AI assistant. Try it free',
      tagline: 'real-time interview copilot',
    },

    /** The plugin's own name at the foot of the list, beside its version. Never translated. */
    footer: 'Amazing Claude Code GUI',
  },

  settings: {
    rows: {
      sounds: { label: 'Sound alerts', sub: 'When the panel calls you' },
      calmColors: { label: 'No-stress colors', sub: 'Gauges in one calm tone' },
      defaultMode: { label: 'Default mode', sub: 'What new tabs start in' },
      composerLayout: { label: 'Composer layout', sub: 'Where the input sits' },
      pasteCollapse: { label: 'Pasted text', sub: 'When a paste folds into a chip' },
      sendKey: { label: 'Sending a message', sub: 'Which key sends it' },
      improvePrompt: { label: 'Improve prompt', sub: 'What the sparkle button asks for' },
      voice: { label: 'Voice input', sub: 'Dictate with your own Deepgram key' },
      customModels: { label: 'Custom models', sub: 'Ones Claude Code does not offer' },
      language: { label: 'Language', sub: 'What the panel speaks' },
    },

    /** The value beside the "Improve prompt" row: whose words the button asks by. */
    improveSummary: { builtIn: 'Default', custom: 'Custom' },
  },

  /**
   * The screen where a model Claude Code does not offer is added by hand.
   *
   * It exists for one setup and says so: a proxy router or a gateway, where the models on the other end
   * are not the ones the CLI lists. On an ordinary sign-in the list Claude Code gives is the whole
   * truth, and a name added here is simply refused before the first turn - which the note has to say
   * before anybody types one in, not after.
   */
  customModels: {
    note: 'Claude Code names the models it knows about, and the menu shows exactly those. Working through a proxy or a gateway, add the identifiers it serves here and they will stand in the menu beside the rest.',
    warn: 'On an ordinary Claude sign-in there is nothing to add: a name Claude Code does not know is refused before the first turn.',
    placeholder: 'model identifier',
    add: 'Add',
    remove: 'Remove',
    /** Over the list of what has been added. */
    added: 'ADDED',
    /** The value beside the row in the settings list, and the screen with nothing on it yet. */
    none: 'None',
    count: (n: number): string => (n === 1 ? '1 model' : `${n} models`),
  },

  language: {
    note: 'The panel only. What language Claude answers in is a setting of Claude Code itself, shared with the terminal, and this does not touch it.',
    /** The first entry of the list: whatever the IDE itself is set to. */
    followIde: 'Automatic',
    followIdeSub: (language: string): string => `Follow the IDE - ${language} right now`,
    followIdeUnknown: 'Follow the IDE',
  },

  sounds: {
    turnFinished: { label: 'Turn finished', hint: 'Claude answered and is waiting for you' },
    permission: { label: 'Permission asked', hint: 'a tool call needs your approval' },
    question: { label: 'Question asked', hint: 'Claude asked you to pick an answer' },
    plan: { label: 'Plan ready', hint: 'a plan is waiting for your approval' },
    rateLimit: { label: 'Limit reached', hint: 'the subscription limit stopped the turn' },
    extraUsage: {
      label: 'Extra usage started',
      hint: 'the plan is used up - the work is now billed on top',
    },
    trouble: { label: 'Something broke', hint: 'an error, a dead process or a signed-out session' },
    play: 'Play it',
    playNamed: (sound: string): string => `Play ${sound}`,
    volumeOf: (sound: string): string => `${sound} volume`,
  },

  calmColors: {
    /** Over the sample: four gauges, one per step of the ladder. */
    sample: 'A GAUGE AT EVERY LEVEL',
    label: 'No-stress colors',
    hint: 'One tone, whatever the gauges read',
    keeps: 'Nothing else changes: an error stays red, a permission stays what it is. Those are things that happened, not a mood.',
    /** The value beside the row in the settings list. */
    on: 'On',
    off: 'Off',
  },

  history: {
    empty: 'No past conversations here yet.',
    today: 'TODAY',
    earlier: 'EARLIER',
    messages: (n: number): string => (n === 1 ? `${n} message` : `${n} messages`),
  },

  search: {
    title: 'Search',
    /** The tooltip of the magnifier beside the slash. */
    button: 'Search the conversations',
    /** "Claude" is a name and is not translated - see the note on AUTHOR_PRODUCT in SideMenu. */
    tabs: { chat: 'This chat', project: 'All chats', ai: 'Ask Claude' },
    placeholder: 'Words, or a phrase "in quotes"…',
    aiPlaceholder: 'Describe what you are looking for - what it was about, roughly when…',
    /** Under the field of the model's tab: what pressing Find actually does, and what it costs. */
    aiNote: 'Claude reads this project\'s conversations · a run of its own, counts against your usage',
    find: 'Find',
    cancel: 'Cancel',
    retry: 'Retry',
    copy: 'Copy',
    /** The pill on the row under the pointer: pressing the row opens that message in its conversation. */
    openInChat: 'Open in chat',
    aiSearching: 'Reading the conversations…',
    /** "This chat" on a tab that has not said anything yet. */
    noChat: 'This tab holds no conversation yet - try all chats.',
    typeToSearch: 'Results will show up here.',
    aiEmpty: 'Describe it above and press Find.',
    nothing: 'Nothing found.',
    nothingHere: 'Nothing in this chat.',
    aiNothing: 'The model found nothing that fits.',
    results: (n: number): string => (n === 1 ? '1 result' : `${n} results`),
    /** At the foot, across the project: how many matched, and in how many conversations. */
    inChats: (n: number, chats: number): string =>
      `${n} in ${chats === 1 ? '1 chat' : `${chats} chats`}`,
    /** The status at the foot of the window, when the list holds only the best of what matched. */
    showing: (shown: number, total: number): string => `showing ${shown} of ${total}`,
    /** The same status for a list the model chose. */
    places: (n: number): string => (n === 1 ? '1 place the model points at' : `${n} places the model points at`),
    /** The keys the foot of the window offers - the words beside ⏎, → and ←. */
    you: 'You',
    more: 'Show the whole message',
    less: 'Show less',
    /** The × inside a field, there while it holds anything. */
    clear: 'Clear',
    /** The field's two switches, the pair Find in Files has - their tooltips; the caps on them (Cc, W) are not words. */
    matchCase: 'Match case',
    wholeWords: 'Whole words',
    /** Under an unfolded message that was cut to its budget: how much of it is on screen. */
    chars: (shown: number, total: number): string => `${shown} of ${total} chars`,
    failed: 'The search failed.',
    /** The label on the red strip - a word, so the sentence beside it can be the CLI's own. */
    failedLabel: 'FAILED',
    /** What the model has done so far, one line per step (see AiStep on the IDE's side). */
    steps: {
      grep: (subject: string): string => `searched for “${subject}”`,
      read: (subject: string): string => `read “${subject}”`,
      list: 'read the list of conversations',
      other: 'looked through the files',
      count: (n: number): string => (n === 1 ? '1 step' : `${n} steps`),
    },
    capsule: {
      /** The capsule in the feed's corner: the way back into the window it folded into. */
      reopen: 'Back to search',
      close: 'Close the search',
      /** On the veil over the feed while it is still on its way to the hit - a conversation opening, pages loading. */
      loading: 'Finding the message…',
      missing: 'not among the loaded messages',
      /** The arrows: one hit up or down THIS conversation, whatever the search was over. */
      previous: 'Previous match in this chat',
      next: 'Next match in this chat',
    },
  },

  /**
   * The scenarios: the hub where a round of work is written down, and the timeline of one run of one.
   *
   * The words for a state are chosen here rather than carried in the record, so a run opened in the
   * morning speaks whatever language the panel is set to now (see the note about the reducer above).
   */
  scenarios: {
    title: 'SCENARIOS',
    hint: 'rounds of work written down once',
    /** The tooltip of the button beside the magnifier. */
    button: 'Scenarios',
    /**
     * The strip at the top of the hub while this part of the panel is still young.
     *
     * A scenario runs agents for hours over somebody's working copy, and the shapes it can be given are
     * more than one pair of hands walks through before a release. So the screen says as much itself and
     * points at the one place where a report is of any use - the feedback form, from which a case can be
     * reproduced. It comes off once the reports stop coming.
     */
    untested: {
      text: 'Scenarios are new here and have not been tried from every side yet. If something goes wrong, describe it in the feedback form - that is what makes it fixable.',
      report: 'Report a problem',
    },
    create: 'New scenario',
    /** What a scenario and its first stage are called before anybody renames them. */
    newName: 'New scenario',
    stage: 'Stage',
    /**
     * A new scenario begins with a sentence rather than an empty form (see ScenarioAuthor on the IDE's
     * side). The form is what nobody wants to meet first; saying what the work is, anybody can do.
     */
    draft: {
      title: 'NEW SCENARIO',
      hint: 'Describe the round of work and Claude writes it down: what to do, in what order, and what has to be true at the end.',
      write: 'Write it for me',
      byHand: 'Build it myself',
      going: 'Reading the project and writing it\u2026',
    },
    play: 'Run',
    /**
     * The hour a scenario starts at by itself (see ScenarioSchedule on the IDE's side). The row says the
     * rhythm and the clock; the words for "missed" have to carry, because nothing is ever started late.
     */
    when: {
      set: 'Start it at a time',
      change: 'Change the time',
      clear: 'Stop starting it by itself',
      at: 'At',
      hours: 'Hour',
      minutes: 'Minute',
      repeat: 'Repeat',
      onDay: 'On',
      repeats: {
        once: 'Once',
        daily: 'Every day',
        weekdays: 'Weekdays',
        weekly: 'Weekly',
      },
      weeklyOn: (day: string): string => `Every ${day}`,
      next: (when: string): string => `next ${when}`,
      missed: (when: string): string => `missed ${when}`,
      ran: (when: string): string => `ran ${when}`,
      needsIde: 'It starts only while this IDE is open. An hour that passes with it closed is not run late - the row says it was missed.',
      save: 'Set the time',
    },
    duplicate: 'Duplicate',
    delete: 'Delete',
    deleteTitle: 'Delete this scenario?',
    deleteRun: 'Delete this run',
    deleteRunTitle: 'Delete this run?',
    /** On a Run button that cannot be pressed: something else is already going in this project. */
    busy: 'A run is already going in this project',
    /** Under the name of a scenario that cannot be run as it stands - the editor says what is wrong. */
    needsFixing: 'needs fixing before it can run',
    stages: (n: number): string => (n === 1 ? '1 stage' : `${n} stages`),
    cards: (n: number): string => (n === 1 ? '1 card' : `${n} cards`),
    /** Beside the counts, for a scenario one of whose stages goes round more than once. */
    hasLoop: 'has a loop',
    pastRuns: 'PAST RUNS',
    noRuns: 'Nothing has been run yet.',
    /** The row at the foot of the past runs: the list is shown a screenful at a time (see ScenariosTab). */
    moreRuns: (count: number): string => `Show ${count} more`,
    shelves: {
      project: 'IN THIS REPOSITORY',
      user: 'IN EVERY PROJECT',
      projectEmpty: 'Nothing here yet. A scenario put here travels with the repository, beside the project\'s own commands and skills.',
      /** When there is no project folder to write into at all. */
      noProject: 'This window has no project folder, so there is nowhere to put a shared scenario.',
      userEmpty: 'Nothing here yet. A scenario put here is yours alone and follows you from project to project.',
    },
    runStates: {
      starting: 'Starting',
      running: 'Running',
      paused: 'Paused',
      blocked: 'Waiting for you',
      done: 'Done',
      failed: 'Failed',
      stopped: 'Stopped',
    },
    stepStates: {
      waiting: 'Not yet',
      running: 'Running',
      asking: 'Asking',
      /** The head's turn rather than the card's: choosing its slots, or judging what came back. */
      judging: 'With the main thread',
      paused: 'Paused',
      done: 'Done',
      failed: 'Failed',
      skipped: 'Never ran',
    },
    /** A failure with a name of its own says it instead of the plain word "failed". */
    failures: {
      noHead: 'The main thread never came up',
      noStart: 'It would not start',
      tooLong: 'Ran past its time',
      headSilent: 'The main thread stopped answering',
      crashed: 'The process went away',
      refused: 'Refused',
      noVerdict: 'No verdict',
      retries: 'Out of goes',
      stopped: 'Cut short',
      undone: 'Not done',
    },
    /** What the IDE said it could not do. */
    outcomes: {
      scenarioBroken: 'This scenario cannot be run as it stands - open it and see what is wrong.',
      scenarioNotWritten: 'The scenario could not be written to disk.',
      scenarioNotDeleted: 'The scenario could not be deleted.',
      scenarioGone: 'That scenario is no longer there.',
      scenarioBusy: 'A run is already going in this project. One at a time - two of them edit the same files.',
      scenarioMissingInput: 'Something it asks for was left empty.',
      noClaude: 'Claude Code was not found on this machine.',
      runGone: 'That run is no longer there.',
      unknown: 'Something went wrong.',
    },
    run: {
      title: 'RUN',
      startedAt: (when: string): string => `started ${when}`,
      /** The head is the only participant with no row of its own on the timeline. */
      head: 'Main Thread',
      pause: 'Pause',
      resume: 'Resume',
      stop: 'Stop',
      stopTitle: 'Stop this run?',
      stopSubject: 'Whatever a card is doing right now is cut short, and the stages after it never happen.',
      cards: (done: number, total: number): string => `${done}/${total} cards`,
      running: 'running for',
      open: 'open for',
      took: 'took',
      cost: 'cost',
      tokens: 'tokens',
      /** The heading of a pass of a stage that runs a set number of times, and of one that may stop early. */
      passOf: (pass: number, passes: number): string => `pass ${pass} of ${passes}`,
      passOfUpTo: (pass: number, passes: number): string => `pass ${pass} of up to ${passes}`,
      /** In front of what the head said, between the cards. */
      headSaid: 'main',
      sentBack: (n: number): string => (n === 1 ? 'sent back once' : `sent back ${n} times`),
      allow: 'Allow',
      deny: 'Refuse',
      answerPlaceholder: 'What to tell it…',
    },
    help: {
      button: 'What scenarios are',
      title: 'Scenarios, briefly',
      what: { lead: 'A scenario', text: 'is a round of work you repeat, written down once: a few cards, each said to a Claude session of its own, one after another.' },
      asks: { lead: 'It can ask you something first', text: 'a ticket number, a branch, whatever changes from one run to the next - so the same round of work goes against something different each time.' },
      run: { lead: 'Press Run', text: 'and the main thread walks them for you - it tells each card what the ones before found out, decides whether it is done, and answers the questions they stop on.' },
      kept: { lead: 'Kept in the repository', text: 'a scenario travels with it and everyone working there has it; kept in every project it is yours alone and follows you around.' },
      watch: { lead: 'A run opens in a tab of its own', text: 'with every step in order. Pause it, carry on, or stop it - and press any step to read the whole conversation it had.' },
    },
    log: {
      loading: 'Reading what it said…',
      step: 'STEP',
      head: 'MAIN THREAD',
      /** The transcript is not on this machine, or the run was swept. */
      missing: 'There is no record of this step on this machine.',
      truncated: 'This is the end of it - the beginning is not shown.',
    },
    editor: {
      title: 'SCENARIO',
      newTitle: 'NEW SCENARIO',
      save: 'Save',
      problems: 'This cannot be run until these are fixed:',
      /** Everything wrong with it is only untidy - it will still run. */
      warnings: 'Worth tidying:',
      name: 'NAME',
      shelf: 'KEPT IN',
      inRepository: 'In this repository',
      mine: 'In every project',
      head: 'MAIN THREAD',
      briefingHint: 'What this round of work is for, in your own words. The main thread reads this and judges every card by it.',
      defaultModel: 'As a new tab would',
      defaultEffort: 'As a new tab would',
      sameAsHead: 'Same as the main thread',
      onQuestion: 'ON A QUESTION',
      questionHead: 'The main thread answers it',
      questionStop: 'Stand still and wait for me',
      retries: 'SEND BACK',
      noRetries: 'One go, no second chances',
      retriesCount: (n: number): string => (n === 1 ? 'up to once' : `up to ${n} times`),
      inputs: 'ASKED BEFORE IT STARTS',
      addInput: 'Add a question',
      noInputs: 'Nothing is asked before this scenario starts.',
      inputName: 'name',
      inputLabel: 'What to call it on the form',
      required: 'must be filled',
      stages: 'STAGES',
      addStage: 'Add a stage',
      stageNumber: (n: number): string => `Stage ${n}`,
      passes: 'RUNS',
      once: 'once',
      times: (n: number): string => `${n} times`,
      /** A loop that ends as soon as the head decides there is nothing left to do. */
      untilDone: 'or fewer, if the main thread says it is done',
      cards: 'CARDS',
      addCard: 'Add a card',
      cardTitle: 'What this card is called',
      promptHint: 'What this card\'s own session is told. {{name}} is answered before the run; [[name]] is filled by the main thread from what the cards above found out.',
      slots: 'SLOTS THE MAIN THREAD FILLS',
      noSlots: 'None. Write [[name]] in the prompt and describe it here.',
      slotName: 'name',
      slotHint: 'What the main thread is to put here',
      addSlot: 'Add a slot',
      dod: 'DEFINITION OF DONE',
      dodHint: 'How the main thread is to tell this card is finished. Empty means the turn ending is enough.',
      after: 'AFTER THE CARD',
      afterHint: 'What the main thread should do once this card is done - check something, note something down.',
      overrides: 'JUST FOR THIS CARD',
      moveUp: 'Move up',
      moveDown: 'Move down',
      remove: 'Remove',
      untitledCard: 'an untitled card',
    },
    problems: {
      noStages: 'There are no stages in it.',
      emptyStage: 'A stage has no cards in it.',
      noPrompt: (card: string): string => `${card}: nothing is written for its session to do.`,
      unknownInput: (card: string, name: string): string =>
        `${card}: {{${name}}} is not something this scenario asks for.`,
      undeclaredSlot: (card: string, name: string): string =>
        `${card}: [[${name}]] is in the prompt but nobody is asked to fill it.`,
      unusedSlot: (card: string, name: string): string =>
        `${card}: the slot ${name} is described but never used in the prompt.`,
      duplicateInput: (name: string): string => `Two questions are both called ${name}.`,
      duplicateSlot: (card: string, name: string): string => `${card}: two slots are both called ${name}.`,
      badInputName: (name: string): string => `"${name}" is not a name - use letters, digits, - and _.`,
      badSlotName: (card: string, name: string): string =>
        `${card}: "${name}" is not a name - use letters, digits, - and _.`,
    },
  },

  composerLayout: {
    bottom: 'Default',
    compact: 'Compact',
    left: 'Left',
    right: 'Right',
  },

  pasteCollapse: {
    note: 'A long paste folds into a chip so that a wall of text does not fill the input field. Lines are counted as they would fall in the field itself, so text pasted as one endless line folds too. Nothing is lost either way - a folded paste holds the text whole and unfolds back into the field by the pencil button on it.',
    never: 'Never fold',
    neverSub: 'Everything pasted stays in the field as plain text',
    /** "From 5 lines" - the threshold a paste has to reach to be folded. Beside the row in the settings. */
    from: (lines: number): string => `From ${lines} lines`,
    /** The other row of that screen: the one carrying the number field. */
    foldLabel: 'Fold long pastes',
    foldSub: (min: number, max: number): string => `From how many lines - ${min} to ${max}`,
  },

  sendKey: {
    note: 'Which key lets a message go. The other one breaks the line - so a message written as several paragraphs is typed with the same key either way.',
    enter: 'Enter',
    enterSub: 'Shift+Enter breaks the line',
    /** The modifier is named by the system - Cmd on a Mac, Ctrl elsewhere (see modifierName). */
    modEnter: (mod: string): string => `${mod}+Enter`,
    modEnterSub: 'Enter breaks the line',
  },

  improvePrompt: {
    note: 'The sparkle button beside the paperclip rewrites what stands in the input field. This is what it asks for. It goes out as a Claude Code run of its own - no tools, no files, no conversation - and counts against your usage.',
    label: 'INSTRUCTIONS',
    emptyMeans: 'Empty means the grey text above - what the button uses out of the box.',
    /**
     * The built-in instructions stay English whatever the panel speaks, so this says so out loud: they are
     * a prompt to a model rather than interface copy, and they already ask for the draft's own language
     * back. Somebody who wants them in their language rewrites them - that is what the field is for.
     */
    builtInLanguage:
      'It is English because it is a prompt to the model, not interface copy - it already asks for an answer in the language of the draft. Yours can be in any language.',
    editBuiltIn: 'Edit the built-in text',
    backToBuiltIn: 'Back to the built-in text',
  },

  voice: {
    note: 'Hold a key and talk - the words land in the input field as you say them. It runs on your own Deepgram key: the audio goes to Deepgram and nowhere else, and the plugin has no server in between.',
    /** The value beside the row in the settings list when the feature is off. */
    off: 'Off',
    enable: 'Voice input',

    key: 'DEEPGRAM API KEY',
    keyPlaceholder: 'Paste your key',
    /** What stands in the field once a key is stored - its last four characters, never the key. */
    keySet: (tail: string): string => `Key stored, ending ${tail}`,
    keySave: 'Save',
    keyForget: 'Forget this key',

    balanceLeft: (amount: string): string => `${amount} left on the account`,
    balanceChecking: 'Asking Deepgram…',
    balanceNoKey: 'No key yet.',
    /** Not a failure: reading a balance needs the owner or admin role at Deepgram. */
    balanceNoAccess: 'The key works. Reading the balance needs a key with the Owner or Admin role.',
    balanceRejected: 'Deepgram does not recognise this key.',
    balanceFailed: 'Could not reach Deepgram. Check the network and try again.',
    balanceRefresh: 'Refresh',

    getKey: 'No key yet?',
    getKeyHint: 'Sign up at deepgram.com and create an API key. $200 of credit without a card.',
    openSite: 'Open deepgram.com',

    hotkeys: 'HOTKEYS',
    push: 'Push to talk',
    pushHint: 'Records while you hold it, stops when you let go.',
    hold: 'Hands free',
    holdHint: 'One press starts it, the next one stops it.',
    keyboard: 'KEY',
    mouse: 'MOUSE',
    record: 'Set',
    recording: 'Press a key…',
    /** The same wait, in the half of the row that only takes a mouse button. */
    recordingMouse: 'Press a button…',
    notSet: 'Not set',
    clear: 'Clear',
    /** The side of the keyboard, for a binding that is one bare modifier. */
    sideLeft: 'Left',
    sideRight: 'Right',
    badButton: 'Only the side buttons of a mouse can be used - the main three already mean something everywhere in the IDE.',

    language: 'Spoken language',
    languageHint: 'What dictation listens for',
    searchLanguages: 'Search languages…',
    multiHint: 'Multilingual follows speech that changes language mid-sentence. Measured against a named language it does worse on both - pick it only if you genuinely mix two languages in one breath.',

    device: 'Microphone',
    deviceHint: 'Which one to listen through',
    deviceDefault: 'System default',
    deviceDefaultHint: 'Follows whatever the system is set to',
    deviceNote: 'Changing this takes effect on the next dictation.',

    /** The card at the foot of this screen - the author's other app. The product's name is not here: it
        is written the same in every language (see DICTATION_PRODUCT). */
    promo: {
      title: 'Enjoying dictating here?',
      body: 'Hold a key and talk in any other window too - my other app types your voice into whatever you are in. Sign up now and it stays free for you.',
      tagline: 'dictation for Mac and Windows',
    },

    errorNoKey: 'Add a Deepgram key first - Settings, then Voice input.',
    errorNoKeyRemote: 'No Deepgram key on the machine this conversation runs on - add one there, in Settings, Voice input.',
    errorOff: 'Voice input is switched off on the machine this conversation runs on - switch it on there, in Settings.',
    errorMicrophone: 'The microphone would not open. Another application may be holding it.',
    errorKey: 'Deepgram refused the key. Check it on the Voice input screen.',
    errorNetwork: 'Could not reach Deepgram. Check the network and try again.',
    errorGeneral: 'The dictation stopped. Try again.',
  },

  modes: {
    manual: {
      label: 'Ask permissions',
      sub: 'Reads freely, asks before every write and every command.',
      short: 'Ask',
    },
    acceptEdits: {
      label: 'Accept edits',
      sub: 'Auto-approves file edits in the working dir. Still asks for shell.',
      short: 'Accept',
    },
    plan: {
      label: 'Plan',
      sub: 'Researches and proposes a plan. Touches nothing until you approve.',
      short: 'Plan',
    },
    auto: {
      label: 'Auto',
      sub: 'No prompts - a classifier vets each risky action. Not on every model.',
      short: 'Auto',
    },
    dontAsk: {
      label: "Don't ask",
      sub: 'Never prompts; denies anything not pre-approved. For unattended runs.',
      short: "Don't ask",
    },
    bypassPermissions: {
      label: 'Bypass permissions',
      sub: 'Skips almost every check. Dangerous deletions still ask. Containers and throwaway VMs only.',
      short: 'Bypass',
    },
    tags: {
      default: 'default',
      readOnly: 'read-only',
      preview: 'preview',
      settings: 'settings',
      danger: 'danger',
    },
  },

  effort: {
    auto: { sub: "Resets to the model's default effort for this session." },
    ultracode: { sub: 'xhigh reasoning plus automatic multi-agent workflows when a task calls for one.' },
    max: { sub: 'Everything it has. Architecture and gnarly bugs.' },
    xhigh: { sub: 'More of the same, for changes that span many files.' },
    high: { sub: 'Long reasoning before acting. Multi-file changes.' },
    medium: { sub: 'Balanced. Good default for feature work.' },
    low: { sub: 'Minimal thinking. Mechanical edits and quick answers.' },
    tags: { ultra: 'ultra', slow: 'slow', default: 'default' },
  },

  models: {
    default: { label: 'Default (recommended)', sub: 'Use the model this session starts with.' },
    opus: { sub: 'Opus 5 · Best for everyday, complex tasks' },
    opus1m: { label: 'Opus (1M context)', sub: 'Opus 5 with 1M context · For long sessions with large codebases' },
    fable: { sub: 'Fable 5.1 · The hardest and longest-running tasks' },
    sonnet: { sub: 'Sonnet 5 · Efficient for routine tasks' },
    sonnet1m: {
      label: 'Sonnet (1M context)',
      sub: 'Sonnet 5 with 1M context · For long sessions with large codebases',
    },
    haiku: { sub: 'Haiku 4.5 · Fastest for quick answers' },
    opusplan: { label: 'Opus Plan Mode', sub: 'Use Opus in plan mode, Sonnet otherwise' },
    unavailable: 'unavailable',
    /** The line under a model the agent moved to by itself - see modelMenu. */
    switchedItself: 'Claude Code switched to this model on its own.',
    /** And under one somebody typed in themselves - it is in no catalogue, so it says where it is from. */
    custom: 'Added by you',
    /** The last entry of the menu: the way to the screen where that is done (see ADD_MODEL). */
    add: 'Add a model…',
    addSub: 'One Claude Code does not offer',
  },

  composer: {
    placeholder: 'Ask, or describe a change…',
    placeholderPlan: 'Describe what to plan…',
    attach: 'Attach files or folders',
    slash: 'Slash commands',
    improve: 'Improve the prompt',
    /** The tooltip while the field still holds an untouched rewrite - see improveSources in App. */
    improveAgain: 'Another take, from what you wrote',
    restore: 'Back to what you wrote',
    stop: 'Stop',
    forceStop: 'Not responding · Force stop',
    forceStopHint: 'Claude isn’t confirming the stop',
    queue: 'Queue',
    queueHint: 'Send after the current run finishes',
    send: 'Send',
    run: 'Run',
    runHint: 'Run in your shell - Claude sees the output with your next message',
    improveEmpty: 'Claude Code answered with nothing to put in the field.',
    improveChanged: 'The draft changed while it was being rewritten, so it was left alone.',
    /** The sparkle over a draft that begins with "!" - see runShellCommand. */
    improveTerminal: 'A terminal command is not rewritten',
    voice: 'Dictate',
    voiceStop: 'Stop dictating',
  },

  header: {
    idle: 'Idle',
    running: 'Claude is working',
    done: 'Turn finished',
    attention: 'Waiting for you',
    crashed: 'Session stopped unexpectedly',
    statistics: 'Statistics',
    closeStatistics: 'Close statistics',
    /** The hub's tab, and one for every run being watched - the run carries its scenario's name. */
    scenarios: 'Scenarios',
    closeScenarios: 'Close scenarios',
    closeRun: 'Close this run',
    conversations: 'Conversations',
    newSession: 'New session',
    menu: 'Menu',
    /** How many others have this project open - a browser page beside the IDE, or a phone. */
    watchers: (n: number): string => `${n} other ${n === 1 ? 'client is' : 'clients are'} watching this project`,
  },

  thanks: {
    button: 'Enjoying the plugin? Say thanks',
    title: 'SAY THANKS',
    star: 'Star on GitHub',
    starSub: 'Helps other people find the plugin',
    rate: 'Rate it on the plugin page',
    rateSub: 'A review in the JetBrains Marketplace',
    share: 'Share with friends',
    shareSub: 'Copies a line about it and the link',
    shareCopied: 'Copied - paste it wherever you like',
    /**
     * What lands in the clipboard. It is pasted into somebody else's chat under this person's name, so it
     * is written the way one writes to a friend rather than the way one writes an advertisement - and in
     * the language the person is reading the panel in, because that is very likely their friends' too.
     */
    shareText:
      'Check out Amazing Claude Code GUI - Claude Code as a proper panel inside JetBrains IDEs: https://plugins.jetbrains.com/plugin/33255-amazing-claude-code',
  },

  login: {
    checking: 'Checking Claude Code…',
    notFound: 'Claude Code not found',
    notFoundText:
      'The panel drives the claude CLI. If it is installed, point the panel at it - the IDE does not always see the same PATH as your terminal.',
    useThis: 'Use this',
    whereLooked: 'Where the panel looked',
    checkAgain: 'Check again',
    orSwitch: 'Or switch to another account:',
    signIn: 'Sign in to Claude Code',
    /** Which account the button fills: the sign-in goes into that account's drawer. */
    signInAs: (account: string): string => `Sign in as ${account}`,
    signInText:
      'Signing in happens once, in the IDE terminal: Claude opens a browser and waits for you to come back. The panel picks it up on its own.',
    logIn: 'Log in',
    openTerminalAgain: 'Open the terminal again',
    finishInTerminal: 'Finish the login in the terminal - this screen closes by itself.',
    /** The sign-in could not even start - see the `authProblem` message. */
    noDrawer:
      'The panel cannot reach the credential store of this account, so a sign-in here has nowhere to land. Switch to another account below.',
    noTerminal: 'This IDE would not open a terminal, and the sign-in happens in one.',
  },

  stream: {
    waitingForYou: 'Waiting for you',
    waitingForSubagent: 'Waiting for subagent',
    waitingForSubagents: (n: number): string => `Waiting for ${n} subagents`,
    thinking: 'Claude is thinking',
    retryWaiting: (label: string, waited: string): string => `${label} · waiting ${waited}`,
    /** The thinking caption with the turn's stopwatch beside it. */
    withElapsed: (label: string, elapsed: string): string => `${label} · ${elapsed}`,
  },

  agentTask: {
    failedBeforeFinishing: 'Failed before it finished.',
    stoppedBeforeFinishing: 'Stopped before it finished.',
    backgroundEnded: (outcome: string, duration: string): string =>
      duration ? `Background command ${outcome} after ${duration}.` : `Background command ${outcome}.`,
    outcomeFailed: 'failed',
    outcomeStopped: 'was stopped',
    outcomeFinished: 'finished',
    trimmed: (n: number): string => `…${n} earlier steps trimmed`,
  },

  feed: {
    empty: { title: 'Ask Claude about this project', hint: '@ for files · / for commands' },
    you: 'YOU',
    /** The button that appears once the feed has been scrolled away from the newest message. */
    jumpToLatest: 'Jump to latest',
    copyBlock: 'Copy this block',
    copyReply: 'Copy the whole reply',
    /** The three dots on a card, which open everything else it can do - the phone's alone. */
    moreActions: 'More',
    /** The two buttons in the head of a message of one's own - see UserCard. */
    copyMessage: 'Copy this message, with the paths of what was attached',
    reuse: {
      label: 'Edit and send again',
      hint: 'Put this message back into the input field, to edit and send again',
      /**
       * Said instead of the hint when a pasted picture cannot come back: only the caption for it is left
       * in a conversation read off the disk, and the bytes are what the agent was actually shown.
       */
      lostImages: (n: number): string =>
        n === 1
          ? 'Back into the input field - but the pasted image cannot come with it, attach it again'
          : `Back into the input field - but the ${n} pasted images cannot come with it, attach them again`,
    },
    /**
     * The pin button in the corner of a message, and the strip it puts the message into (see
     * feed/pins.ts). `crowded` stands in for `add` on a button gone dead because three are pinned
     * already - it is the one line that says why it will not work and what to do about it.
     */
    pin: {
      add: 'Pin it to the top of the chat',
      crowded: 'Three is the most - unpin one of them before pinning this',
      remove: 'Unpin it',
    },
    pastedLines: (n: number): string => `${n} ${n === 1 ? 'line' : 'lines'} pasted`,
    /** A collapsed paste opens on a click - the hover hint shows only its first lines. */
    pasteClose: 'Collapse it back',
    copyPaste: 'Copy the pasted text',
    /** Said only when a paste is too long to be drawn whole - the copy button still copies all of it. */
    pasteShown: (shown: number, total: number): string => `First ${shown} lines of ${total} · copying takes all of it`,
    fromOutput: 'from output',

    think: { chip: 'THINK', thoughts: (n: number): string => `${n} ${n === 1 ? 'thought' : 'thoughts'}` },

    /** The inside of a Workflow call: its phases and the fleet of agents in them (see WorkflowRun). */
    workflow: {
      agents: (n: number): string => `${n} ${n === 1 ? 'agent' : 'agents'}`,
      running: (n: number): string => `${n} running`,
      done: (n: number): string => `${n} done`,
      failed: (n: number): string => `${n} failed`,
      /** Waiting for a slot: a fleet larger than the concurrency cap mostly stands in a queue. */
      queued: 'queued',
      skipped: 'skipped',
      /**
       * An agent the report still calls running or queued, in a run that is over: its process was
       * taken down under it (see WorkflowRun's `live`).
       */
      dropped: 'dropped',
      /** Shown only past the first - see workflowView. */
      attempt: (n: number): string => `try ${n}`,
      /** A resumed run gave this one back out of the journal instead of running it again. */
      cached: 'cached',
      /** The heading over the tool calls an unfolded agent made - see AgentBody. */
      steps: 'WHAT IT DID',
      /** And over what it came back with: its structured answer, or its closing words. */
      returned: 'WHAT IT RETURNED',
      cut: 'Cut here - the answer runs on past what fits.',
      /** The agent's own transcript is not on disk: a swept run, or somebody else's machine. */
      noTranscript: "Its own record is gone from disk - this is the run report's own preview.",
      reading: 'Reading its record…',
    },

    tool: {
      running: '· running',
      waitingForYou: '· waiting for you',
      failed: '· failed',
      lines: (n: number): string => `· ${n} ${n === 1 ? 'line' : 'lines'}`,
      matches: (n: number): string => (n > 0 ? `· ${n} ${n === 1 ? 'match' : 'matches'}` : '· no matches'),
      output: (empty: boolean): string => (empty ? '· no output' : '· output'),
      /** The minus is a real minus sign, not a hyphen - it is set beside a plus and has to match it. */
      diff: (added: number, removed: number): string => `· +${added} −${removed}`,
      moreLines: (n: number): string => `… ${n} more lines`,
      /** The same row once the whole diff is open: it collapses it back - see ToolCard. */
      fewerLines: '… collapse',
      count: (n: number): string => `${n} ${n === 1 ? 'tool' : 'tools'}`,
      /** Why a call that never answered was closed anyway - see ClosedReason. */
      closed: {
        replay: 'The saved conversation keeps no result for this call.',
        exited: 'Claude Code stopped responding before this finished.',
        stopped: 'Stopped before it finished.',
        turnEnded: 'The turn ended before this finished.',
        untracked: 'Still running in the background - the panel no longer follows it.',
        restarted: 'Claude Code was restarted here, and this did not survive it.',
      },
      /** The same four seen from a subagent's card: it returns rather than finishes. */
      closedMeta: {
        replay: '· not in the transcript',
        exited: '· interrupted',
        stopped: '· interrupted',
        turnEnded: '· unfinished',
        untracked: '· let go',
        restarted: '· lost in the restart',
      },
    },

    /** The counter under a subagent's own log while it runs. */
      agentWorking: (duration: string): string => `Working · ${duration}`,
    task: {
      /** The heading over a subagent's errand inside its card in the feed (see TaskCard). */
      errand: 'WHAT IT WAS ASKED',
      closed: {
        replay: 'How this one ended is not part of the saved conversation.',
        exited: 'Session ended before this returned.',
        stopped: 'Stopped before it returned.',
        turnEnded: 'The turn ended before this returned.',
        untracked: 'Still running - the panel no longer follows it.',
        restarted: 'Claude Code was restarted here, and this agent did not survive it.',
      },
    },

    bash: { running: 'running', noOutput: 'no output' },

    checkpoint: {
      cleared: 'conversation cleared - nothing above this is remembered anymore',
      earlier: 'earlier messages',
      loadEarlier: 'load earlier messages',
      /** The transcript on disk no longer holds the beginning of this conversation. */
      notKept: 'earlier messages are no longer kept',
      /**
       * Worded differently from the one above on purpose: at the desk the beginning is genuinely gone,
       * while a phone is simply handed the end of a conversation rather than a working day of it (see
       * ClaudeSessionHub.CatchUp).
       */
      notOnPhone: 'earlier messages are not shown on the phone',
    },

    compact: {
      label: 'CONTEXT',
      running: 'Compacting conversation…',
      /** No figures came with the boundary - all that is honestly known is that it happened. */
      done: (manual: boolean): string => `context ${manual ? 'manually' : 'automatically'} compacted`,
      /** With the figures: what went in, what came out, and how long it took when the CLI said. */
      doneWith: (manual: boolean, before: string, after: string, took: string): string =>
        `${manual ? 'manually' : 'automatically'} compacted ${before} of context into ${after ? `a ${after} summary` : 'a summary'}${took ? ` in ${took}` : ''}`,
    },

    retry: {
      label: 'RETRY',
      /**
        * Why the request was refused, said in the panel's own words.
        *
        * These used to be the terminal's English, on the grounds that one overload should not be called
        * two different things in two places. But it lands inside a translated frame (see
        * stream.retryWaiting), so a Russian panel drew half a Russian sentence - and the list of what
        * deliberately stays English (see CLAUDE.md) never had this on it.
        */
      reason: {
        rateLimited: 'Rate limited',
        overloaded: 'API overloaded',
        auth: 'Authentication failed',
        error: 'API error',
      },
      attempt: (n: number): string => `attempt ${n}`,
      attemptOf: (n: number, max: number): string => `attempt ${n}/${max}`,
      retryingIn: (seconds: number): string => `retrying in ${seconds}s`,
      retrying: 'retrying…',
      recovered: (attempts: number): string => `went through after ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}`,
      failed: (attempts: number): string => `gave up after ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}`,
      stopped: (attempts: number): string => `stopped after ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}`,
    },

    /**
     * The caption under a finished turn.
     *
     * The row is drawn from these words; the English marker the IDE reads lives beside them in
     * MetaItem.stats and is never translated.
     */
    result: {
      worked: (duration: string): string => (duration ? `Worked ${duration}` : 'Worked'),
      stopped: (duration: string): string => (duration ? `Stopped by you · ${duration}` : 'Stopped by you'),
      /**
       * The IDE stopped the turn itself, to move the conversation to the account now chosen.
       *
       * A separate wording from `stopped` because nobody pressed anything: the same sentence would
       * be a lie locally, and doubly so when the switch was made in another IDE window.
       */
      movedAccount: (duration: string): string =>
        duration ? `Stopped to switch account · ${duration}` : 'Stopped to switch account',
      /**
       * The tab's process was replaced under it while nothing was being said - see
       * processReplaced. No turn was cut short, so there is no duration to name.
       */
      restarted: 'Claude Code restarted - whatever was still running was dropped',
    },

    modelSwitch: { label: 'MODEL', note: 'switched by Claude Code, not by you' },

    crash: {
      label: 'SESSION',
      text: 'Claude Code stopped unexpectedly.',
      textWithCode: (code: number): string => `Claude Code stopped unexpectedly (exit code ${code}).`,
    },

    limit: {
      label: 'LIMIT',
      extraLabel: 'EXTRA USAGE',
      /**
       * `window` is the window's name and may be empty - the CLI does not always say which one ran out.
       * The whole sentence is built here rather than glued together outside, so a language can put the
       * name wherever its grammar wants it.
       */
      extra: (window: string): string =>
        `The ${window ? `${window} limit` : 'usage limit'} is used up - the work goes on as extra usage, billed on top of the plan`,
      waiting: (window: string): string =>
        `The ${window ? `${window} limit` : 'usage limit'} is used up - waiting for it to reset`,
      resetAt: (clock: string, left: string): string => `${clock} · in ${left}`,
    },

    plan: {
      label: 'PLAN READY',
      steps: (n: number): string => `· ${n} ${n === 1 ? 'step' : 'steps'}`,
      approve: 'Approve & run',
      keepPlanning: 'Keep planning',
      withdrawn: 'The agent stopped waiting for a decision',
    },

    ask: {
      label: 'CLAUDE ASKS',
      blocks: (n: number): string => `${n} ${n === 1 ? 'question' : 'questions'} · blocks the run`,
      pickAny: 'pick any',
      other: 'Other',
      /** The field beside "Other" - it is a placeholder, so it is written in lower case. */
      ownAnswer: 'type your own answer…',
      send: 'Send answers',
      pickToContinue: 'Pick to continue',
      note: 'the run continues right where it asked',
      expand: 'Expand the question',
      collapse: 'Collapse the question',
      dismiss: 'Close the question',
      dismissHint: 'Close and answer in your own words',
    },

    findings: {
      label: 'REVIEW',
      fixed: 'fixed',
      skipped: 'skipped',
      noChange: 'no change needed',
      unconfirmed: 'unconfirmed',
    },

    copy: { copied: 'Copied', click: 'Click to copy', openFile: 'Open in the editor', openFolder: 'Show the folder' },
  },

  chrome: {
    tasks: {
      label: 'TASKS',
      listLabel: 'TASK LIST',
      progress: (done: number, total: number): string => `${done} / ${total} done`,
      collapse: 'Collapse the task list',
      expand: 'Show the rest of the task list',
    },
    queue: {
      label: 'QUEUED',
      hint: (n: number): string =>
        `${n} will fire in order when the run finishes · drag to reorder`,
    },
    selection: { quote: 'Quote', fork: 'Fork from here' },
    streams: {
      main: 'main',
      background: 'bg',
      stopAgent: 'Stop this agent',
      stopAgentNamed: (name: string): string => `Stop ${name}`,
      stopAgentTitle: 'Stop this agent?',
      stopCommand: 'Stop this command',
      stopCommandTitle: 'Stop this command?',
    },
    confirm: { cancel: 'Cancel', stop: 'Stop' },
    noChats: { title: 'Excited to work together!', button: "Let's start" },
    crash: {
      title: 'The panel hit an error',
      text: 'Reloading is safe: your conversations live in the Claude Code processes behind the panel and survive it.',
      button: 'Reload the panel',
    },
  },

  /**
   * Several Claude accounts on one machine.
   *
   * The plan names (`max`, `pro`, `team`), the address and the organisation's name are DATA and are
   * deliberately absent from here: they are the same word in every language, and putting them in a
   * dictionary would mean nine entries in SHARED_WITH_ENGLISH for each (see the note on AUTHOR_PRODUCT).
   */
  accounts: {
    /** Nothing added yet: what the feature buys, and one thing to press. */
    empty: { title: 'Work and personal, side by side', body: 'Switch between Claude accounts without signing out. Skills, hooks, settings and history stay shared.' },
    intro:
      'Everything runs on the account chosen here - every open chat moves onto it, and one in the middle of a turn is stopped so it can move.',
    /** An account whose sign-in has not landed, so nobody knows its address yet. */
    unnamed: 'Signing in…',
    /**
     * The row for the sign-in the CLI already had, when its address cannot be told from the added
     * accounts' - see ClaudeAccounts.defaultIdentity. Naming it by what it is beats naming it by an
     * address that belongs to the row below.
     */
    defaultName: 'Claude Code sign-in',
    current: 'in use',
    signingIn: 'signing in',
    use: 'Select',
    switching: 'Switching…',
    rename: 'Rename',
    save: 'Save',
    /** The default sign-in has no drawer to drop, so the only removal it has is ending the session. */
    logout: 'Log out',
    logoutConfirm: 'Log out of Claude Code?',
    forget: 'Forget',
    add: 'Add an account',
    adding: 'Waiting for the sign-in…',
    /** The way out of a wait that lasts ten minutes - see AddButton. */
    cancel: 'Cancel',
    addHint: 'A terminal opens for the sign-in. Your existing account is not touched.',
    mcpNote: 'MCP servers sign in per account, so a new one authenticates them once. Skills, hooks, settings and history are shared.',
    /**
     * Claude Design's sign-in, which lives here because its credential lives in the account's drawer -
     * and which only a terminal can run (see DesignLogin).
     */
    designAuthorize: 'Authorize Claude Design',
    designNote: 'Claude Design signs in per account too, and only a terminal can do it. This opens one for the account in use; DesignSync then works in the panel by itself.',
    aliasPlaceholder: 'Work, Home, a client…',
    /**
     * Presence, not validity: the CLI answers "signed in" for any credential it can read, including one
     * revoked last week. So the words say what is actually known.
     */
    absent: 'No stored credential. Sign in again to use this account.',
    /** The figures beside a row - short, because they sit on one line under the name. */
    fiveHour: '5h',
    weekly: 'week',
    row: {
      /** The value on the menu row when there is nothing to switch between. */
      one: 'One account',
      adding: 'Signing in…',
    },
    /**
     * Why the machine cannot keep two sign-ins apart. One sentence each, and each names the real reason
     * rather than "unavailable" - a person who reads why can usually do something about it.
     */
    unavailable: {
      ignored: 'This Claude Code cannot keep two sign-ins apart. Update it and open this screen again.',
      wsl: 'Not available for a project inside WSL: Claude Code runs there, not on this machine.',
      not_signed_in: 'Sign in to Claude Code first, then add a second account here.',
      api_key: 'This machine signs in with an API key, which applies to every conversation. Accounts cannot be switched while it is set.',
    },
    /** How a request went. Codes rather than sentences from the IDE, which speaks one language. */
    outcome: {
      'did-not-land': 'That sign-in did not finish, so nothing was added.',
      'no-terminal': 'The terminal would not open, so the sign-in was not started.',
      'no-executable': 'Claude Code was not found on this machine.',
      'no-store': 'A folder for the new account could not be created.',
      'design-no-account': 'The account in use could not be resolved, so nothing was opened.',
      'not-supported': 'This Claude Code cannot keep two sign-ins apart, so nothing was added.',
      'logout-failed': 'Logging out did not work. Try it in a terminal.',
      'already-running': 'A sign-in is already under way.',
      unknown: 'That did not work.',
    } as Record<string, string>,
  },

  remote: {
    /** The square of dots itself - there is nothing to read there, so it is named instead. */
    codeLabel: 'Pairing code',
    /** The remote row in the side menu, once a device is on the other end. */
    states: {
      idle: { label: 'Off', hint: 'This IDE cannot be reached from outside.' },
      connecting: { label: 'Connecting…', hint: 'Reaching the relay for the first time.' },
      connected: { label: 'Connected', hint: 'A paired device can see this project.' },
      reconnecting: {
        label: 'Reconnecting…',
        hint: 'The line dropped. This is ordinary - it comes back by itself.',
      },
      unreachable: {
        label: 'Relay unreachable',
        hint: 'The relay is not answering. Your work is unaffected; only the phone is.',
      },
      refused: {
        label: 'Refused',
        hint: 'The relay would not have this plugin - it may be too old, or another IDE took this address.',
      },
    },
    agent: (id: string): string => `agent ${id}`,
    thisIde: 'THIS IDE',
    relay: 'RELAY',
    device: 'DEVICE',
    allow: 'Allow this IDE to be reached remotely',
    allowHint: 'Off until you turn it on, and off again the moment you turn it back.',
    relayAddress: 'RELAY ADDRESS',
    noSafe:
      'This IDE is set not to remember passwords, so a pairing will not survive a restart. Turn on the IDE’s password safe if you want it to stick.',
    wantsToPair: (device: string): string => `${device} wants to pair`,
    checkFingerprint: 'The device calls itself that - check the fingerprint below matches the one on its screen.',
    allowDevice: 'Allow',
    refuse: 'Refuse',
    scanThis: 'Scan this with the phone',
    codeNote: (left: string): string =>
      `${left} · works once. The secret is in the part of the address after the hash, which browsers never send to a server.`,
    minutesLeft: (minutes: number): string => `${minutes} min left`,
    secondsLeft: (seconds: number): string => `${seconds}s left`,
    stopOffering: 'Stop offering',
    pairDevice: 'Pair a device',
    pairedDevices: 'PAIRED DEVICES',
    revoke: 'Revoke',
    whatTravels: 'What travels, and what a phone may do',
    whatTravelsSub: 'Read this before you turn it on',
    fingerprint: 'This IDE’s fingerprint',
    about: {
      first:
        'With this on, your conversations travel through a relay so a paired phone can read them and answer. That includes what the agent reads and writes: source code, file paths, the output of commands.',
      second:
        'The relay cannot read any of it - the contents are sealed between this IDE and your phone. It does see when you are connected and how much goes by, which is roughly your working hours. You can run a relay of your own instead.',
      can: 'A paired phone can answer permissions, send messages and stop a turn.',
      cannot:
        'It cannot run shell commands, install plugins, change the permission mode, or touch this machine’s clipboard.',
      third:
        'A pairing is proved by a code shown once on this screen. Comparing the two fingerprints catches the one thing the code cannot: someone who photographed the screen and scanned it first.',
    },
  },

  feedback: {
    button: 'Report a bug or send an idea',
    kinds: {
      bug: { label: 'Bug', placeholder: 'What happened, and what did you expect instead?' },
      idea: { label: 'Idea', placeholder: 'What would you like the panel to do?' },
      hello: { label: 'Hello', placeholder: 'Anything at all - it reaches a person, not a queue.' },
    },
    email: 'EMAIL',
    emailOptional: 'optional',
    attachments: 'ATTACHMENTS',
    addFiles: 'Add files',
    removeFile: (name: string): string => `Remove ${name}`,
    attachTotal: (count: number, max: number, size: string, budget: string): string =>
      `${count} of ${max} · ${size} of ${budget}`,
    logs: 'Attach debug logs',
    logsFromTab: (tab: string): string => `From the tab ${tab} - `,
    logsFromOpenTab: 'From the tab you have open now: ',
    logsWhat:
      'versions, timings and what went wrong. Not your conversation, not your file names, not your paths - and you can read the whole thing before it goes.',
    logsOnlyBug:
      'Only with a bug: the report is an account of something going wrong, and there is nothing here for it to describe.',
    seeWhat: 'See exactly what gets attached',
    send: 'Send',
    sending: 'Sending…',
    sentPartly: (note: string): string => `Sent, but not everything. ${note}`,
    sent: 'Sent. Thank you ❤️ - it goes straight to me.',
    notSent: 'It could not be sent. Nothing was lost - try again.',
    reportNote: (tab: string): string =>
      `This is the entire attachment, word for word${tab ? `, for the tab ${tab}` : ''}. It is built here, in your IDE, from what the plugin itself saw: versions, the shape of that conversation, and anything that failed. File names appear as short hashes, so the same file reads as the same file without saying which one it is.`,
    building: 'Building it…',
    copy: 'Copy',
    problems: {
      empty: 'Write a few words first.',
      tooLong: (max: number): string => `That is longer than ${max} characters.`,
      tooMany: (max: number): string => `No more than ${max} files.`,
      tooHeavy: (budget: string): string => `The files add up to more than ${budget}.`,
    },
  },

  mcp: {
    empty: 'No MCP servers configured.',
    addServer: 'ADD SERVER',
    namePlaceholder: 'name',
    commandPlaceholder: 'command, or URL for sse/http',
    refreshAll: 'Refresh all',
    refreshing: 'Refreshing…',
    add: 'Add',
    adding: 'Adding…',
    authenticate: 'Authenticate',
    opening: 'Opening…',
    reconnect: 'Reconnect',
    retry: 'Retry',
    reconnecting: 'Reconnecting…',
    remove: 'Remove',
    removing: 'Removing…',
    status: {
      connected: 'connected',
      needsAuth: 'needs authentication',
      failed: 'failed',
      pending: 'connecting…',
      disabled: 'disabled',
    },
  },

  plugins: {
    tabInstalled: 'Installed',
    tabBrowse: 'Browse',
    tabMarkets: 'Markets',
    emptyInstalled: 'No plugins installed.',
    searchPlaceholder: 'Search plugins by name or description…',
    noMarketplaces: 'No marketplaces connected.',
    noMatches: 'No matches.',
    emptyMarketplaces: 'No marketplaces configured.',
    addMarketplace: 'ADD MARKETPLACE',
    marketplacePlaceholder: 'URL, path, or owner/repo on GitHub',
    refresh: 'Refresh',
    refreshing: 'Refreshing…',
    install: 'Install',
    installing: 'Installing…',
    uninstall: 'Uninstall',
    uninstalling: 'Uninstalling…',
    enable: 'Enable',
    enabling: 'Enabling…',
    disable: 'Disable',
    disabling: 'Disabling…',
    add: 'Add',
    adding: 'Adding…',
    remove: 'Remove',
    removing: 'Removing…',
  },

  mobile: {
    pair: 'Pair',
    /** The cross beside a message waiting its turn - see the queue on the phone's thread screen. */
    removeFromQueue: 'Remove from the queue',
    /** What a tab is called before the IDE's list says otherwise - the same words the panel uses. */
    newSessionTitle: 'new session',

    sessions: {
      nothingYet: 'Nothing to show yet. Open a project in the IDE, or pair another one.',
      nonePaired: 'No IDE is paired with this phone yet. Tap Pair to add one.',
      recentlyOpened: 'Recently opened',
      projectClosed: 'Not open in the IDE right now.',
      noConversations: 'No conversations yet.',
      hidden: (n: number): string => `${n} hidden · show`,
      /** The button uncovered by swiping a conversation aside - it stops taking up a row, nothing more. */
      hide: 'Hide',
      pastConversations: 'Past conversations',
      newChat: 'New chat',
      /** On a project the IDE has closed: the tap opens the project as well as starting something in it. */
      openAndStart: 'Open & start',
      /** The band at the top: everything stopped waiting for a person, out of its project. */
      waitingForYou: 'Waiting for you',
      answer: 'Answer',
      /** The corner of a project's card: what is stopped, else what is merely open. */
      countWaiting: (n: number): string => `${n} waiting`,
      countOpen: (n: number): string => `${n} open`,
      /** What a stopped conversation is stopped for, in the two words the band has room for. */
      kind: {
        permission: 'Permission',
        question: 'Question',
        plan: 'Plan',
        unknown: 'Waiting',
      },
      /**
       * The line under a conversation's title - what it is doing.
       *
       * The times beside them are two different kinds and are added by the row: work in progress is
       * measured ("2m 40s") because the question is how long it has been going, work that is over is
       * named ("14:02") because the question is when it stopped.
       */
      state: {
        crashed: 'stopped - the process died',
        waiting: 'waiting on you',
        waitingPermission: 'waiting on you · permission',
        waitingQuestion: 'waiting on you · question',
        waitingPlan: 'waiting on you · plan',
        working: 'working',
        done: 'done',
      },
      /** Why the list looks the way it does - said about the phone's whole situation. */
      reach: {
        connecting: 'Connecting…',
        asleep: 'Connected to the relay, but no IDE is answering.',
        elsewhere: 'Also open in another tab or in the installed app - that copy holds the connection.',
        reconnecting: 'Reconnecting… the list below may be out of date.',
        offline: 'Cannot reach the relay. Nothing is lost - this comes back on its own.',
      },
      /** The same thing said about one IDE. */
      agent: {
        connecting: 'connecting…',
        asleep: 'not answering',
        elsewhere: 'open elsewhere',
        reconnecting: 'reconnecting…',
        offline: 'offline',
      },
    },

    history: { title: 'History', empty: 'No past conversations in this project yet.' },

    decision: {
      planWaiting: 'A plan is waiting',
      questionOf: (n: number, total: number): string => `Question ${n} of ${total}`,
      nothingWaiting: 'Nothing is waiting for you here any more.',
      openConversation: 'Open the conversation',
      allowOnce: 'Allow once',
      deny: 'Deny',
    },

    thread: {
      loading: 'Loading the conversation…',
      waitingPerm: 'Permission needed - answer it',
      waitingAsk: 'A question is waiting - answer it',
      waitingPlan: 'A plan is waiting - decide',
      /** Asked before a subagent or a background command is killed - it cannot be undone. */
      stopAgent: (what: string): string => `Stop ${what}?`,
    },

    /** The side menu, behind the burger on the first screen. */
    drawer: {
      menu: 'Menu',
      projects: 'Projects',
      tasks: 'Tasks & agents',
      mcp: 'MCP servers',
      plugins: 'Plugins',
      accounts: 'Claude accounts',
      pair: 'Pair an IDE',
      /** Only on an IDE that has stopped answering - see the note on the row. */
      forget: 'Forget',
      waiting: (n: number): string => `${n} waiting`,
      live: (n: number): string => `${n} live`,
      sealed: 'Sealed between your IDE and this phone.',
    },

    /**
     * The rounds of work a project has written down, and the one that may be going (see ScenarioDesk).
     *
     * Almost everything this screen says is borrowed from the panel's own scenario words - the same
     * states, the same clocks, the same verdicts - because two sets of words for one thing are two
     * things to keep in step. What is here is what is true on a phone and nowhere else.
     */
    scenarios: {
      /** Over the card of the run that is happening right now. */
      running: 'RUNNING NOW',
      nothingRunning: 'Nothing is running in this project right now.',
      none: 'No rounds of work have been written down in this project.',
      /** What is deliberately not here, said once at the foot of the screen rather than on dead buttons. */
      deskNote: 'Scenarios are written, started and put on a clock at the desk. From here you can watch a run, answer what it asks and stop it.',
    },

    /** The strip of tabs above the feed, and the sheet behind it. */
    tabs: {
      title: 'Conversations',
      note: 'A fork keeps its group: the color bar and the indent say which conversation it grew out of. Reordering stays at the desk.',
    },

    /** The task list, the subagents and the background commands of one conversation. */
    tasks: {
      title: 'Tasks & agents',
      label: 'Task list',
      doneOf: (done: number, total: number): string => `${done} / ${total} done`,
      running: 'RUNNING',
      agents: 'Agents',
      agent: 'Subagent',
      background: 'Background',
      nothing: 'Nothing is running in this conversation.',
      agentGone: 'This agent is no longer in the conversation on screen.',
    },

    /** How the turn on screen runs - the sheet behind the chip beside the two rings. */
    run: {
      title: 'How this turn runs',
      subtitle: 'applies to this conversation only',
      apply: 'Apply',
      locked: 'locked',
      inForce: 'in force right now',
      modeNote:
        'This conversation was started at the desk, and somebody may be sitting in front of it - so its permission mode is not reachable from here. A conversation you start from the phone begins in any mode you pick.',
    },

    /** One message's own actions, behind the three dots on its card. */
    message: {
      title: 'This message',
      quote: 'Quote into my next message',
      fork: 'Fork from here',
      forkHint: 'A new conversation with everything up to this point.',
      copy: 'Copy',
      pin: 'Pin over the feed',
      unpin: 'Unpin',
      pinsFull: 'Three are already pinned - unpin one first.',
    },

    /** The MCP servers of the project on screen. */
    mcp: {
      /** A sign-in ends in a browser on the machine with the IDE - see the screen's own note. */
      addServer: 'Add a server',
      atDesk: 'At the desk',
      removeAsk: (name: string): string =>
        `Remove ${name}? The conversation restarts to pick that up, and whatever is running in it stops.`,
      restartNote:
        'A server is read at launch, so the conversation restarts to pick it up - whatever is running in it stops.',
      deskNote:
        'Signing a server in stays at the desk: Claude Code catches the browser’s answer on that machine, so a sign-in begun here would end nowhere.',
    },

    /** The plugins of the project on screen - read only. */
    plugins: {
      tabs: { installed: 'Installed', browse: 'Browse', markets: 'Markets' },
      readOnly:
        'Installing a plugin and switching one off stay at the desk - they run somebody else’s code on that machine. What this is for is seeing which skills and commands a conversation actually has.',
      noneInstalled: 'No plugins installed.',
      nothingFound: 'Nothing matches.',
      noMarkets: 'No marketplaces connected.',
      search: 'Search the catalogue',
      on: 'on',
      off: 'off',
      trimmed: 'The catalogue is cut to what one message can carry - the rest is at the desk.',
    },

    /** Which Claude account pays for the work. */
    accounts: {
      subtitle: 'which subscription pays for the work',
      paying: 'Paying for this conversation',
      none: 'Only the sign-in Claude Code already had.',
      switchAsk: (name: string): string =>
        `Work on ${name} from now on? Every open conversation on that machine moves onto it, and a turn in the middle of running is stopped.`,
      switchNote:
        'Switching moves every open conversation on that machine onto the new account and stops any turn mid-run.',
      addNote:
        'Adding an account and authorizing Claude Design stay at the desk: both open a terminal and a browser sign-in on that machine.',
      forgetAsk: (name: string): string =>
        `Forget ${name}? Its credential is removed from that machine - the account itself is untouched, and signing in again brings it back.`,
      logoutAsk:
        'Sign out of Claude Code? This revokes the credential at Anthropic - every machine you are signed in on goes with it.',
    },

    newSession: {
      title: 'New conversation',
      asConfigured: 'As configured',
      asConfiguredSub: 'However Claude Code is set up on that machine.',
      model: 'Model',
      effort: 'Effort',
      mode: 'Mode',
      closedProject: 'This project is closed - the IDE will open it before starting.',
      start: 'Start',
      opening: 'Opening the project…',
    },

    pairing: {
      title: 'Pair with an IDE',
      fromCode: 'Pairing with the IDE that showed this code. It is now asking someone at the machine to allow it.',
      how: 'In the IDE, open the panel’s menu → Remote access → Pair a device. Scan the code with the camera, or type it in below.',
      fingerprintAsk: 'The IDE is showing a fingerprint. Allow it only if it reads:',
      fingerprintNote: 'The IDE will then ask you to confirm, and show a fingerprint. This app will show the same one - allow it only if they match.',
      waiting: 'Waiting for the IDE…',
      done: 'Paired.',
      failed: 'Pairing did not work.',
      notACode: 'That does not look like a pairing code.',
      iphone: 'An iPhone',
      ipad: 'An iPad',
      android: 'An Android phone',
      browser: 'A browser',
    },

    composer: {
      commands: 'Commands',
      closeList: 'Close the list',
      usageLimits: 'Usage limits',
      removeImage: (name: string): string => `Remove ${name}`,
      say: 'Say something…',
      reconnecting: 'Reconnecting…',
      slash: 'Slash commands',
      attachPhoto: 'Attach a photo',
      voice: 'Dictate',
      voiceStop: 'Stop dictating',
      stop: 'Stop',
      send: 'Send',
      queue: 'Queue',
      /** The row that appears only while a turn is running. */
      running: 'running',
      queued: (n: number): string => `${n} queued`,
      dropQuote: 'Remove the quote',
      whatTravels: 'What travels between your IDE and this phone',
      projectFiles: 'Project files',
      ofTotal: (shown: number, total: number): string => `${shown} of ${total}`,
      photosDropped: (n: number): string => `${n} more would not fit in one message - send these first.`,
      photoTooBig: 'That would not fit in one message. Try one photo at a time.',
    },

    limits: {
      title: 'Limits and context',
      fiveHourWindow: 'Five-hour window',
      weeklyWindow: 'Weekly window',
      paceNote: (percent: number): string =>
        `The dim arc is an even pace: ${percent}% of the week is already “due” by today. While the bright arc is shorter than it, the week is on plan.`,
      context: 'This conversation’s context',
      ofTotal: (used: string, total: string): string => `${used} of ${total}`,
      spentToday: 'Spent today',
      acrossProjects: 'across every project',
      noWindows: 'The IDE has not reported the subscription windows yet.',
      extraUsage: 'Extra usage',
      extraUsed: (window: string): string =>
        `${window ? `the ${window} limit` : 'the limit'} is used up, billed on top of the plan`,
      resetUnknown: 'reset time unknown yet',
      resetsIn: (left: string): string => `resets in ${left}`,
    },
  },

  status: {
    todayTokens: 'Tokens spent today, across all projects',
    openPr: 'Open pull request in browser',
    noPr: 'no PR',
    effortHint: (effort: string): string => `Reasoning effort: ${effort}`,
    modelHint: (model: string): string => `Model: ${model}`,
    /** The CLI moved the conversation to another model by itself - see SwitchItem. */
    modelHintSwitched: (model: string, from: string): string =>
      `Model: ${model} - Claude Code switched to it on its own, off ${from}`,
    modeHint: (mode: string): string => `Permission mode: ${mode}`,
    sessionLimit: '5-hour limit',
    weekLimit: 'Weekly limit',
    windowUsed: (title: string, percent: number): string => `${title}: ${percent}% used`,
    /**
     * The figure itself - "2h 15m", "3d 4h" - is written the same way in every language on purpose: it is
     * a reading off a dial rather than a sentence, and it stands in tiles measured to the character.
     */
    resetsIn: (left: string): string => `Resets in ${left}`,
    paceBudget: (percent: number): string => `Dim ring: ${percent}% even-pace budget for today`,
    extraUsage: (limit: string): string => `Extra usage: ${limit} is used up, the work is billed on top of the plan`,
    extraSpent: (percent: number): string => `${percent}% of the monthly extra usage spent`,
    limitNamed: (window: string): string => `the ${window} limit`,
    limitUnnamed: 'the limit',
  },

  limits: {
    fiveHour: '5-hour',
    weekly: 'weekly',
    weeklyOpus: 'weekly Opus',
    weeklySonnet: 'weekly Sonnet',
    weeklyApps: 'weekly apps',
    weeklyWithExtra: 'weekly, extra usage included',
    extra: 'extra usage',
  },

  permission: {
    label: 'PERMISSION',
    decisions: { once: 'Allow once', always: 'Always allow', deny: 'Deny' },
    /** Which permission mode the question was asked under - `mode` is the short caption of that mode. */
    underMode: (mode: string): string => `${mode} mode`,
  },

  selectors: {
    model: 'MODEL',
    effort: 'EFFORT',
    /**
     * One word rather than "PERMISSION MODE". The label is the widest fixed thing on the button, and
     * eleven columns of it bought nothing: the value beside it already names the mode, and the hover
     * tooltip says "Permission mode:" in full. Those columns are what made the three selectors wrap onto
     * a second line in an ordinary panel.
     */
    mode: 'MODE',
    /** A key nothing else on screen names. The word is the keyboard's, not ours - it stays as it is. */
    modeHint: 'shift+tab',
  },

  commands: {
    resume: 'open a past conversation of this project',
    fork: 'continue this conversation in a new tab',
    login: 'sign in to Claude Code in the IDE terminal',
    logout: 'sign out - opens the IDE terminal',
    designLogin: 'authorize Claude Design in the IDE terminal',
    model: 'switch the model for this session',
    effort: 'set how long Claude thinks before acting',
    context: 'what fills the context window right now',
    cost: 'spend and usage windows of this session',
    usage: 'subscription windows and when they reset',
    codeReview: 'review a pull request',
  },
}

/**
 * The shape every dictionary has to have.
 *
 * Deliberately `typeof en` rather than a hand-written interface: a hand-written one is a second thing to
 * keep in step, and the day it drifts from the English file it stops checking anything.
 */
export type Dict = typeof en
