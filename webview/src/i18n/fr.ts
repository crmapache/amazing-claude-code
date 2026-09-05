import type { Dict } from './en'

/**
 * Français. Traduction du dictionnaire anglais (voir en.ts), et non un texte à part.
 *
 * On tutoie, comme l'original. Les noms de produit (Claude Code, MCP, Opus, Sonnet, Haiku, Git, PR) et
 * les noms des outils du CLI ne se traduisent pas. Le tiret de l'original est un trait d'union entouré
 * d'espaces, et il le reste ici.
 *
 * Ponctuation française : espace insécable avant « : », « ! » et « ? », et guillemets français. Le
 * français est environ 20 % plus long que l'anglais - les libellés du volet latéral (350 px) restent
 * courts exprès.
 */
export const fr: Dict = {
  common: {
    back: 'Retour',
    close: 'Fermer',
    closeMenu: 'Fermer le menu',
    loading: 'Chargement…',
    muted: 'coupé',
    countOn: (n) => `${n} activés`,
  },

  menu: {
    titles: {
      menu: { title: 'MENU', hint: 'tout ce que le panneau garde de côté' },
      history: { title: 'HISTORIQUE', hint: 'conversations passées de ce projet' },
      mcp: { title: 'SERVEURS MCP', hint: 'état · connexion · reconnexion' },
      plugins: { title: 'PLUGINS', hint: 'installés · parcourir · marketplaces' },
      settings: { title: 'RÉGLAGES', hint: 'comment le panneau se comporte et comment il sonne' },
      sounds: { title: 'ALERTES SONORES', hint: 'quand le panneau t’appelle' },
      remote: { title: 'ACCÈS À DISTANCE', hint: 'état · relais · appareils appairés' },
      remoteAbout: { title: 'CE QUI SORT D’ICI', hint: 'à lire avant de l’activer' },
      defaultMode: { title: 'MODE PAR DÉFAUT', hint: 'ce avec quoi démarrent les nouveaux onglets' },
      composerLayout: { title: 'DISPOSITION DU CHAMP', hint: 'où se place le champ de saisie' },
      pasteCollapse: { title: 'TEXTE COLLÉ', hint: 'quand un collage se replie en pastille' },
      sendKey: { title: 'ENVOYER UN MESSAGE', hint: 'quelle touche envoie' },
      improvePrompt: { title: 'AMÉLIORER LE PROMPT', hint: 'ce que demande le bouton étoile' },
      voice: { title: 'SAISIE VOCALE', hint: 'dicter au lieu de taper' },
      voiceLanguage: { title: 'LANGUE PARLÉE', hint: 'ce que la dictée écoute' },
      voiceDevice: { title: 'MICROPHONE', hint: 'par lequel écouter' },
      language: { title: 'LANGUE', hint: 'la langue que parle le panneau' },
      accounts: { title: 'COMPTES CLAUDE', hint: 'quel abonnement paie le travail' },
      feedback: { title: 'RETOURS', hint: 'un bug, une idée ou juste un bonjour' },
      feedbackLog: { title: 'CE QUI EST JOINT', hint: 'le rapport entier, avant l’envoi' },
    },

    groups: {
      author: 'DE L’AUTEUR',
    },

    rows: {
      history: { label: 'Historique', sub: 'Conversations passées de ce projet' },
      statistics: { label: 'Statistiques', sub: 'Heures, habitudes, trophées' },
      mcp: { label: 'Serveurs MCP', sub: 'État, connexion, reconnexion' },
      plugins: { label: 'Plugins', sub: 'Installés, parcourir, marketplaces' },
      remote: { label: 'Accès à distance', sub: 'État, relais, appareils appairés' },
      accounts: { label: 'Comptes Claude', sub: 'Changer sans se déconnecter' },
      settings: { label: 'Réglages', sub: 'Sons, mode, disposition, langue' },
      feedback: { label: 'Envoyer un retour', sub: 'Un bug, une idée ou juste un bonjour' },
    },

    author: {
      title: 'Un entretien en vue ?',
      body: 'J’ai créé un assistant IA pour ça. Essaie-le gratuitement - et soutiens-moi. Merci',
      tagline: 'copilote d’entretien en temps réel',
    },

    footer: 'Amazing Claude Code GUI',
  },

  settings: {
    rows: {
      sounds: { label: 'Alertes sonores', sub: 'Quand le panneau t’appelle' },
      defaultMode: { label: 'Mode par défaut', sub: 'Ce avec quoi démarrent les nouveaux onglets' },
      composerLayout: { label: 'Disposition du champ', sub: 'Où se place le champ de saisie' },
      pasteCollapse: { label: 'Texte collé', sub: 'Quand un collage se replie en pastille' },
      sendKey: { label: 'Envoyer un message', sub: 'Quelle touche envoie' },
      improvePrompt: { label: 'Améliorer le prompt', sub: 'Ce que demande le bouton étoile' },
      voice: { label: 'Saisie vocale', sub: 'Dicter avec votre propre clé Deepgram' },
      language: { label: 'Langue', sub: 'La langue que parle le panneau' },
    },

    improveSummary: { builtIn: 'Intégré', custom: 'Personnalisé' },
  },

  language: {
    note: 'Le panneau seulement. La langue dans laquelle Claude répond est un réglage de Claude Code lui-même, partagé avec le terminal, et rien ici n’y touche.',
    followIde: 'Automatique',
    followIdeSub: (language) => `Suivre l’IDE - actuellement ${language}`,
    followIdeUnknown: 'Suivre l’IDE',
  },

  sounds: {
    turnFinished: { label: 'Tour terminé', hint: 'Claude a répondu et t’attend' },
    permission: { label: 'Autorisation demandée', hint: 'un appel d’outil attend ton accord' },
    question: { label: 'Question posée', hint: 'Claude te demande de choisir une réponse' },
    plan: { label: 'Plan prêt', hint: 'un plan attend ton accord' },
    rateLimit: { label: 'Limite atteinte', hint: 'la limite de l’abonnement a arrêté le tour' },
    extraUsage: {
      label: 'Usage supplémentaire',
      hint: 'le forfait est épuisé - à partir d’ici le travail est facturé en plus',
    },
    trouble: { label: 'Quelque chose a cassé', hint: 'une erreur, un processus mort ou une session déconnectée' },
    play: 'Écouter',
    playNamed: (sound) => `Écouter : ${sound}`,
    volumeOf: (sound) => `Volume : ${sound}`,
  },

  history: {
    empty: 'Aucune conversation passée ici pour l’instant.',
    today: 'AUJOURD’HUI',
    earlier: 'AVANT',
    messages: (n) => (n === 1 ? `${n} message` : `${n} messages`),
  },

  search: {
    title: 'Recherche',
    button: 'Chercher dans les conversations',
    tabs: { chat: 'Ce chat', project: 'Tous les chats', ai: 'Demander à Claude' },
    placeholder: 'Des mots, ou une phrase « entre guillemets »…',
    aiPlaceholder: 'Décrivez ce que vous cherchez : de quoi il s’agissait, à peu près quand…',
    aiNote: 'Claude lit les conversations de ce projet · un lancement à part, décompté de votre usage',
    find: 'Chercher',
    cancel: 'Annuler',
    retry: 'Réessayer',
    copy: 'Copier',
    openInChat: 'Ouvrir dans le chat',
    aiSearching: 'Lecture des conversations…',
    noChat: 'Cet onglet n’a pas encore de conversation : essayez tous les chats.',
    typeToSearch: 'Les résultats s’afficheront ici.',
    aiEmpty: 'Décrivez-le ci-dessus et appuyez sur Chercher.',
    nothing: 'Rien trouvé.',
    nothingHere: 'Rien dans ce chat.',
    aiNothing: 'Le modèle n’a rien trouvé qui convienne.',
    results: (n) => (n === 1 ? '1 résultat' : `${n} résultats`),
    inChats: (n, chats) => `${n} dans ${chats === 1 ? '1 chat' : `${chats} chats`}`,
    showing: (shown, total) => `${shown} sur ${total} affichés`,
    places: (n) =>
      n === 1 ? '1 endroit indiqué par le modèle' : `${n} endroits indiqués par le modèle`,
    you: 'Vous',
    more: 'Afficher le message entier',
    less: 'Afficher moins',
    clear: 'Effacer',
    matchCase: 'Respecter la casse',
    wholeWords: 'Mots entiers',
    chars: (shown, total) => `${shown} sur ${total} caractères`,
    failed: 'La recherche a échoué.',
    failedLabel: 'ÉCHEC',
    steps: {
      grep: (subject) => `a cherché « ${subject} »`,
      read: (subject) => `a lu « ${subject} »`,
      list: 'a lu la liste des conversations',
      other: 'a parcouru les fichiers',
      count: (n) => (n === 1 ? '1 étape' : `${n} étapes`),
    },
    capsule: {
      reopen: 'Retour à la recherche',
      close: 'Fermer la recherche',
      loading: 'Recherche du message…',
      missing: 'absent des messages chargés',
      previous: 'Correspondance précédente dans ce chat',
      next: 'Correspondance suivante dans ce chat',
    },
  },

  composerLayout: {
    bottom: 'Par défaut',
    compact: 'Compacte',
    left: 'Gauche',
    right: 'Droite',
  },

  pasteCollapse: {
    note: "Un collage long se replie en pastille pour qu'un mur de texte ne remplisse pas le champ de saisie. Les lignes sont comptées telles qu'elles tomberaient dans le champ lui-même, donc un texte collé en une seule ligne interminable se replie aussi. Rien n'est perdu dans les deux cas : un collage replié garde le texte entier et se redéploie dans le champ par le bouton crayon.",
    never: 'Ne jamais replier',
    neverSub: 'Tout ce qui est collé reste dans le champ en texte simple',
    from: (lines) => `À partir de ${lines} lignes`,
    foldLabel: 'Replier les collages longs',
    foldSub: (min, max) => `À partir de combien de lignes - ${min} à ${max}`,
  },

  sendKey: {
    note: 'Quelle touche laisse partir le message. L’autre passe à la ligne - un message écrit en plusieurs paragraphes se tape donc avec la même touche dans les deux cas.',
    enter: 'Enter',
    enterSub: 'Shift+Enter passe à la ligne',
    modEnter: (mod: string): string => `${mod}+Enter`,
    modEnterSub: 'Enter passe à la ligne',
  },

  improvePrompt: {
    note: 'Le bouton étoile, à côté du trombone, réécrit ce qui se trouve dans le champ de saisie. Voici ce qu’il demande. Cela part comme une exécution de Claude Code à part - sans outils, sans fichiers, sans conversation - et compte dans ton usage comme n’importe quel autre message.',
    label: 'INSTRUCTIONS',
    emptyMeans: 'Vide signifie le texte gris ci-dessus - celui que le bouton utilise d’origine.',
    builtInLanguage:
      'Il est en anglais parce que c’est une instruction au modèle, pas un morceau d’interface : il demande déjà une réponse dans la langue du brouillon. Le tien peut être dans n’importe quelle langue.',
    editBuiltIn: 'Modifier le texte intégré',
    backToBuiltIn: 'Revenir au texte intégré',
  },

  voice: {
    note: 'Maintenez une touche et parlez - les mots arrivent dans le champ à mesure que vous les dites. Cela passe par votre propre clé Deepgram : l’audio va chez Deepgram et nulle part ailleurs, le plugin n’a aucun serveur au milieu.',
    off: 'Désactivée',
    enable: 'Saisie vocale',

    key: 'CLÉ API DEEPGRAM',
    keyPlaceholder: 'Collez votre clé',
    keySet: (tail: string): string => `Clé enregistrée, se terminant par ${tail}`,
    keySave: 'Enregistrer',
    keyForget: 'Oublier cette clé',

    balanceLeft: (amount: string): string => `Il reste ${amount} sur le compte`,
    balanceChecking: 'Deepgram est interrogé…',
    balanceNoKey: 'Pas encore de clé.',
    balanceNoAccess: 'La clé fonctionne. Pour voir le solde, il faut une clé au rôle Owner ou Admin.',
    balanceRejected: 'Deepgram ne reconnaît pas cette clé.',
    balanceFailed: 'Impossible de joindre Deepgram. Vérifiez le réseau et réessayez.',
    balanceRefresh: 'Actualiser',

    getKey: 'Pas encore de clé ?',
    getKeyHint: 'Inscrivez-vous sur deepgram.com et créez une clé API. 200 $ de crédit sans carte.',
    openSite: 'Ouvrir deepgram.com',

    hotkeys: 'RACCOURCIS',
    push: 'Maintenir pour parler',
    pushHint: 'Enregistre tant que vous maintenez, et s’arrête au relâchement.',
    hold: 'Mains libres',
    holdHint: 'Une pression lance, la suivante arrête.',
    keyboard: 'TOUCHE',
    mouse: 'SOURIS',
    record: 'Définir',
    recording: 'Appuyez sur une touche…',
    recordingMouse: 'Appuyez sur un bouton…',
    notSet: 'Non défini',
    clear: 'Effacer',
    sideLeft: 'Gauche',
    sideRight: 'Droite',
    badButton: 'Seuls les boutons latéraux de la souris conviennent - les trois principaux veulent déjà dire quelque chose partout dans l’IDE.',

    language: 'Langue parlée',
    languageHint: 'Ce que la dictée écoute',
    searchLanguages: 'Rechercher une langue…',
    multiHint: 'Le mode multilingue suit un changement de langue en pleine phrase. Mesuré face à une langue nommée, il fait moins bien dans les deux cas - ne le choisissez que si vous mêlez vraiment deux langues dans une même phrase.',

    device: 'Microphone',
    deviceHint: 'Par lequel écouter',
    deviceDefault: 'Celui du système',
    deviceDefaultHint: 'Suit ce que le système a choisi',
    deviceNote: 'Le changement prendra effet à la prochaine dictée.',

    promo: {
      title: 'La dictée ici vous plaît ?',
      body: "Maintenez une touche et parlez dans n'importe quelle autre fenêtre : mon autre application écrit votre voix là où vous êtes. Inscrivez-vous maintenant et ce sera gratuit pour vous à vie.",
      tagline: 'dictée pour Mac et Windows',
    },

    errorNoKey: 'Ajoutez d’abord une clé Deepgram - Paramètres, puis Saisie vocale.',
    errorNoKeyRemote: 'Aucune clé Deepgram sur la machine où tourne cette conversation - ajoutez-la là-bas, dans Paramètres, Saisie vocale.',
    errorOff: 'La saisie vocale est désactivée sur la machine où tourne cette conversation - activez-la là-bas, dans Paramètres.',
    errorMicrophone: 'Le micro n’a pas pu s’ouvrir. Une autre application le retient peut-être.',
    errorKey: 'Deepgram a refusé la clé. Vérifiez-la dans l’écran Saisie vocale.',
    errorNetwork: 'Impossible de joindre Deepgram. Vérifiez le réseau et réessayez.',
    errorGeneral: 'La dictée s’est arrêtée. Réessayez.',
  },

  modes: {
    manual: {
      label: 'Demander l’autorisation',
      sub: 'Lit librement, demande avant chaque écriture et chaque commande.',
      short: 'Demande',
    },
    acceptEdits: {
      label: 'Accepter les modifications',
      sub: 'Approuve seul les modifications de fichiers dans le dossier de travail. Pour le shell, il demande toujours.',
      short: 'Accepte',
    },
    plan: {
      label: 'Plan',
      sub: 'Enquête et propose un plan. Ne touche à rien tant que tu n’as pas validé.',
      short: 'Plan',
    },
    auto: {
      label: 'Auto',
      sub: 'Aucune question - un classifieur examine chaque action risquée. Pas sur tous les modèles.',
      short: 'Auto',
    },
    dontAsk: {
      label: 'Ne pas demander',
      sub: 'Ne demande jamais ; refuse tout ce qui n’a pas été autorisé d’avance. Pour les exécutions sans surveillance.',
      short: 'Muet',
    },
    bypassPermissions: {
      label: 'Contourner les autorisations',
      sub: 'Saute presque toutes les vérifications. Les suppressions dangereuses demandent quand même. Conteneurs et VM jetables uniquement.',
      short: 'Saute',
    },
    tags: {
      default: 'par défaut',
      readOnly: 'lecture seule',
      preview: 'aperçu',
      settings: 'réglages',
      danger: 'danger',
    },
  },

  effort: {
    auto: { sub: 'Revient à l’effort par défaut du modèle pour cette session.' },
    ultracode: {
      sub: 'Raisonnement xhigh, plus des flux automatiques à plusieurs agents quand la tâche l’exige.',
    },
    max: { sub: 'Tout ce qu’il a. Architecture et bugs coriaces.' },
    xhigh: { sub: 'Encore plus, pour des changements répartis sur beaucoup de fichiers.' },
    high: { sub: 'Long raisonnement avant d’agir. Changements sur plusieurs fichiers.' },
    medium: { sub: 'Équilibré. Bon réglage par défaut pour développer une fonctionnalité.' },
    low: { sub: 'Réfléchit au minimum. Modifications mécaniques et réponses rapides.' },
    tags: { ultra: 'ultra', slow: 'lent', default: 'par défaut' },
  },

  models: {
    default: { label: 'Par défaut (recommandé)', sub: 'Utilise le modèle avec lequel démarre cette session.' },
    opus: { sub: 'Opus 5 · Le meilleur au quotidien et sur les tâches complexes' },
    opus1m: {
      label: 'Opus (contexte 1M)',
      sub: 'Opus 5 avec contexte 1M · Pour de longues sessions sur de grosses bases de code',
    },
    sonnet: { sub: 'Sonnet 5 · Économe sur les tâches de routine' },
    sonnet1m: {
      label: 'Sonnet (contexte 1M)',
      sub: 'Sonnet 5 avec contexte 1M · Pour de longues sessions sur de grosses bases de code',
    },
    haiku: { sub: 'Haiku 4.5 · Le plus rapide pour les réponses courtes' },
    opusplan: { label: 'Opus en mode plan', sub: 'Opus en mode plan, Sonnet le reste du temps' },
    unavailable: 'indisponible',
    /** The line under a model the agent moved to by itself - see modelMenu. */
    switchedItself: 'Claude Code est passé à ce modèle de lui-même.',
  },

  composer: {
    placeholder: 'Pose une question, ou décris un changement…',
    placeholderPlan: 'Décris ce qu’il faut planifier…',
    attach: 'Joindre des fichiers ou des dossiers',
    slash: 'Commandes slash',
    improve: 'Améliorer le prompt',
    improveAgain: 'Un autre essai, à partir de ce que tu as écrit',
    restore: 'Revenir à tes mots',
    stop: 'Arrêter',
    forceStop: 'Ne répond pas · Forcer l’arrêt',
    forceStopHint: 'Claude ne confirme pas l’arrêt',
    queue: 'Mettre en file',
    queueHint: 'Part quand le tour en cours sera fini',
    send: 'Envoyer',
    run: 'Exécuter',
    runHint: 'S’exécute dans ton shell - Claude verra la sortie avec ton prochain message',
    improveEmpty: 'Claude Code n’a rien renvoyé à mettre dans le champ.',
    improveChanged: 'Le brouillon a changé pendant la réécriture, il a donc été laissé tel quel.',
    improveTerminal: 'Une commande de terminal n’est pas réécrite',
    voice: 'Dicter',
    voiceStop: 'Arrêter la dictée',
  },

  header: {
    idle: 'Au repos',
    running: 'Claude travaille',
    done: 'Tour terminé',
    attention: 'T’attend',
    crashed: 'La session s’est arrêtée de façon inattendue',
    statistics: 'Statistiques',
    closeStatistics: 'Fermer les statistiques',
    conversations: 'Conversations',
    newSession: 'Nouvelle conversation',
    menu: 'Menu',
    watchers: (n) => `${n} ${n === 1 ? 'autre client suit' : 'autres clients suivent'} ce projet`,
  },

  thanks: {
    button: 'Le plugin te plaît ? Dis merci',
    title: 'DIRE MERCI',
    star: 'Mettre une étoile sur GitHub',
    starSub: 'Aide les autres à trouver le plugin',
    rate: 'Le noter sur la page du plugin',
    rateSub: 'Un avis sur le JetBrains Marketplace',
    share: 'Partager avec des amis',
    shareSub: 'Copie une phrase à son sujet et le lien',
    shareCopied: 'Copié - colle-le où tu veux',
    shareText:
      'Jette un œil à Amazing Claude Code GUI - Claude Code en vrai panneau dans les IDE JetBrains : https://plugins.jetbrains.com/plugin/33255-amazing-claude-code',
  },

  login: {
    checking: 'Recherche de Claude Code…',
    notFound: 'Claude Code introuvable',
    notFoundText:
      'Le panneau passe par le CLI claude. S’il est installé, indique-lui où - l’IDE ne voit pas toujours le même PATH que ton terminal.',
    useThis: 'Prendre celui-ci',
    whereLooked: 'Où le panneau a cherché',
    checkAgain: 'Vérifier à nouveau',
    orSwitch: 'Ou basculez vers un autre compte :',
    signIn: 'Connecte-toi à Claude Code',
    signInText:
      'La connexion se fait une fois, dans le terminal de l’IDE : Claude ouvre un navigateur et attend que tu reviennes. Le panneau s’en aperçoit tout seul.',
    logIn: 'Se connecter',
    openTerminalAgain: 'Rouvrir le terminal',
    finishInTerminal: 'Termine la connexion dans le terminal - cet écran se ferme tout seul.',
  },

  stream: {
    waitingForYou: 'T’attend',
    waitingForSubagent: 'Attend un sous-agent',
    waitingForSubagents: (n) => `Attend ${n} sous-agents`,
    thinking: 'Claude réfléchit',
    retryWaiting: (label, waited) => `${label} · attend depuis ${waited}`,
    withElapsed: (label, elapsed) => `${label} · ${elapsed}`,
  },

  agentTask: {
    failedBeforeFinishing: 'A échoué avant d’avoir fini.',
    stoppedBeforeFinishing: 'Arrêté avant d’avoir fini.',
    backgroundEnded: (outcome, duration) =>
      duration ? `La commande en arrière-plan ${outcome} au bout de ${duration}.` : `La commande en arrière-plan ${outcome}.`,
    outcomeFailed: 'a échoué',
    outcomeStopped: 'a été arrêtée',
    outcomeFinished: 's’est terminée',
    trimmed: (n) => `…${n} étapes précédentes retirées`,
  },

  feed: {
    empty: { title: 'Pose une question à Claude sur ce projet', hint: '@ pour les fichiers · / pour les commandes' },
    you: 'TOI',
    jumpToLatest: 'Aller au plus récent',
    copyBlock: 'Copier ce bloc',
    copyReply: 'Copier toute la réponse',
    copyMessage: 'Copier ce message, avec les chemins des pièces jointes',
    reuse: {
      label: 'Corriger et renvoyer',
      hint: 'Remettre ce message dans le champ de saisie, pour le corriger et le renvoyer',
      lostImages: (n: number): string =>
        n === 1
          ? 'Revient dans le champ de saisie, mais pas l’image collée - joignez-la à nouveau'
          : `Revient dans le champ de saisie, mais pas les ${n} images collées - joignez-les à nouveau`,
    },
    pin: {
      add: 'Épingler en haut du chat',
      crowded: 'Trois au maximum - détachez-en un avant de pouvoir épingler celui-ci',
      remove: 'Détacher',
    },
    pastedLines: (n) => `${n} ${n === 1 ? 'ligne collée' : 'lignes collées'}`,
    pasteClose: 'Replier',
    copyPaste: 'Copier le texte collé',
    pasteShown: (shown, total) => `${shown} premières lignes sur ${total} · la copie prend tout`,
    fromOutput: 'depuis la sortie',

    think: { chip: 'RÉFLEXION', thoughts: (n) => `${n} ${n === 1 ? 'pensée' : 'pensées'}` },

    workflow: {
      agents: (n) => `${n} ${n === 1 ? 'agent' : 'agents'}`,
      running: (n) => `${n} en cours`,
      done: (n) => `${n} ${n === 1 ? 'terminé' : 'terminés'}`,
      failed: (n) => `${n} en échec`,
      queued: 'en attente',
      skipped: 'ignoré',
      attempt: (n) => `essai ${n}`,
      cached: 'du journal',
    },

    tool: {
      running: '· en cours',
      waitingForYou: '· t’attend',
      failed: '· échec',
      lines: (n) => `· ${n} ${n === 1 ? 'ligne' : 'lignes'}`,
      matches: (n) => (n > 0 ? `· ${n} ${n === 1 ? 'résultat' : 'résultats'}` : '· aucun résultat'),
      output: (empty) => (empty ? '· sans sortie' : '· avec sortie'),
      diff: (added, removed) => `· +${added} −${removed}`,
      moreLines: (n) => `… ${n} lignes de plus`,
      fewerLines: '… replier',
      count: (n) => `${n} ${n === 1 ? 'outil' : 'outils'}`,
      closed: {
        replay: 'La conversation enregistrée ne garde aucun résultat pour cet appel.',
        exited: 'Claude Code a cessé de répondre avant la fin de cet appel.',
        stopped: 'Arrêté avant d’avoir fini.',
        turnEnded: 'Le tour s’est terminé avant cet appel.',
        untracked: 'Toujours en cours en arrière-plan - le panneau ne le suit plus.',
      },
      closedMeta: {
        replay: '· absent de la transcription',
        exited: '· interrompu',
        stopped: '· interrompu',
        turnEnded: '· inachevé',
        untracked: '· relâché',
      },
    },

    /** The counter under a subagent's own log while it runs. */
      agentWorking: (duration) => `Travaille · ${duration}`,
    task: {
      /** The heading over a subagent's errand inside its card in the feed (see TaskCard). */
      errand: 'CE QUI LUI A ÉTÉ DEMANDÉ',
      closed: {
        replay: 'La conversation enregistrée ne dit pas comment cela s’est terminé.',
        exited: 'La session s’est terminée avant le retour.',
        stopped: 'Arrêté avant d’avoir répondu.',
        turnEnded: 'Le tour s’est terminé avant le retour.',
        untracked: 'Toujours en cours - le panneau ne le suit plus.',
      },
    },

    bash: { running: 'en cours', noOutput: 'sans sortie' },

    checkpoint: {
      cleared: 'conversation effacée - plus rien au-dessus n’est retenu',
      earlier: 'messages précédents',
      notKept: 'les messages précédents ne sont plus conservés',
      notOnPhone: 'les messages précédents ne sont pas envoyés au téléphone',
      loadEarlier: 'charger les messages précédents',
    },

    compact: {
      label: 'CONTEXTE',
      running: 'Compactage de la conversation…',
      done: (manual) => `contexte compacté ${manual ? 'à la main' : 'automatiquement'}`,
      doneWith: (manual, before, after, took) =>
        `${manual ? 'à la main' : 'automatiquement'} : ${before} de contexte compactés en ${after ? `un résumé de ${after}` : 'un résumé'}${took ? ` en ${took}` : ''}`,
    },

    retry: {
      label: 'NOUVEL ESSAI',
      reason: {
        rateLimited: 'Trop de requêtes',
        overloaded: 'API surchargée',
        auth: 'Échec de l’authentification',
        error: 'Erreur de l’API',
      },
      attempt: (n) => `essai ${n}`,
      attemptOf: (n, max) => `essai ${n}/${max}`,
      retryingIn: (seconds) => `nouvel essai dans ${seconds} s`,
      retrying: 'nouvel essai…',
      recovered: (attempts) => `passé après ${attempts} ${attempts === 1 ? 'essai' : 'essais'}`,
      failed: (attempts) => `abandonné après ${attempts} ${attempts === 1 ? 'essai' : 'essais'}`,
      stopped: (attempts) => `arrêté après ${attempts} ${attempts === 1 ? 'essai' : 'essais'}`,
    },

    result: {
      worked: (duration) => (duration ? `A travaillé ${duration}` : 'A travaillé'),
      stopped: (duration) => (duration ? `Arrêté par toi · ${duration}` : 'Arrêté par toi'),
      movedAccount: (duration) => (duration ? `Arrêté pour changer de compte · ${duration}` : 'Arrêté pour changer de compte'),
    },

    modelSwitch: { label: 'MODÈLE', note: 'changé par Claude Code, pas par toi' },

    crash: {
      label: 'SESSION',
      text: 'Claude Code s’est arrêté de façon inattendue.',
      textWithCode: (code) => `Claude Code s’est arrêté de façon inattendue (code ${code}).`,
    },

    limit: {
      label: 'LIMITE',
      extraLabel: 'USAGE SUPPLÉMENTAIRE',
      extra: (window) =>
        `${window ? `La limite ${window}` : 'La limite d’usage'} est épuisée - le travail continue en usage supplémentaire, facturé en plus du forfait`,
      waiting: (window) => `${window ? `La limite ${window}` : 'La limite d’usage'} est épuisée - on attend sa réinitialisation`,
      resetAt: (clock, left) => `${clock} · dans ${left}`,
    },

    plan: {
      label: 'PLAN PRÊT',
      steps: (n) => `· ${n} ${n === 1 ? 'étape' : 'étapes'}`,
      approve: 'Valider et lancer',
      keepPlanning: 'Continuer à planifier',
      withdrawn: 'L’agent n’attend plus de décision',
    },

    ask: {
      label: 'CLAUDE DEMANDE',
      blocks: (n) => `${n} ${n === 1 ? 'question' : 'questions'} · bloque l’exécution`,
      pickAny: 'plusieurs possibles',
      other: 'Autre',
      ownAnswer: 'écrivez votre propre réponse…',
      send: 'Envoyer les réponses',
      pickToContinue: 'Choisis pour continuer',
      note: 'l’exécution reprend exactement là où elle a demandé',
      expand: 'Déplier la question',
      collapse: 'Replier la question',
      dismiss: 'Fermer la question',
      dismissHint: 'Fermer et répondre avec tes propres mots',
    },

    findings: {
      label: 'REVUE',
      fixed: 'corrigé',
      skipped: 'ignoré',
      noChange: 'rien à changer',
      unconfirmed: 'non confirmé',
    },

    copy: { copied: 'Copié', click: 'Cliquer pour copier', openFile: "Ouvrir dans l'éditeur", openFolder: 'Afficher le dossier' },
  },

  chrome: {
    tasks: {
      label: 'TÂCHES',
      listLabel: 'LISTE DES TÂCHES',
      progress: (done, total) => `${done} / ${total} faites`,
      collapse: 'Replier la liste des tâches',
      expand: 'Voir le reste de la liste',
    },
    queue: {
      label: 'EN ATTENTE',
      hint: (n) => `${n} partiront dans l’ordre à la fin du tour · glissez pour réordonner`,
    },
    selection: { quote: 'Citer', fork: 'Bifurquer d’ici' },
    streams: {
      main: 'principal',
      background: 'fond',
      stopAgent: 'Arrêter cet agent',
      stopAgentNamed: (name) => `Arrêter : ${name}`,
      stopAgentTitle: 'Arrêter cet agent ?',
      stopCommand: 'Arrêter cette commande',
      stopCommandTitle: 'Arrêter cette commande ?',
    },
    confirm: { cancel: 'Annuler', stop: 'Arrêter' },
    noChats: { title: 'Ravi de travailler ensemble !', button: "C'est parti" },
    crash: {
      title: 'Le panneau a rencontré une erreur',
      text: 'Recharger est sans risque : tes conversations vivent dans les processus Claude Code derrière le panneau et lui survivent.',
      button: 'Recharger le panneau',
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
    empty: { title: 'Pro et perso, côte à côte', body: "Passez d'un compte Claude à l'autre sans vous déconnecter. Skills, hooks, réglages et historique restent partagés." },
    intro: 'Tout tourne sur le compte choisi ici : toutes les conversations ouvertes y passent, et celle qui est en plein tour est arrêtée pour pouvoir passer.',
    /** An account whose sign-in has not landed, so nobody knows its address yet. */
    unnamed: 'Connexion…',
    defaultName: 'Connexion Claude Code',
    current: 'utilisé',
    signingIn: 'connexion en cours',
    use: 'Choisir',
    switching: 'Changement…',
    rename: 'Renommer',
    save: 'Enregistrer',
    logout: 'Se déconnecter',
    logoutConfirm: 'Se déconnecter de Claude Code ?',
    forget: 'Oublier',
    add: 'Ajouter un compte',
    adding: 'En attente de la connexion…',
    cancel: 'Annuler',
    addHint: 'Un terminal s’ouvre pour la connexion. Ton compte actuel n’est pas touché.',
    mcpNote: 'Les serveurs MCP se connectent compte par compte : un nouveau compte les authentifie une fois. Skills, hooks, réglages et historique restent partagés.',
    designAuthorize: 'Autoriser Claude Design',
    designNote: 'Claude Design se connecte lui aussi compte par compte, et seul un terminal peut le faire. Il s’ouvre pour le compte en cours ; ensuite DesignSync fonctionne tout seul dans le panneau.',
    aliasPlaceholder: 'Travail, Perso, un client…',
    /**
     * Presence, not validity: the CLI answers "signed in" for any credential it can read, including one
     * revoked last week. So the words say what is actually known.
     */
    absent: 'Aucun identifiant enregistré. Reconnecte-toi pour utiliser ce compte.',
    /** The figures beside a row - short, because they sit on one line under the name. */
    fiveHour: '5 h',
    weekly: 'sem.',
    row: {
      /** The value on the menu row when there is nothing to switch between. */
      one: 'Un seul compte',
      adding: 'Connexion…',
    },
    /**
     * Why the machine cannot keep two sign-ins apart. One sentence each, and each names the real reason
     * rather than "unavailable" - a person who reads why can usually do something about it.
     */
    unavailable: {
      ignored: 'Ce Claude Code ne sait pas distinguer deux connexions. Mets-le à jour, puis rouvre cet écran.',
      wsl: 'Indisponible pour un projet dans WSL : Claude Code tourne là-bas, pas sur cette machine.',
      not_signed_in: 'Connecte-toi d’abord à Claude Code, puis ajoute un second compte ici.',
      api_key: 'Cette machine se connecte avec une clé API, valable pour toutes les conversations. Impossible de changer de compte tant qu’elle est définie.',
    },
    /** How a request went. Codes rather than sentences from the IDE, which speaks one language. */
    outcome: {
      'did-not-land': 'Cette connexion n’est pas allée au bout, donc rien n’a été ajouté.',
      'no-terminal': 'Le terminal n’a pas voulu s’ouvrir, la connexion n’a donc pas démarré.',
      'no-executable': 'Claude Code est introuvable sur cette machine.',
      'no-store': 'Impossible de créer un dossier pour le nouveau compte.',
      'design-no-account': 'Impossible de déterminer le compte en cours : rien n’a été ouvert.',
      'not-supported': "Ce Claude Code ne sait pas séparer deux connexions, donc rien n'a été ajouté.",
      'logout-failed': 'La déconnexion a échoué. Essayez dans un terminal.',
      'already-running': 'Une connexion est déjà en cours.',
      unknown: 'Ça n’a pas marché.',
    } as Record<string, string>,
  },

  remote: {
    codeLabel: 'Code d’appairage',
    states: {
      idle: { label: 'Désactivé', hint: 'Cet IDE n’est pas joignable depuis l’extérieur.' },
      connecting: { label: 'Connexion…', hint: 'Premier contact avec le relais.' },
      connected: { label: 'Connecté', hint: 'Un appareil appairé voit ce projet.' },
      reconnecting: {
        label: 'Reconnexion…',
        hint: 'La ligne a lâché. C’est banal - elle revient toute seule.',
      },
      unreachable: {
        label: 'Relais injoignable',
        hint: 'Le relais ne répond pas. Ton travail n’en souffre pas, seulement le téléphone.',
      },
      refused: {
        label: 'Refusé',
        hint: 'Le relais n’a pas voulu de ce plugin : il est peut-être trop ancien, ou un autre IDE occupe cette adresse.',
      },
    },
    agent: (id) => `agent ${id}`,
    thisIde: 'CET IDE',
    relay: 'RELAIS',
    device: 'APPAREIL',
    allow: 'Autoriser l’accès à cet IDE à distance',
    allowHint: 'Désactivé tant que tu ne l’actives pas, et désactivé dès que tu le coupes.',
    relayAddress: 'ADRESSE DU RELAIS',
    noSafe:
      'Cet IDE est réglé pour ne pas retenir les mots de passe, donc un appairage ne survivra pas à un redémarrage. Active le coffre de mots de passe de l’IDE si tu veux qu’il tienne.',
    wantsToPair: (device) => `${device} demande un appairage`,
    checkFingerprint: 'C’est le nom que l’appareil se donne - vérifie que l’empreinte ci-dessous correspond à celle de son écran.',
    allowDevice: 'Autoriser',
    refuse: 'Refuser',
    scanThis: 'Scanne ceci avec le téléphone',
    codeNote: (left) =>
      `${left} · valable une fois. Le secret est dans la partie de l’adresse après le dièse, que les navigateurs n’envoient jamais à un serveur.`,
    minutesLeft: (minutes) => `${minutes} min restantes`,
    secondsLeft: (seconds) => `${seconds} s restantes`,
    stopOffering: 'Ne plus proposer',
    pairDevice: 'Appairer un appareil',
    pairedDevices: 'APPAREILS APPAIRÉS',
    revoke: 'Révoquer',
    whatTravels: 'Ce qui sort d’ici et ce qu’un téléphone peut faire',
    whatTravelsSub: 'À lire avant de l’activer',
    fingerprint: 'L’empreinte de cet IDE',
    about: {
      first:
        'Une fois activé, tes conversations passent par un relais pour qu’un téléphone appairé puisse les lire et répondre. Cela comprend ce que l’agent lit et écrit : code source, chemins de fichiers, sortie des commandes.',
      second:
        'Le relais ne peut rien en lire - le contenu est scellé entre cet IDE et ton téléphone. Il voit quand tu es connecté et combien passe, c’est-à-dire à peu près tes horaires. Tu peux faire tourner ton propre relais.',
      can: 'Un téléphone appairé peut répondre aux autorisations, envoyer des messages et arrêter un tour.',
      cannot:
        'Il ne peut pas exécuter de commandes shell, installer des plugins, changer le mode d’autorisation, ni toucher au presse-papiers de cette machine.',
      third:
        'Un appairage se prouve par un code affiché une seule fois sur cet écran. Comparer les deux empreintes attrape la seule chose que le code ne peut pas : quelqu’un qui a photographié l’écran et scanné en premier.',
    },
  },

  feedback: {
    button: 'Signaler un bug ou envoyer une idée',
    kinds: {
      bug: { label: 'Bug', placeholder: 'Que s’est-il passé, et à quoi t’attendais-tu ?' },
      idea: { label: 'Idée', placeholder: 'Qu’aimerais-tu que le panneau fasse ?' },
      hello: { label: 'Bonjour', placeholder: 'N’importe quoi - cela arrive à une personne, pas à une file.' },
    },
    email: 'E-MAIL',
    emailOptional: 'facultatif',
    attachments: 'PIÈCES JOINTES',
    addFiles: 'Ajouter des fichiers',
    removeFile: (name) => `Retirer : ${name}`,
    attachTotal: (count, max, size, budget) => `${count} sur ${max} · ${size} sur ${budget}`,
    logs: 'Joindre les journaux de débogage',
    logsFromTab: (tab) => `De l’onglet ${tab} - `,
    logsFromOpenTab: 'De l’onglet que tu as ouvert : ',
    logsWhat:
      'versions, durées et ce qui a échoué. Ni ta conversation, ni tes noms de fichiers, ni tes chemins - et tu peux tout lire avant que ça parte.',
    logsOnlyBug:
      'Seulement avec un bug : le rapport raconte quelque chose qui a mal tourné, et ici il n’y a rien à raconter.',
    seeWhat: 'Voir exactement ce qui est joint',
    send: 'Envoyer',
    sending: 'Envoi…',
    sentPartly: (note) => `Envoyé, mais pas tout. ${note}`,
    sent: 'Envoyé. Merci ❤️ - cela m’arrive directement.',
    notSent: 'L’envoi a échoué. Rien n’est perdu - réessaie.',
    reportNote: (tab) =>
      `Voici la pièce jointe en entier, mot pour mot${tab ? `, pour l’onglet ${tab}` : ''}. Elle est construite ici, dans ton IDE, à partir de ce que le plugin a lui-même vu : versions, forme de cette conversation, et tout ce qui a échoué. Les noms de fichiers apparaissent en hachages courts, si bien que le même fichier se lit comme le même sans dire lequel.`,
    building: 'Construction…',
    copy: 'Copier',
    problems: {
      empty: 'Écris d’abord quelques mots.',
      tooLong: (max) => `C’est plus long que ${max} caractères.`,
      tooMany: (max) => `Pas plus de ${max} fichiers.`,
      tooHeavy: (budget) => `Les fichiers dépassent ${budget} au total.`,
    },
  },

  mcp: {
    empty: 'Aucun serveur MCP configuré.',
    addServer: 'AJOUTER UN SERVEUR',
    namePlaceholder: 'nom',
    commandPlaceholder: 'commande, ou URL pour sse/http',
    refreshAll: 'Tout rafraîchir',
    refreshing: 'Rafraîchissement…',
    add: 'Ajouter',
    adding: 'Ajout…',
    authenticate: 'Se connecter',
    opening: 'Ouverture…',
    reconnect: 'Reconnecter',
    retry: 'Réessayer',
    reconnecting: 'Reconnexion…',
    remove: 'Retirer',
    removing: 'Retrait…',
    status: { connected: 'connecté', needsAuth: 'connexion requise', failed: 'échec', pending: 'connexion…', disabled: 'désactivé' },
  },

  plugins: {
    tabInstalled: 'Installés',
    tabBrowse: 'Parcourir',
    tabMarkets: 'Marchés',
    emptyInstalled: 'Aucun plugin installé.',
    searchPlaceholder: 'Chercher des plugins par nom ou description…',
    noMarketplaces: 'Aucun marketplace connecté.',
    noMatches: 'Aucun résultat.',
    emptyMarketplaces: 'Aucun marketplace configuré.',
    addMarketplace: 'AJOUTER UN MARKETPLACE',
    marketplacePlaceholder: 'URL, chemin, ou owner/repo sur GitHub',
    refresh: 'Rafraîchir',
    refreshing: 'Rafraîchissement…',
    install: 'Installer',
    installing: 'Installation…',
    uninstall: 'Désinstaller',
    uninstalling: 'Désinstallation…',
    enable: 'Activer',
    enabling: 'Activation…',
    disable: 'Désactiver',
    disabling: 'Désactivation…',
    add: 'Ajouter',
    adding: 'Ajout…',
    remove: 'Retirer',
    removing: 'Retrait…',
  },

  mobile: {
    pair: 'Appairer',
    removeFromQueue: 'Retirer de la file',
    newSessionTitle: 'nouvelle conversation',

    sessions: {
      nothingYet: 'Rien à montrer pour l’instant. Ouvre un projet dans l’IDE, ou appaire-en une autre.',
      nonePaired: 'Aucune IDE n’est encore appairée à ce téléphone. Touche Appairer pour en ajouter une.',
      recentlyOpened: 'Ouverts récemment',
      projectClosed: 'Pas ouvert dans l’IDE en ce moment.',
      noConversations: 'Pas encore de conversation.',
      hidden: (n) => `${n} masquées · afficher`,
      pastConversations: 'Conversations passées',
      newChat: 'Nouvelle conversation',
      reach: {
        connecting: 'Connexion…',
        asleep: 'Connecté au relais, mais aucune IDE ne répond.',
        elsewhere: 'Aussi ouvert dans un autre onglet ou dans l’app installée - c’est cette copie qui tient la connexion.',
        reconnecting: 'Reconnexion… la liste ci-dessous peut être périmée.',
        offline: 'Le relais est injoignable. Rien n’est perdu - cela revient tout seul.',
      },
      agent: {
        connecting: 'connexion…',
        asleep: 'ne répond pas',
        elsewhere: 'ouvert ailleurs',
        reconnecting: 'reconnexion…',
        offline: 'hors ligne',
      },
    },

    history: { title: 'Historique', empty: 'Pas encore de conversation passée dans ce projet.' },

    decision: {
      planWaiting: 'Un plan attend',
      questionOf: (n, total) => `Question ${n} sur ${total}`,
      nothingWaiting: 'Plus rien ne t’attend ici.',
      openConversation: 'Ouvrir la conversation',
      allowOnce: 'Autoriser une fois',
      deny: 'Refuser',
    },

    thread: {
      loading: 'Chargement de la conversation…',
      waitingPerm: 'Autorisation nécessaire - réponds',
      waitingAsk: 'Une question attend - réponds',
      waitingPlan: 'Un plan attend - décide',
    },

    newSession: {
      title: 'Nouvelle conversation',
      asConfigured: 'Comme configuré',
      asConfiguredSub: 'Tel que Claude Code est réglé sur cette machine.',
      model: 'Modèle',
      effort: 'Effort',
      mode: 'Mode',
      closedProject: 'Ce projet est fermé - l’IDE l’ouvrira avant de commencer.',
      start: 'Démarrer',
      opening: 'Ouverture du projet…',
    },

    pairing: {
      title: 'Appairer avec une IDE',
      fromCode: 'Appairage avec l’IDE qui a montré ce code. Elle demande maintenant l’accord de quelqu’un devant la machine.',
      how: 'Dans l’IDE, ouvre le menu du panneau → Accès à distance → Appairer un appareil. Scanne le code avec la caméra, ou saisis-le ci-dessous.',
      fingerprintAsk: 'L’IDE affiche une empreinte. N’autorise que si elle indique :',
      fingerprintNote: 'L’IDE te demandera ensuite de confirmer et affichera une empreinte. Cette app affichera la même - n’autorise que si elles correspondent.',
      waiting: 'En attente de l’IDE…',
      done: 'Appairé.',
      failed: 'L’appairage n’a pas fonctionné.',
      notACode: 'Cela ne ressemble pas à un code d’appairage.',
      iphone: 'Un iPhone',
      ipad: 'Un iPad',
      android: 'Un téléphone Android',
      browser: 'Un navigateur',
    },

    composer: {
      commands: 'Commandes',
      closeList: 'Fermer la liste',
      usageLimits: 'Limites d’usage',
      removeImage: (name) => `Retirer : ${name}`,
      say: 'Dis quelque chose…',
      reconnecting: 'Reconnexion…',
      slash: 'Commandes slash',
      attachPhoto: 'Joindre une photo',
      voice: 'Dicter',
      voiceStop: 'Arrêter la dictée',
      stop: 'Arrêter l’exécution',
      whatTravels: 'Ce qui circule entre ton IDE et ce téléphone',
      projectFiles: 'Fichiers du projet',
      ofTotal: (shown, total) => `${shown} sur ${total}`,
      photosDropped: (n) => `${n} de plus ne tiennent pas dans un message - envoie d’abord celles-ci.`,
      photoTooBig: 'Cela ne tient pas dans un message. Essaie une photo à la fois.',
    },

    limits: {
      title: 'Limites et contexte',
      fiveHourWindow: 'Fenêtre de cinq heures',
      weeklyWindow: 'Fenêtre hebdomadaire',
      paceNote: (percent) =>
        `L’arc pâle est le rythme régulier : ${percent}% de la semaine sont déjà « dus » à ce jour. Tant que l’arc vif est plus court, la semaine tient le plan.`,
      context: 'Le contexte de cette conversation',
      ofTotal: (used, total) => `${used} sur ${total}`,
      spentToday: 'Dépensé aujourd’hui',
      acrossProjects: 'tous projets confondus',
      noWindows: 'L’IDE n’a pas encore communiqué les fenêtres de l’abonnement.',
      extraUsage: 'Usage supplémentaire',
      extraUsed: (window) =>
        `${window ? `la limite ${window}` : 'la limite'} est épuisée, facturé en plus du forfait`,
      resetUnknown: 'heure de réinitialisation encore inconnue',
      resetsIn: (left) => `réinitialisation dans ${left}`,
    },
  },

  status: {
    todayTokens: 'Tokens dépensés aujourd’hui, tous projets confondus',
    openPr: 'Ouvrir la pull request dans le navigateur',
    noPr: 'pas de PR',
    effortHint: (effort) => `Effort de raisonnement : ${effort}`,
    modelHint: (model) => `Modèle : ${model}`,
    modelHintSwitched: (model, from) => `Modèle : ${model} - Claude Code y est passé de lui-même, depuis ${from}`,
    modeHint: (mode) => `Mode d’autorisation : ${mode}`,
    sessionLimit: 'Limite de 5 heures',
    weekLimit: 'Limite hebdomadaire',
    windowUsed: (title, percent) => `${title} : ${percent}% utilisé`,
    resetsIn: (left) => `Réinitialisation dans ${left}`,
    paceBudget: (percent) => `Anneau pâle : ${percent}% du budget à rythme régulier pour aujourd’hui`,
    extraUsage: (limit) => `Usage supplémentaire : ${limit} est épuisée, le travail est facturé en plus du forfait`,
    extraSpent: (percent) => `${percent}% de l’usage supplémentaire du mois dépensé`,
    limitNamed: (window) => `la limite ${window}`,
    limitUnnamed: 'la limite',
  },

  limits: {
    fiveHour: 'de 5 heures',
    weekly: 'hebdomadaire',
    weeklyOpus: 'hebdomadaire Opus',
    weeklySonnet: 'hebdomadaire Sonnet',
    weeklyApps: 'hebdomadaire des applications',
    weeklyWithExtra: 'hebdomadaire, usage supplémentaire compris',
    extra: 'd’usage supplémentaire',
  },

  permission: {
    label: 'AUTORISATION',
    decisions: { once: 'Autoriser une fois', always: 'Toujours autoriser', deny: 'Refuser' },
    underMode: (mode) => `Mode : ${mode}`,
  },

  selectors: {
    model: 'MODÈLE',
    effort: 'EFFORT',
    mode: 'MODE',
    modeHint: 'shift+tab',
  },

  commands: {
    resume: 'ouvrir une conversation passée de ce projet',
    fork: 'continuer cette conversation dans un nouvel onglet',
    login: 'se connecter à Claude Code depuis le terminal de l’IDE',
    logout: 'se déconnecter - ouvre le terminal de l’IDE',
    designLogin: 'autoriser Claude Design dans le terminal de l’IDE',
    model: 'changer le modèle de cette session',
    effort: 'régler combien de temps Claude réfléchit avant d’agir',
    context: 'ce qui remplit la fenêtre de contexte en ce moment',
    cost: 'dépenses et fenêtres d’usage de cette session',
    usage: 'fenêtres de l’abonnement et quand elles se réinitialisent',
    codeReview: 'relire une pull request',
  },
}
