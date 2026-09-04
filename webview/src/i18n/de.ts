import type { Dict } from './en'

/**
 * Deutsch. Übersetzung des englischen Wörterbuchs (siehe en.ts), kein eigener Text.
 *
 * Geduzt wird, wie im Original. Produktnamen (Claude Code, MCP, Opus, Sonnet, Haiku, Git, PR) und die
 * Namen der CLI-Werkzeuge bleiben unübersetzt. Der Gedankenstrich des Originals ist ein Bindestrich mit
 * Leerzeichen und bleibt hier genauso.
 *
 * Deutsch läuft rund 30 % länger als Englisch, und die Seitenleiste ist 350 Pixel breit: Zeilen, die
 * dort stehen (Menüeinträge, Kurzbezeichnungen der Modi), sind bewusst knapp gehalten.
 */
export const de: Dict = {
  common: {
    back: 'Zurück',
    close: 'Schließen',
    closeMenu: 'Menü schließen',
    loading: 'Wird geladen…',
    muted: 'stumm',
    countOn: (n) => `${n} an`,
  },

  menu: {
    titles: {
      menu: { title: 'MENÜ', hint: 'alles, was das Panel aus dem Weg räumt' },
      history: { title: 'VERLAUF', hint: 'frühere Gespräche dieses Projekts' },
      mcp: { title: 'MCP-SERVER', hint: 'Status · anmelden · neu verbinden' },
      plugins: { title: 'PLUGINS', hint: 'installiert · stöbern · Marktplätze' },
      settings: { title: 'EINSTELLUNGEN', hint: 'wie sich das Panel verhält und wie es klingt' },
      sounds: { title: 'SIGNALTÖNE', hint: 'wenn das Panel nach dir ruft' },
      remote: { title: 'FERNZUGRIFF', hint: 'Status · Relay · gekoppelte Geräte' },
      remoteAbout: { title: 'WAS DAS HAUS VERLÄSST', hint: 'lies das, bevor du es einschaltest' },
      defaultMode: { title: 'STANDARDMODUS', hint: 'womit neue Tabs starten' },
      composerLayout: { title: 'LAYOUT DES EINGABEFELDS', hint: 'wo das Eingabefeld sitzt' },
      pasteCollapse: { title: 'EINGEFÜGTER TEXT', hint: 'wann eine Einfügung zum Chip wird' },
      sendKey: { title: 'NACHRICHT SENDEN', hint: 'welche Taste sendet' },
      improvePrompt: { title: 'PROMPT VERBESSERN', hint: 'worum der Stern-Button bittet' },
      voice: { title: 'SPRACHEINGABE', hint: 'diktieren statt tippen' },
      voiceLanguage: { title: 'GESPROCHENE SPRACHE', hint: 'worauf das Diktat hört' },
      voiceDevice: { title: 'MIKROFON', hint: 'über welches gehört wird' },
      language: { title: 'SPRACHE', hint: 'welche Sprache das Panel spricht' },
      accounts: { title: 'CLAUDE-KONTEN', hint: 'welches Abo die Arbeit bezahlt' },
      feedback: { title: 'FEEDBACK', hint: 'ein Bug, eine Idee oder einfach hallo' },
      feedbackLog: { title: 'WAS MITGESCHICKT WIRD', hint: 'der ganze Bericht, bevor er geht' },
    },

    groups: {
      author: 'VOM AUTOR',
    },

    rows: {
      history: { label: 'Verlauf', sub: 'Frühere Gespräche dieses Projekts' },
      statistics: { label: 'Statistik', sub: 'Stunden, Gewohnheiten, Erfolge' },
      mcp: { label: 'MCP-Server', sub: 'Status, Anmeldung, Neuverbindung' },
      plugins: { label: 'Plugins', sub: 'Installiert, stöbern, Marktplätze' },
      remote: { label: 'Fernzugriff', sub: 'Status, Relay, gekoppelte Geräte' },
      accounts: { label: 'Claude-Konten', sub: 'Wechseln, ohne dich abzumelden' },
      settings: { label: 'Einstellungen', sub: 'Töne, Modus, Layout, Sprache' },
      feedback: { label: 'Feedback senden', sub: 'Ein Bug, eine Idee oder einfach hallo' },
    },

    author: {
      title: 'Steht ein Vorstellungsgespräch an?',
      body: 'Ich habe einen KI-Assistenten dafür gebaut. Kostenlos ausprobieren - und mich unterstützen. Danke',
      tagline: 'Interview-Copilot in Echtzeit',
    },

    footer: 'Amazing Claude Code GUI',
  },

  settings: {
    rows: {
      sounds: { label: 'Signaltöne', sub: 'Wenn das Panel nach dir ruft' },
      defaultMode: { label: 'Standardmodus', sub: 'Womit neue Tabs starten' },
      composerLayout: { label: 'Layout des Eingabefelds', sub: 'Wo das Eingabefeld sitzt' },
      pasteCollapse: { label: 'Eingefügter Text', sub: 'Wann eine Einfügung zum Chip wird' },
      sendKey: { label: 'Nachricht senden', sub: 'Welche Taste sendet' },
      improvePrompt: { label: 'Prompt verbessern', sub: 'Worum der Stern-Button bittet' },
      voice: { label: 'Spracheingabe', sub: 'Diktieren mit deinem eigenen Deepgram-Schlüssel' },
      language: { label: 'Sprache', sub: 'Welche Sprache das Panel spricht' },
    },

    improveSummary: { builtIn: 'Standard', custom: 'Eigener' },
  },

  language: {
    note: 'Nur das Panel. In welcher Sprache Claude antwortet, ist eine Einstellung von Claude Code selbst - geteilt mit dem Terminal - und die bleibt hier unangetastet.',
    followIde: 'Automatisch',
    followIdeSub: (language) => `Der IDE folgen - derzeit ${language}`,
    followIdeUnknown: 'Der IDE folgen',
  },

  sounds: {
    turnFinished: { label: 'Durchgang fertig', hint: 'Claude hat geantwortet und wartet auf dich' },
    permission: { label: 'Berechtigung gefragt', hint: 'ein Werkzeugaufruf braucht dein Ja' },
    question: { label: 'Frage gestellt', hint: 'Claude bittet dich, eine Antwort zu wählen' },
    plan: { label: 'Plan fertig', hint: 'ein Plan wartet auf deine Zustimmung' },
    rateLimit: { label: 'Limit erreicht', hint: 'das Limit des Abos hat den Durchgang gestoppt' },
    extraUsage: {
      label: 'Zusatznutzung beginnt',
      hint: 'das Kontingent ist aufgebraucht - ab hier wird die Arbeit extra abgerechnet',
    },
    trouble: { label: 'Etwas ist kaputt', hint: 'ein Fehler, ein toter Prozess oder eine abgemeldete Sitzung' },
    play: 'Anhören',
    playNamed: (sound) => `Anhören: ${sound}`,
    volumeOf: (sound) => `Lautstärke: ${sound}`,
  },

  history: {
    empty: 'Hier gibt es noch keine früheren Gespräche.',
    today: 'HEUTE',
    earlier: 'FRÜHER',
    messages: (n) => (n === 1 ? `${n} Nachricht` : `${n} Nachrichten`),
  },

  search: {
    title: 'Suche',
    button: 'In den Unterhaltungen suchen',
    tabs: { chat: 'Dieser Chat', project: 'Alle Chats', ai: 'Claude fragen' },
    placeholder: 'Wörter, oder ein Satz „in Anführungszeichen“…',
    aiPlaceholder: 'Beschreibe, was du suchst: worum es ging, ungefähr wann…',
    aiNote: 'Claude liest die Unterhaltungen dieses Projekts · ein eigener Lauf, zählt auf dein Kontingent',
    find: 'Suchen',
    cancel: 'Abbrechen',
    retry: 'Erneut versuchen',
    copy: 'Kopieren',
    openInChat: 'Im Chat öffnen',
    aiSearching: 'Lese die Unterhaltungen…',
    noChat: 'Dieser Tab hat noch keine Unterhaltung - versuch es mit allen Chats.',
    typeToSearch: 'Die Treffer erscheinen hier.',
    aiEmpty: 'Beschreibe es oben und drücke Suchen.',
    nothing: 'Nichts gefunden.',
    nothingHere: 'Nichts in diesem Chat.',
    aiNothing: 'Das Modell hat nichts Passendes gefunden.',
    results: (n) => (n === 1 ? '1 Treffer' : `${n} Treffer`),
    inChats: (n, chats) => `${n} in ${chats === 1 ? '1 Chat' : `${chats} Chats`}`,
    showing: (shown, total) => `${shown} von ${total} werden gezeigt`,
    places: (n) =>
      n === 1 ? '1 Stelle, auf die das Modell zeigt' : `${n} Stellen, auf die das Modell zeigt`,
    you: 'Du',
    more: 'Ganze Nachricht anzeigen',
    less: 'Weniger anzeigen',
    clear: 'Leeren',
    matchCase: 'Groß-/Kleinschreibung beachten',
    wholeWords: 'Nur ganze Wörter',
    chars: (shown, total) => `${shown} von ${total} Zeichen`,
    failed: 'Die Suche ist fehlgeschlagen.',
    failedLabel: 'FEHLGESCHLAGEN',
    steps: {
      grep: (subject) => `nach „${subject}“ gesucht`,
      read: (subject) => `„${subject}“ gelesen`,
      list: 'die Liste der Unterhaltungen gelesen',
      other: 'die Dateien durchgesehen',
      count: (n) => (n === 1 ? '1 Schritt' : `${n} Schritte`),
    },
    capsule: {
      reopen: 'Zurück zur Suche',
      close: 'Suche schließen',
      loading: 'Nachricht wird gesucht…',
      missing: 'nicht unter den geladenen Nachrichten',
      previous: 'Vorheriger Treffer in diesem Chat',
      next: 'Nächster Treffer in diesem Chat',
    },
  },

  composerLayout: {
    bottom: 'Standard',
    compact: 'Kompakt',
    left: 'Links',
    right: 'Rechts',
  },

  pasteCollapse: {
    note: 'Ein langer Einfügetext wird zu einem Chip, damit eine Textwand das Eingabefeld nicht füllt. Die Zeilen werden so gezählt, wie sie im Feld selbst fallen würden - Text, der als eine endlose Zeile eingefügt wird, klappt also auch zusammen. Verloren geht dabei nichts: Ein eingeklappter Einfügetext behält den ganzen Text und klappt über die Stiftschaltfläche wieder ins Feld auf.',
    never: 'Nie zusammenfalten',
    neverSub: 'Alles Eingefügte bleibt als gewöhnlicher Text im Feld',
    from: (lines) => `Ab ${lines} Zeilen`,
    foldLabel: 'Lange Einfügungen zusammenfalten',
    foldSub: (min, max) => `Ab wie vielen Zeilen - ${min} bis ${max}`,
  },

  sendKey: {
    note: 'Welche Taste die Nachricht losschickt. Die andere bricht die Zeile um - eine Nachricht aus mehreren Absätzen wird also in beiden Fällen mit derselben Taste getippt.',
    enter: 'Enter',
    enterSub: 'Shift+Enter bricht die Zeile um',
    modEnter: (mod: string): string => `${mod}+Enter`,
    modEnterSub: 'Enter bricht die Zeile um',
  },

  improvePrompt: {
    note: 'Der Stern-Button neben der Büroklammer schreibt um, was im Eingabefeld steht. Darum bittet er. Das geht als eigener Lauf von Claude Code hinaus - ohne Werkzeuge, ohne Dateien, ohne Gespräch - und zählt wie jede andere Nachricht auf dein Kontingent.',
    label: 'ANWEISUNGEN',
    emptyMeans: 'Leer bedeutet den grauen Text oben - den, mit dem der Button ab Werk arbeitet.',
    builtInLanguage:
      'Er ist auf Englisch, weil er eine Anweisung an das Modell ist und nicht Teil der Oberfläche: er bittet bereits um eine Antwort in der Sprache des Entwurfs. Deiner darf in jeder Sprache stehen.',
    editBuiltIn: 'Eingebauten Text bearbeiten',
    backToBuiltIn: 'Zurück zum eingebauten Text',
  },

  voice: {
    note: 'Taste halten und sprechen - die Wörter landen im Eingabefeld, während du sie sagst. Es läuft über deinen eigenen Deepgram-Schlüssel: der Ton geht zu Deepgram und sonst nirgendwohin, das Plugin hat keinen Server dazwischen.',
    off: 'Aus',
    enable: 'Spracheingabe',

    key: 'DEEPGRAM-API-SCHLÜSSEL',
    keyPlaceholder: 'Schlüssel einfügen',
    keySet: (tail: string): string => `Schlüssel gespeichert, endet auf ${tail}`,
    keySave: 'Speichern',
    keyForget: 'Diesen Schlüssel vergessen',

    balanceLeft: (amount: string): string => `${amount} auf dem Konto übrig`,
    balanceChecking: 'Deepgram wird gefragt…',
    balanceNoKey: 'Noch kein Schlüssel.',
    balanceNoAccess: 'Der Schlüssel funktioniert. Für das Guthaben braucht es einen Schlüssel mit der Rolle Owner oder Admin.',
    balanceRejected: 'Deepgram kennt diesen Schlüssel nicht.',
    balanceFailed: 'Deepgram war nicht erreichbar. Netzwerk prüfen und erneut versuchen.',
    balanceRefresh: 'Aktualisieren',

    getKey: 'Noch kein Schlüssel?',
    getKeyHint: 'Registriere dich auf deepgram.com und erstelle einen API-Key. 200 $ Guthaben ohne Karte.',
    openSite: 'deepgram.com öffnen',

    hotkeys: 'TASTENKÜRZEL',
    push: 'Halten und sprechen',
    pushHint: 'Nimmt auf, solange du hältst, und hört beim Loslassen auf.',
    hold: 'Hände frei',
    holdHint: 'Ein Druck startet, der nächste beendet.',
    keyboard: 'TASTE',
    mouse: 'MAUS',
    record: 'Festlegen',
    recording: 'Taste drücken…',
    recordingMouse: 'Maustaste drücken…',
    notSet: 'Nicht belegt',
    clear: 'Löschen',
    sideLeft: 'Links',
    sideRight: 'Rechts',
    badButton: 'Nur die Seitentasten der Maus taugen dafür - die drei Haupttasten bedeuten in der IDE überall schon etwas.',

    language: 'Gesprochene Sprache',
    languageHint: 'Worauf das Diktat hört',
    searchLanguages: 'Sprache suchen…',
    multiHint: 'Mehrsprachig folgt einem Sprachwechsel mitten im Satz. Gegen eine benannte Sprache gemessen schneidet es in beiden Fällen schlechter ab - nimm es nur, wenn du wirklich zwei Sprachen in einem Satz mischst.',

    device: 'Mikrofon',
    deviceHint: 'Über welches gehört wird',
    deviceDefault: 'Systemstandard',
    deviceDefaultHint: 'Folgt dem, was das System eingestellt hat',
    deviceNote: 'Die Änderung gilt ab dem nächsten Diktat.',

    promo: {
      title: 'Gefällt dir das Diktieren hier?',
      body: 'Halte eine Taste gedrückt und sprich auch in jedem anderen Fenster - meine andere App schreibt deine Stimme dorthin, wo du gerade bist. Melde dich jetzt an, dann bleibt es für dich kostenlos.',
      tagline: 'Diktieren für Mac und Windows',
    },

    errorNoKey: 'Zuerst einen Deepgram-Schlüssel hinterlegen - Einstellungen, dann Spracheingabe.',
    errorNoKeyRemote: 'Auf dem Rechner, auf dem dieses Gespräch läuft, liegt kein Deepgram-Schlüssel - dort hinterlegen, in den Einstellungen unter Spracheingabe.',
    errorOff: 'Auf dem Rechner, auf dem dieses Gespräch läuft, ist die Spracheingabe aus - dort in den Einstellungen einschalten.',
    errorMicrophone: 'Das Mikrofon ließ sich nicht öffnen. Vielleicht hält es gerade eine andere Anwendung.',
    errorKey: 'Deepgram hat den Schlüssel abgelehnt. Prüfe ihn im Bildschirm Spracheingabe.',
    errorNetwork: 'Deepgram war nicht erreichbar. Netzwerk prüfen und erneut versuchen.',
    errorGeneral: 'Das Diktat wurde abgebrochen. Versuch es noch einmal.',
  },

  modes: {
    manual: {
      label: 'Nach Erlaubnis fragen',
      sub: 'Liest frei, fragt vor jedem Schreibvorgang und jedem Befehl.',
      short: 'Fragen',
    },
    acceptEdits: {
      label: 'Änderungen annehmen',
      sub: 'Nimmt Dateiänderungen im Arbeitsverzeichnis selbst an. Bei der Shell fragt es weiterhin.',
      short: 'Annehmen',
    },
    plan: {
      label: 'Plan',
      sub: 'Recherchiert und schlägt einen Plan vor. Rührt nichts an, bis du zustimmst.',
      short: 'Plan',
    },
    auto: {
      label: 'Auto',
      sub: 'Keine Rückfragen - ein Klassifikator prüft jede riskante Aktion. Nicht bei jedem Modell.',
      short: 'Auto',
    },
    dontAsk: {
      label: 'Nicht fragen',
      sub: 'Fragt nie; verweigert alles, was nicht vorab erlaubt ist. Für Läufe ohne Aufsicht.',
      short: 'Stumm',
    },
    bypassPermissions: {
      label: 'Berechtigungen umgehen',
      sub: 'Überspringt fast jede Prüfung. Bei gefährlichem Löschen wird trotzdem gefragt. Nur in Containern und Wegwerf-VMs.',
      short: 'Umgehen',
    },
    tags: {
      default: 'Standard',
      readOnly: 'nur lesen',
      preview: 'Vorschau',
      settings: 'Einstellungen',
      danger: 'Gefahr',
    },
  },

  effort: {
    auto: { sub: 'Setzt auf den Standardaufwand des Modells für diese Sitzung zurück.' },
    ultracode: {
      sub: 'Denken auf xhigh, dazu automatische Abläufe mit mehreren Agenten, wenn die Aufgabe es verlangt.',
    },
    max: { sub: 'Alles, was es hat. Architektur und vertrackte Bugs.' },
    xhigh: { sub: 'Mehr davon, für Änderungen quer über viele Dateien.' },
    high: { sub: 'Langes Nachdenken vor dem Handeln. Änderungen über mehrere Dateien.' },
    medium: { sub: 'Ausgewogen. Guter Standard für Arbeit an Features.' },
    low: { sub: 'Denkt kaum nach. Mechanische Änderungen und schnelle Antworten.' },
    tags: { ultra: 'ultra', slow: 'langsam', default: 'Standard' },
  },

  models: {
    default: { label: 'Standard (empfohlen)', sub: 'Nimm das Modell, mit dem diese Sitzung startet.' },
    opus: { sub: 'Opus 5 · Am besten für den Alltag und komplexe Aufgaben' },
    opus1m: {
      label: 'Opus (1M Kontext)',
      sub: 'Opus 5 mit 1M Kontext · Für lange Sitzungen in großen Codebasen',
    },
    sonnet: { sub: 'Sonnet 5 · Sparsam bei Routineaufgaben' },
    sonnet1m: {
      label: 'Sonnet (1M Kontext)',
      sub: 'Sonnet 5 mit 1M Kontext · Für lange Sitzungen in großen Codebasen',
    },
    haiku: { sub: 'Haiku 4.5 · Am schnellsten bei kurzen Antworten' },
    opusplan: { label: 'Opus im Plan-Modus', sub: 'Opus im Plan-Modus, sonst Sonnet' },
    unavailable: 'nicht verfügbar',
    /** The line under a model the agent moved to by itself - see modelMenu. */
    switchedItself: 'Claude Code ist von sich aus auf dieses Modell gewechselt.',
  },

  composer: {
    placeholder: 'Frag etwas, oder beschreib eine Änderung…',
    placeholderPlan: 'Beschreib, was geplant werden soll…',
    attach: 'Dateien oder Ordner anhängen',
    slash: 'Slash-Befehle',
    improve: 'Prompt verbessern',
    improveAgain: 'Noch ein Versuch, aus dem, was du geschrieben hast',
    restore: 'Zurück zu deinen Worten',
    stop: 'Stopp',
    forceStop: 'Reagiert nicht · Hart stoppen',
    forceStopHint: 'Claude bestätigt den Stopp nicht',
    queue: 'Einreihen',
    queueHint: 'Geht raus, sobald der laufende Durchgang fertig ist',
    send: 'Senden',
    run: 'Ausführen',
    runHint: 'Läuft in deiner Shell - Claude sieht die Ausgabe mit deiner nächsten Nachricht',
    improveEmpty: 'Claude Code hat nichts zurückgegeben, was ins Feld passen würde.',
    improveChanged: 'Der Entwurf hat sich während des Umschreibens geändert, also blieb er unangetastet.',
    improveTerminal: 'Ein Terminal-Befehl wird nicht umgeschrieben',
    voice: 'Diktieren',
    voiceStop: 'Diktat beenden',
  },

  header: {
    idle: 'Ruhe',
    running: 'Claude arbeitet',
    done: 'Durchgang fertig',
    attention: 'Wartet auf dich',
    crashed: 'Die Sitzung ist unerwartet abgebrochen',
    statistics: 'Statistik',
    closeStatistics: 'Statistik schließen',
    conversations: 'Gespräche',
    newSession: 'Neues Gespräch',
    menu: 'Menü',
    watchers: (n) => `${n} weitere ${n === 1 ? 'Ansicht sieht' : 'Ansichten sehen'} dieses Projekt`,
  },

  thanks: {
    button: 'Gefällt dir das Plugin? Sag Danke',
    title: 'DANKE SAGEN',
    star: 'Auf GitHub einen Stern geben',
    starSub: 'Hilft anderen, das Plugin zu finden',
    rate: 'Auf der Plugin-Seite bewerten',
    rateSub: 'Eine Rezension im JetBrains Marketplace',
    share: 'Mit Freunden teilen',
    shareSub: 'Kopiert eine Zeile darüber und den Link',
    shareCopied: 'Kopiert - füg es ein, wo du magst',
    shareText:
      'Schau dir Amazing Claude Code GUI an - Claude Code als ordentliches Panel direkt in JetBrains-IDEs: https://plugins.jetbrains.com/plugin/33255-amazing-claude-code',
  },

  login: {
    checking: 'Suche Claude Code…',
    notFound: 'Claude Code nicht gefunden',
    notFoundText:
      'Das Panel arbeitet über das claude-CLI. Wenn es installiert ist, zeig dem Panel den Weg dorthin - die IDE sieht nicht immer denselben PATH wie dein Terminal.',
    useThis: 'Diesen nehmen',
    whereLooked: 'Wo das Panel gesucht hat',
    checkAgain: 'Noch mal prüfen',
    orSwitch: 'Oder zu einem anderen Konto wechseln:',
    signIn: 'Bei Claude Code anmelden',
    signInText:
      'Angemeldet wird einmal, im Terminal der IDE: Claude öffnet einen Browser und wartet, bis du zurückkommst. Das Panel bekommt es von selbst mit.',
    logIn: 'Anmelden',
    openTerminalAgain: 'Terminal noch einmal öffnen',
    finishInTerminal: 'Schließ die Anmeldung im Terminal ab - dieser Bildschirm geht von selbst weg.',
  },

  stream: {
    waitingForYou: 'Wartet auf dich',
    waitingForSubagent: 'Wartet auf einen Subagenten',
    waitingForSubagents: (n) => `Wartet auf ${n} Subagenten`,
    thinking: 'Claude denkt nach',
    retryWaiting: (label, waited) => `${label} · wartet ${waited}`,
    withElapsed: (label, elapsed) => `${label} · ${elapsed}`,
  },

  agentTask: {
    failedBeforeFinishing: 'Fehlgeschlagen, bevor es fertig war.',
    stoppedBeforeFinishing: 'Abgebrochen, bevor es fertig war.',
    backgroundEnded: (outcome, duration) =>
      duration ? `Der Hintergrundbefehl ${outcome} nach ${duration}.` : `Der Hintergrundbefehl ${outcome}.`,
    outcomeFailed: 'ist fehlgeschlagen',
    outcomeStopped: 'wurde gestoppt',
    outcomeFinished: 'ist fertig',
    trimmed: (n) => `…${n} frühere Schritte gekürzt`,
  },

  feed: {
    empty: { title: 'Frag Claude zu diesem Projekt', hint: '@ für Dateien · / für Befehle' },
    you: 'DU',
    jumpToLatest: 'Zur neuesten Nachricht',
    copyBlock: 'Diesen Block kopieren',
    copyReply: 'Die ganze Antwort kopieren',
    copyMessage: 'Diese Nachricht kopieren - mit den Pfaden der Anhänge',
    reuse: {
      label: 'Bearbeiten und neu senden',
      hint: 'Diese Nachricht zurück ins Eingabefeld holen, um sie zu bearbeiten und neu zu senden',
      lostImages: (n: number): string =>
        n === 1
          ? 'Geht zurück ins Eingabefeld, das eingefügte Bild aber nicht - hänge es neu an'
          : `Geht zurück ins Eingabefeld, die ${n} eingefügten Bilder aber nicht - hänge sie neu an`,
    },
    pastedLines: (n) => `${n} ${n === 1 ? 'Zeile' : 'Zeilen'} eingefügt`,
    pasteClose: 'Wieder einklappen',
    copyPaste: 'Eingefügten Text kopieren',
    pasteShown: (shown, total) => `Erste ${shown} von ${total} Zeilen · kopiert wird alles`,
    fromOutput: 'aus der Ausgabe',

    think: { chip: 'DENKT', thoughts: (n) => `${n} ${n === 1 ? 'Gedanke' : 'Gedanken'}` },

    workflow: {
      agents: (n) => `${n} ${n === 1 ? 'Agent' : 'Agenten'}`,
      running: (n) => `${n} laufen`,
      done: (n) => `${n} fertig`,
      failed: (n) => `${n} fehlgeschlagen`,
      queued: 'in der Warteschlange',
      skipped: 'übersprungen',
      attempt: (n) => `Versuch ${n}`,
      cached: 'aus dem Journal',
    },

    tool: {
      running: '· läuft',
      waitingForYou: '· wartet auf dich',
      failed: '· fehlgeschlagen',
      lines: (n) => `· ${n} ${n === 1 ? 'Zeile' : 'Zeilen'}`,
      matches: (n) => (n > 0 ? `· ${n} ${n === 1 ? 'Treffer' : 'Treffer'}` : '· keine Treffer'),
      output: (empty) => (empty ? '· keine Ausgabe' : '· mit Ausgabe'),
      diff: (added, removed) => `· +${added} −${removed}`,
      moreLines: (n) => `… ${n} weitere Zeilen`,
      fewerLines: '… einklappen',
      count: (n) => `${n} ${n === 1 ? 'Werkzeug' : 'Werkzeuge'}`,
      closed: {
        replay: 'Das gespeicherte Gespräch enthält kein Ergebnis für diesen Aufruf.',
        exited: 'Claude Code hat aufgehört zu antworten, bevor das hier fertig war.',
        stopped: 'Abgebrochen, bevor es fertig war.',
        turnEnded: 'Der Durchgang endete vor diesem Aufruf.',
        untracked: 'Läuft weiter im Hintergrund - das Panel verfolgt es nicht mehr.',
      },
      closedMeta: {
        replay: '· nicht im Transkript',
        exited: '· abgebrochen',
        stopped: '· abgebrochen',
        turnEnded: '· unvollendet',
        untracked: '· losgelassen',
      },
    },

    /** The counter under a subagent's own log while it runs. */
      agentWorking: (duration) => `Arbeitet · ${duration}`,
    task: {
      /** The heading over a subagent's errand inside its card in the feed (see TaskCard). */
      errand: 'DER AUFTRAG',
      closed: {
        replay: 'Wie das ausging, steht nicht im gespeicherten Gespräch.',
        exited: 'Die Sitzung endete, bevor das hier zurückkam.',
        stopped: 'Abgebrochen, bevor es zurückkam.',
        turnEnded: 'Der Durchgang endete, bevor das hier zurückkam.',
        untracked: 'Läuft weiter - das Panel verfolgt es nicht mehr.',
      },
    },

    bash: { running: 'läuft', noOutput: 'keine Ausgabe' },

    checkpoint: {
      cleared: 'Gespräch geleert - alles darüber ist nicht mehr im Gedächtnis',
      earlier: 'frühere Nachrichten',
      notKept: 'frühere Nachrichten werden nicht mehr aufbewahrt',
      notOnPhone: 'frühere Nachrichten werden nicht ans Handy geschickt',
      loadEarlier: 'frühere Nachrichten laden',
    },

    compact: {
      label: 'KONTEXT',
      running: 'Gespräch wird verdichtet…',
      done: (manual) => `Kontext ${manual ? 'von Hand' : 'automatisch'} verdichtet`,
      doneWith: (manual, before, after, took) =>
        `${manual ? 'von Hand' : 'automatisch'}: ${before} Kontext verdichtet zu ${after ? `einer Zusammenfassung von ${after}` : 'einer Zusammenfassung'}${took ? ` in ${took}` : ''}`,
    },

    retry: {
      label: 'ERNEUT',
      reason: {
        rateLimited: 'Zu viele Anfragen',
        overloaded: 'API überlastet',
        auth: 'Anmeldung fehlgeschlagen',
        error: 'API-Fehler',
      },
      attempt: (n) => `Versuch ${n}`,
      attemptOf: (n, max) => `Versuch ${n}/${max}`,
      retryingIn: (seconds) => `neuer Versuch in ${seconds} s`,
      retrying: 'wird wiederholt…',
      recovered: (attempts) => `ging durch nach ${attempts} ${attempts === 1 ? 'Versuch' : 'Versuchen'}`,
      failed: (attempts) => `aufgegeben nach ${attempts} ${attempts === 1 ? 'Versuch' : 'Versuchen'}`,
      stopped: (attempts) => `abgebrochen nach ${attempts} ${attempts === 1 ? 'Versuch' : 'Versuchen'}`,
    },

    result: {
      worked: (duration) => (duration ? `Gearbeitet ${duration}` : 'Gearbeitet'),
      stopped: (duration) => (duration ? `Von dir gestoppt · ${duration}` : 'Von dir gestoppt'),
      movedAccount: (duration) => (duration ? `Für Kontowechsel gestoppt · ${duration}` : 'Für Kontowechsel gestoppt'),
    },

    modelSwitch: { label: 'MODELL', note: 'gewechselt von Claude Code, nicht von dir' },

    crash: {
      label: 'SITZUNG',
      text: 'Claude Code hat sich unerwartet beendet.',
      textWithCode: (code) => `Claude Code hat sich unerwartet beendet (Exit-Code ${code}).`,
    },

    limit: {
      label: 'LIMIT',
      extraLabel: 'ZUSATZNUTZUNG',
      extra: (window) =>
        `${window ? `Das ${window}Limit` : 'Das Nutzungslimit'} ist aufgebraucht - die Arbeit läuft als Zusatznutzung weiter und wird extra abgerechnet`,
      waiting: (window) => `${window ? `Das ${window}Limit` : 'Das Nutzungslimit'} ist aufgebraucht - wir warten auf den Reset`,
      resetAt: (clock, left) => `${clock} · in ${left}`,
    },

    plan: {
      label: 'PLAN FERTIG',
      steps: (n) => `· ${n} ${n === 1 ? 'Schritt' : 'Schritte'}`,
      approve: 'Zustimmen & loslegen',
      keepPlanning: 'Weiter planen',
      withdrawn: 'Der Agent wartet nicht mehr auf eine Entscheidung',
    },

    ask: {
      label: 'CLAUDE FRAGT',
      blocks: (n) => `${n} ${n === 1 ? 'Frage' : 'Fragen'} · hält den Lauf an`,
      pickAny: 'mehrere möglich',
      other: 'Anderes',
      ownAnswer: 'eigene Antwort schreiben…',
      send: 'Antworten senden',
      pickToContinue: 'Wähle etwas, um fortzufahren',
      note: 'der Lauf geht genau dort weiter, wo er gefragt hat',
      expand: 'Frage aufklappen',
      collapse: 'Frage zuklappen',
      dismiss: 'Frage schließen',
      dismissHint: 'Schließen und mit eigenen Worten antworten',
    },

    findings: {
      label: 'REVIEW',
      fixed: 'behoben',
      skipped: 'übersprungen',
      noChange: 'keine Änderung nötig',
      unconfirmed: 'unbestätigt',
    },

    copy: { copied: 'Kopiert', click: 'Zum Kopieren klicken', openFile: 'Im Editor öffnen', openFolder: 'Ordner anzeigen' },
  },

  chrome: {
    tasks: {
      label: 'AUFGABEN',
      listLabel: 'AUFGABENLISTE',
      progress: (done, total) => `${done} / ${total} erledigt`,
      collapse: 'Aufgabenliste zuklappen',
      expand: 'Restliche Aufgaben zeigen',
    },
    queue: {
      label: 'IN DER WARTESCHLANGE',
      hint: (n) => `${n} gehen der Reihe nach raus, sobald der Lauf fertig ist · zum Umsortieren ziehen`,
    },
    selection: { quote: 'Zitieren', fork: 'Ab hier abzweigen' },
    streams: {
      main: 'Haupt',
      background: 'HG',
      stopAgent: 'Diesen Agenten stoppen',
      stopAgentNamed: (name) => `Stoppen: ${name}`,
      stopAgentTitle: 'Diesen Agenten stoppen?',
      stopCommand: 'Diesen Befehl stoppen',
      stopCommandTitle: 'Diesen Befehl stoppen?',
    },
    confirm: { cancel: 'Abbrechen', stop: 'Stoppen' },
    noChats: { title: 'Freue mich auf die Zusammenarbeit!', button: "Los geht's" },
    crash: {
      title: 'Das Panel ist auf einen Fehler gelaufen',
      text: 'Neu laden ist sicher: deine Gespräche leben in den Claude-Code-Prozessen hinter dem Panel und überstehen es.',
      button: 'Panel neu laden',
    },
  },

  accounts: {
    empty: { title: 'Arbeit und privat nebeneinander', body: 'Zwischen Claude-Konten wechseln, ohne sich abzumelden. Skills, Hooks, Einstellungen und Verlauf bleiben gemeinsam.' },
    intro: 'Alles läuft auf dem hier gewählten Konto - alle offenen Chats wechseln dorthin, und einer mitten in einem Durchlauf wird dafür gestoppt.',
    unnamed: 'Anmeldung läuft…',
    defaultName: 'Claude-Code-Anmeldung',
    current: 'in Benutzung',
    signingIn: 'meldet sich an',
    use: 'Auswählen',
    switching: 'Wechsle…',
    rename: 'Umbenennen',
    save: 'Speichern',
    logout: 'Abmelden',
    logoutConfirm: 'Von Claude Code abmelden?',
    forget: 'Vergessen',
    add: 'Konto hinzufügen',
    adding: 'Warte auf die Anmeldung…',
    cancel: 'Abbrechen',
    addHint: 'Für die Anmeldung öffnet sich ein Terminal. Dein bisheriges Konto bleibt unangetastet.',
    mcpNote:
      'MCP-Server melden sich pro Konto an, ein neues authentifiziert sie also einmal. Skills, Hooks, Einstellungen und Verlauf sind gemeinsam.',
    designAuthorize: 'Claude Design autorisieren',
    designNote:
      'Claude Design meldet sich ebenfalls pro Konto an, und das kann nur ein Terminal. Es öffnet sich für das Konto, mit dem du gerade arbeitest; danach läuft DesignSync im Panel von allein.',
    aliasPlaceholder: 'Arbeit, Zuhause, ein Kunde…',
    absent: 'Keine Zugangsdaten gespeichert. Melde dich neu an, um dieses Konto zu nutzen.',
    fiveHour: '5 Std',
    weekly: 'Woche',
    row: {
      one: 'Ein Konto',
      adding: 'Anmeldung läuft…',
    },
    unavailable: {
      ignored: 'Dieses Claude Code kann zwei Anmeldungen nicht auseinanderhalten. Aktualisiere es und öffne diesen Bildschirm erneut.',
      wsl: 'Für ein Projekt in WSL nicht verfügbar: Claude Code läuft dort, nicht auf diesem Rechner.',
      not_signed_in: 'Melde dich zuerst bei Claude Code an, dann kommt hier ein zweites Konto dazu.',
      api_key: 'Dieser Rechner meldet sich mit einem API-Schlüssel an, und der gilt für jedes Gespräch. Solange er gesetzt ist, lassen sich keine Konten wechseln.',
    },
    outcome: {
      'did-not-land': 'Diese Anmeldung wurde nicht fertig, es kam also nichts dazu.',
      'no-terminal': 'Das Terminal ließ sich nicht öffnen, die Anmeldung hat also nicht begonnen.',
      'no-executable': 'Claude Code wurde auf diesem Rechner nicht gefunden.',
      'no-store': 'Für das neue Konto ließ sich kein Ordner anlegen.',
      'design-no-account': 'Das Konto, mit dem du gerade arbeitest, ließ sich nicht bestimmen - es wurde nichts geöffnet.',
      'not-supported': 'Dieses Claude Code kann zwei Anmeldungen nicht trennen, daher wurde nichts hinzugefügt.',
      'logout-failed': 'Abmelden hat nicht geklappt. Versuchen Sie es im Terminal.',
      'already-running': 'Eine Anmeldung läuft bereits.',
      unknown: 'Das hat nicht geklappt.',
    } as Record<string, string>,
  },

  remote: {
    codeLabel: 'Kopplungscode',
    states: {
      idle: { label: 'Aus', hint: 'Diese IDE ist von außen nicht erreichbar.' },
      connecting: { label: 'Verbinde…', hint: 'Erster Kontakt zum Relay.' },
      connected: { label: 'Verbunden', hint: 'Ein gekoppeltes Gerät sieht dieses Projekt.' },
      reconnecting: {
        label: 'Verbinde neu…',
        hint: 'Die Leitung ist abgerissen. Das ist normal - sie kommt von selbst zurück.',
      },
      unreachable: {
        label: 'Relay nicht erreichbar',
        hint: 'Das Relay antwortet nicht. Deine Arbeit bleibt davon unberührt, nur das Telefon nicht.',
      },
      refused: {
        label: 'Abgelehnt',
        hint: 'Das Relay wollte dieses Plugin nicht: vielleicht ist es zu alt, oder eine andere IDE hat diese Adresse belegt.',
      },
    },
    agent: (id) => `Agent ${id}`,
    thisIde: 'DIESE IDE',
    relay: 'RELAY',
    device: 'GERÄT',
    allow: 'Diese IDE aus der Ferne erreichbar machen',
    allowHint: 'Aus, bis du es einschaltest - und wieder aus, sobald du es ausschaltest.',
    relayAddress: 'RELAY-ADRESSE',
    noSafe:
      'Diese IDE soll sich keine Passwörter merken, also übersteht eine Kopplung keinen Neustart. Schalte den Passwortspeicher der IDE ein, wenn sie halten soll.',
    wantsToPair: (device) => `${device} möchte sich koppeln`,
    checkFingerprint: 'So nennt sich das Gerät selbst - prüf, ob der Fingerabdruck unten dem auf seinem Bildschirm entspricht.',
    allowDevice: 'Erlauben',
    refuse: 'Ablehnen',
    scanThis: 'Das hier mit dem Telefon scannen',
    codeNote: (left) =>
      `${left} · gilt einmal. Das Geheimnis steckt im Teil der Adresse hinter der Raute, und den schicken Browser nie an einen Server.`,
    minutesLeft: (minutes) => `noch ${minutes} Min`,
    secondsLeft: (seconds) => `noch ${seconds} s`,
    stopOffering: 'Nicht mehr anbieten',
    pairDevice: 'Gerät koppeln',
    pairedDevices: 'GEKOPPELTE GERÄTE',
    revoke: 'Entziehen',
    whatTravels: 'Was das Haus verlässt und was ein Telefon darf',
    whatTravelsSub: 'Lies das, bevor du es einschaltest',
    fingerprint: 'Der Fingerabdruck dieser IDE',
    about: {
      first:
        'Damit eingeschaltet laufen deine Gespräche über ein Relay, damit ein gekoppeltes Telefon sie lesen und beantworten kann. Dazu gehört auch, was der Agent liest und schreibt: Quellcode, Dateipfade, die Ausgabe von Befehlen.',
      second:
        'Lesen kann das Relay davon nichts - die Inhalte sind zwischen dieser IDE und deinem Telefon versiegelt. Es sieht, wann du verbunden bist und wie viel durchgeht, also ungefähr deine Arbeitszeiten. Du kannst auch ein eigenes Relay betreiben.',
      can: 'Ein gekoppeltes Telefon kann Berechtigungen beantworten, Nachrichten senden und einen Durchgang stoppen.',
      cannot:
        'Es kann keine Shell-Befehle ausführen, keine Plugins installieren, den Berechtigungsmodus nicht ändern und die Zwischenablage dieser Maschine nicht anfassen.',
      third:
        'Eine Kopplung wird durch einen Code belegt, der auf diesem Bildschirm einmal erscheint. Der Vergleich der beiden Fingerabdrücke fängt das Einzige ab, was der Code nicht kann: jemanden, der den Bildschirm fotografiert und zuerst gescannt hat.',
    },
  },

  feedback: {
    button: 'Einen Bug melden oder eine Idee schicken',
    kinds: {
      bug: { label: 'Bug', placeholder: 'Was ist passiert, und was hättest du stattdessen erwartet?' },
      idea: { label: 'Idee', placeholder: 'Was soll das Panel können?' },
      hello: { label: 'Hallo', placeholder: 'Was auch immer - das landet bei einem Menschen, nicht in einer Warteschlange.' },
    },
    email: 'E-MAIL',
    emailOptional: 'freiwillig',
    attachments: 'ANHÄNGE',
    addFiles: 'Dateien hinzufügen',
    removeFile: (name) => `Entfernen: ${name}`,
    attachTotal: (count, max, size, budget) => `${count} von ${max} · ${size} von ${budget}`,
    logs: 'Debug-Logs anhängen',
    logsFromTab: (tab) => `Aus dem Tab ${tab} - `,
    logsFromOpenTab: 'Aus dem Tab, den du gerade offen hast: ',
    logsWhat:
      'Versionen, Zeiten und was schiefging. Nicht dein Gespräch, nicht deine Dateinamen, nicht deine Pfade - und du kannst alles lesen, bevor es rausgeht.',
    logsOnlyBug:
      'Nur bei einem Bug: der Bericht erzählt von etwas, das schiefging, und hier gibt es nichts zu erzählen.',
    seeWhat: 'Genau ansehen, was mitgeschickt wird',
    send: 'Senden',
    sending: 'Wird gesendet…',
    sentPartly: (note) => `Gesendet, aber nicht alles. ${note}`,
    sent: 'Gesendet. Danke ❤️ - das kommt direkt bei mir an.',
    notSent: 'Konnte nicht gesendet werden. Nichts ist verloren - versuch es noch mal.',
    reportNote: (tab) =>
      `Das ist der ganze Anhang, Wort für Wort${tab ? `, für den Tab ${tab}` : ''}. Er wird hier gebaut, in deiner IDE, aus dem, was das Plugin selbst gesehen hat: Versionen, die Form dieses Gesprächs und alles, was fehlschlug. Dateinamen erscheinen als kurze Hashes, damit dieselbe Datei sich als dieselbe liest, ohne zu verraten, welche es ist.`,
    building: 'Wird gebaut…',
    copy: 'Kopieren',
    problems: {
      empty: 'Schreib erst ein paar Worte.',
      tooLong: (max) => `Das ist länger als ${max} Zeichen.`,
      tooMany: (max) => `Nicht mehr als ${max} Dateien.`,
      tooHeavy: (budget) => `Die Dateien machen zusammen mehr als ${budget}.`,
    },
  },

  mcp: {
    empty: 'Keine MCP-Server eingerichtet.',
    addServer: 'SERVER HINZUFÜGEN',
    namePlaceholder: 'Name',
    commandPlaceholder: 'Befehl, oder URL für sse/http',
    refreshAll: 'Alle neu laden',
    refreshing: 'Wird geladen…',
    add: 'Hinzufügen',
    adding: 'Wird hinzugefügt…',
    authenticate: 'Anmelden',
    opening: 'Wird geöffnet…',
    reconnect: 'Neu verbinden',
    retry: 'Nochmal',
    reconnecting: 'Verbinde neu…',
    remove: 'Entfernen',
    removing: 'Wird entfernt…',
    status: { connected: 'verbunden', needsAuth: 'Anmeldung nötig', failed: 'fehlgeschlagen', pending: 'verbindet…', disabled: 'deaktiviert' },
  },

  plugins: {
    tabInstalled: 'Installiert',
    tabBrowse: 'Stöbern',
    tabMarkets: 'Märkte',
    emptyInstalled: 'Keine Plugins installiert.',
    searchPlaceholder: 'Plugins nach Name oder Beschreibung suchen…',
    noMarketplaces: 'Keine Marktplätze verbunden.',
    noMatches: 'Nichts gefunden.',
    emptyMarketplaces: 'Keine Marktplätze eingerichtet.',
    addMarketplace: 'MARKTPLATZ HINZUFÜGEN',
    marketplacePlaceholder: 'URL, Pfad oder owner/repo auf GitHub',
    refresh: 'Neu laden',
    refreshing: 'Wird geladen…',
    install: 'Installieren',
    installing: 'Wird installiert…',
    uninstall: 'Deinstallieren',
    uninstalling: 'Wird deinstalliert…',
    enable: 'Aktivieren',
    enabling: 'Wird aktiviert…',
    disable: 'Deaktivieren',
    disabling: 'Wird deaktiviert…',
    add: 'Hinzufügen',
    adding: 'Wird hinzugefügt…',
    remove: 'Entfernen',
    removing: 'Wird entfernt…',
  },

  mobile: {
    pair: 'Koppeln',
    removeFromQueue: 'Aus der Warteschlange nehmen',
    newSessionTitle: 'neues Gespräch',

    sessions: {
      nothingYet: 'Noch nichts zu zeigen. Öffne ein Projekt in der IDE, oder koppel eine weitere.',
      nonePaired: 'Mit diesem Telefon ist noch keine IDE gekoppelt. Tippe auf Koppeln.',
      recentlyOpened: 'Zuletzt geöffnet',
      projectClosed: 'Gerade nicht in der IDE geöffnet.',
      noConversations: 'Noch keine Gespräche.',
      hidden: (n) => `${n} ausgeblendet · zeigen`,
      pastConversations: 'Frühere Gespräche',
      newChat: 'Neues Gespräch',
      reach: {
        connecting: 'Verbinde…',
        asleep: 'Mit dem Relay verbunden, aber keine IDE antwortet.',
        elsewhere: 'Auch in einem anderen Tab oder in der installierten App offen - die Kopie hält die Verbindung.',
        reconnecting: 'Verbinde neu… die Liste unten kann veraltet sein.',
        offline: 'Das Relay ist nicht erreichbar. Nichts geht verloren - das kommt von selbst zurück.',
      },
      agent: {
        connecting: 'verbindet…',
        asleep: 'antwortet nicht',
        elsewhere: 'woanders offen',
        reconnecting: 'verbindet neu…',
        offline: 'offline',
      },
    },

    history: { title: 'Verlauf', empty: 'In diesem Projekt gibt es noch keine früheren Gespräche.' },

    decision: {
      planWaiting: 'Ein Plan wartet',
      questionOf: (n, total) => `Frage ${n} von ${total}`,
      nothingWaiting: 'Hier wartet nichts mehr auf dich.',
      openConversation: 'Gespräch öffnen',
      allowOnce: 'Einmal erlauben',
      deny: 'Ablehnen',
    },

    thread: {
      loading: 'Gespräch wird geladen…',
      waitingPerm: 'Berechtigung nötig - beantworte sie',
      waitingAsk: 'Eine Frage wartet - beantworte sie',
      waitingPlan: 'Ein Plan wartet - entscheide',
    },

    newSession: {
      title: 'Neues Gespräch',
      asConfigured: 'Wie eingerichtet',
      asConfiguredSub: 'So, wie Claude Code auf der Maschine eingestellt ist.',
      model: 'Modell',
      effort: 'Aufwand',
      mode: 'Modus',
      closedProject: 'Dieses Projekt ist zu - die IDE öffnet es vor dem Start.',
      start: 'Starten',
      opening: 'Projekt wird geöffnet…',
    },

    pairing: {
      title: 'Mit einer IDE koppeln',
      fromCode: 'Wird mit der IDE gekoppelt, die diesen Code gezeigt hat. Sie fragt jetzt jemanden an der Maschine um Erlaubnis.',
      how: 'Öffne in der IDE das Menü des Panels → Fernzugriff → Gerät koppeln. Scanne den Code mit der Kamera, oder tippe ihn unten ein.',
      fingerprintAsk: 'Die IDE zeigt einen Fingerabdruck. Erlaube es nur, wenn dort steht:',
      fingerprintNote: 'Die IDE bittet dich dann zu bestätigen und zeigt einen Fingerabdruck. Diese App zeigt denselben - erlaube es nur, wenn beide gleich sind.',
      waiting: 'Warte auf die IDE…',
      done: 'Gekoppelt.',
      failed: 'Das Koppeln hat nicht geklappt.',
      notACode: 'Das sieht nicht nach einem Kopplungscode aus.',
      iphone: 'Ein iPhone',
      ipad: 'Ein iPad',
      android: 'Ein Android-Telefon',
      browser: 'Ein Browser',
    },

    composer: {
      commands: 'Befehle',
      closeList: 'Liste schließen',
      usageLimits: 'Nutzungslimits',
      removeImage: (name) => `Entfernen: ${name}`,
      say: 'Sag etwas…',
      reconnecting: 'Verbinde neu…',
      slash: 'Slash-Befehle',
      attachPhoto: 'Ein Foto anhängen',
      voice: 'Diktieren',
      voiceStop: 'Diktat beenden',
      stop: 'Den Lauf stoppen',
      whatTravels: 'Was zwischen deiner IDE und diesem Telefon unterwegs ist',
      projectFiles: 'Projektdateien',
      ofTotal: (shown, total) => `${shown} von ${total}`,
      photosDropped: (n) => `${n} weitere passen nicht in eine Nachricht - schick erst diese.`,
      photoTooBig: 'Das passt nicht in eine Nachricht. Versuch es mit einem Foto nach dem anderen.',
    },

    limits: {
      title: 'Limits und Kontext',
      fiveHourWindow: 'Fünf-Stunden-Fenster',
      weeklyWindow: 'Wochenfenster',
      paceNote: (percent) =>
        `Der blasse Bogen ist der gleichmäßige Takt: ${percent}% der Woche sind bis heute schon „fällig“. Solange der helle Bogen kürzer ist, liegt die Woche im Plan.`,
      context: 'Der Kontext dieses Gesprächs',
      ofTotal: (used, total) => `${used} von ${total}`,
      spentToday: 'Heute verbraucht',
      acrossProjects: 'über alle Projekte',
      noWindows: 'Die IDE hat die Fenster des Abos noch nicht gemeldet.',
      extraUsage: 'Zusatznutzung',
      extraUsed: (window) =>
        `${window ? `das ${window}Limit` : 'das Limit'} ist aufgebraucht, wird zusätzlich abgerechnet`,
      resetUnknown: 'Reset-Zeit noch unbekannt',
      resetsIn: (left) => `Reset in ${left}`,
    },
  },

  status: {
    todayTokens: 'Heute verbrauchte Tokens, über alle Projekte',
    openPr: 'Pull Request im Browser öffnen',
    noPr: 'kein PR',
    effortHint: (effort) => `Denkaufwand: ${effort}`,
    modelHint: (model) => `Modell: ${model}`,
    modelHintSwitched: (model, from) => `Modell: ${model} - Claude Code ist von ${from} aus selbst gewechselt`,
    modeHint: (mode) => `Berechtigungsmodus: ${mode}`,
    sessionLimit: '5-Stunden-Limit',
    weekLimit: 'Wochenlimit',
    windowUsed: (title, percent) => `${title}: ${percent}% verbraucht`,
    resetsIn: (left) => `Zurückgesetzt in ${left}`,
    paceBudget: (percent) => `Blasser Ring: ${percent}% gleichmäßiges Budget für heute`,
    extraUsage: (limit) => `Zusatznutzung: ${limit} ist aufgebraucht, die Arbeit wird zusätzlich abgerechnet`,
    extraSpent: (percent) => `${percent}% der monatlichen Zusatznutzung verbraucht`,
    limitNamed: (window) => `das ${window} Limit`,
    limitUnnamed: 'das Limit',
  },

  limits: {
    fiveHour: '5-Stunden-',
    weekly: 'Wochen-',
    weeklyOpus: 'wöchentliche Opus-',
    weeklySonnet: 'wöchentliche Sonnet-',
    weeklyApps: 'wöchentliche App-',
    weeklyWithExtra: 'wöchentliche, Zusatznutzung eingerechnet,',
    extra: 'Zusatznutzungs-',
  },

  permission: {
    label: 'BERECHTIGUNG',
    decisions: { once: 'Einmal erlauben', always: 'Immer erlauben', deny: 'Ablehnen' },
    underMode: (mode) => `Modus: ${mode}`,
  },

  selectors: {
    model: 'MODELL',
    effort: 'AUFWAND',
    mode: 'MODUS',
    modeHint: 'shift+tab',
  },

  commands: {
    resume: 'ein früheres Gespräch dieses Projekts öffnen',
    fork: 'dieses Gespräch in einem neuen Tab fortsetzen',
    login: 'im IDE-Terminal bei Claude Code anmelden',
    logout: 'abmelden - öffnet das IDE-Terminal',
    designLogin: 'Claude Design im IDE-Terminal autorisieren',
    model: 'das Modell für diese Sitzung wechseln',
    effort: 'einstellen, wie lange Claude vor dem Handeln nachdenkt',
    context: 'was das Kontextfenster gerade füllt',
    cost: 'Ausgaben und Nutzungsfenster dieser Sitzung',
    usage: 'Fenster des Abos und wann sie zurückgesetzt werden',
    codeReview: 'einen Pull Request prüfen',
  },
}
