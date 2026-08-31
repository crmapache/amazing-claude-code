import type { Dict } from './en'

/**
 * Español. Traducción del diccionario inglés (ver en.ts), no un texto aparte.
 *
 * Se trata al usuario de tú, como hace el original. Los nombres de producto (Claude Code, MCP, Opus,
 * Sonnet, Haiku, Git, PR) y los nombres de las herramientas del CLI no se traducen. La raya del original
 * es un guion con espacios, y aquí se mantiene igual.
 */
export const es: Dict = {
  common: {
    back: 'Atrás',
    close: 'Cerrar',
    closeMenu: 'Cerrar el menú',
    loading: 'Cargando…',
    muted: 'silencio',
    countOn: (n) => `${n} activos`,
  },

  menu: {
    titles: {
      menu: { title: 'MENÚ', hint: 'todo lo que el panel mantiene apartado' },
      history: { title: 'HISTORIAL', hint: 'conversaciones anteriores de este proyecto' },
      mcp: { title: 'SERVIDORES MCP', hint: 'estado · iniciar sesión · reconectar' },
      plugins: { title: 'PLUGINS', hint: 'instalados · explorar · marketplaces' },
      settings: { title: 'AJUSTES', hint: 'cómo se comporta y cómo suena el panel' },
      sounds: { title: 'AVISOS SONOROS', hint: 'cuándo te llama el panel' },
      remote: { title: 'ACCESO REMOTO', hint: 'estado · relay · dispositivos vinculados' },
      remoteAbout: { title: 'QUÉ SALE DE AQUÍ', hint: 'léelo antes de activarlo' },
      defaultMode: { title: 'MODO POR DEFECTO', hint: 'con qué empiezan las pestañas nuevas' },
      composerLayout: { title: 'DISPOSICIÓN DEL CAMPO', hint: 'dónde se coloca el campo de entrada' },
      pasteCollapse: { title: 'TEXTO PEGADO', hint: 'cuándo un pegado se pliega en una ficha' },
      improvePrompt: { title: 'MEJORAR EL PROMPT', hint: 'qué pide el botón de la estrella' },
      voice: { title: 'ENTRADA POR VOZ', hint: 'dictar en lugar de escribir' },
      voiceLanguage: { title: 'IDIOMA HABLADO', hint: 'qué escucha el dictado' },
      voiceDevice: { title: 'MICRÓFONO', hint: 'por cuál escuchar' },
      language: { title: 'IDIOMA', hint: 'en qué idioma habla el panel' },
      feedback: { title: 'COMENTARIOS', hint: 'un fallo, una idea o simplemente un hola' },
      feedbackLog: { title: 'QUÉ SE ADJUNTA', hint: 'el informe entero, antes de enviarlo' },
    },

    groups: {
      project: 'ESTE PROYECTO',
      devices: 'DISPOSITIVOS',
      plugin: 'EL PLUGIN',
      author: 'DEL AUTOR',
    },

    rows: {
      history: { label: 'Historial', sub: 'Conversaciones anteriores de este proyecto' },
      statistics: { label: 'Estadísticas', sub: 'Horas, hábitos, logros' },
      mcp: { label: 'Servidores MCP', sub: 'Estado, inicio de sesión, reconexión' },
      plugins: { label: 'Plugins', sub: 'Instalados, explorar, marketplaces' },
      remote: { label: 'Acceso remoto', sub: 'Estado, relay, dispositivos vinculados' },
      settings: { label: 'Ajustes', sub: 'Sonidos, modo, disposición, idioma' },
      feedback: { label: 'Enviar comentarios', sub: 'Un fallo, una idea o simplemente un hola' },
    },

    author: {
      title: '¿Tienes una entrevista pronto?',
      body: 'Le hice un asistente de IA. Pruébalo gratis - y apóyame. Gracias',
      tagline: 'copiloto de entrevistas en tiempo real',
    },

    footer: 'Amazing Claude Code GUI',
  },

  settings: {
    rows: {
      sounds: { label: 'Avisos sonoros', sub: 'Cuándo te llama el panel' },
      defaultMode: { label: 'Modo por defecto', sub: 'Con qué empiezan las pestañas nuevas' },
      composerLayout: { label: 'Disposición del campo', sub: 'Dónde se coloca el campo de entrada' },
      pasteCollapse: { label: 'Texto pegado', sub: 'Cuándo un pegado se pliega en una ficha' },
      improvePrompt: { label: 'Mejorar el prompt', sub: 'Qué pide el botón de la estrella' },
      voice: { label: 'Entrada por voz', sub: 'Dicta con tu propia clave de Deepgram' },
      language: { label: 'Idioma', sub: 'En qué idioma habla el panel' },
    },

    improveSummary: { builtIn: 'Integrado', custom: 'Propio' },
  },

  language: {
    note: 'Solo el panel. El idioma en el que responde Claude es un ajuste del propio Claude Code, compartido con la terminal, y esto no lo toca.',
    followIde: 'Automático',
    followIdeSub: (language) => `Seguir al IDE - ahora mismo, ${language}`,
    followIdeUnknown: 'Seguir al IDE',
  },

  sounds: {
    turnFinished: { label: 'Turno terminado', hint: 'Claude ha respondido y te está esperando' },
    permission: { label: 'Permiso solicitado', hint: 'una llamada a una herramienta necesita tu visto bueno' },
    question: { label: 'Pregunta planteada', hint: 'Claude te pide que elijas una respuesta' },
    plan: { label: 'Plan listo', hint: 'hay un plan esperando tu aprobación' },
    rateLimit: { label: 'Límite alcanzado', hint: 'el límite de la suscripción ha parado el turno' },
    extraUsage: {
      label: 'Empieza el uso extra',
      hint: 'el plan se ha agotado - a partir de aquí el trabajo se factura aparte',
    },
    trouble: { label: 'Algo se ha roto', hint: 'un error, un proceso caído o una sesión cerrada' },
    play: 'Escúchalo',
    playNamed: (sound) => `Escuchar: ${sound}`,
    volumeOf: (sound) => `Volumen de: ${sound}`,
  },

  history: {
    empty: 'Aquí todavía no hay conversaciones anteriores.',
    today: 'HOY',
    earlier: 'ANTES',
    messages: (n) => (n === 1 ? `${n} mensaje` : `${n} mensajes`),
  },

  composerLayout: {
    bottom: 'Normal',
    compact: 'Compacta',
    left: 'Izquierda',
    right: 'Derecha',
  },

  pasteCollapse: {
    note: 'Un pegado de varias líneas se pliega en una ficha para que un muro de texto no llene el campo de entrada. No se pierde nada: la ficha guarda el texto entero y vuelve a desplegarse en el campo con el botón del lápiz que lleva encima.',
    never: 'No plegar nunca',
    neverSub: 'Todo lo pegado se queda en el campo como texto normal',
    from: (lines) => `Desde ${lines} líneas`,
    foldLabel: 'Plegar los pegados largos',
    foldSub: (min, max) => `A partir de cuántas líneas: ${min} a ${max}`,
  },

  improvePrompt: {
    note: 'El botón de la estrella, junto al clip, reescribe lo que hay en el campo de entrada. Esto es lo que pide. Sale como una ejecución propia de Claude Code - sin herramientas, sin archivos, sin conversación - y cuenta para tu uso como cualquier otro mensaje.',
    label: 'INSTRUCCIONES',
    emptyMeans: 'Vacío significa el texto gris de arriba - el que usa el botón de fábrica.',
    builtInLanguage:
      'Está en inglés porque es una instrucción para el modelo, no parte de la interfaz: ya pide la respuesta en el idioma del borrador. El tuyo puede estar en cualquier idioma.',
    editBuiltIn: 'Editar el texto integrado',
    backToBuiltIn: 'Volver al texto integrado',
  },

  voice: {
    note: 'Mantén una tecla y habla: las palabras aparecen en el campo mientras las dices. Funciona con tu propia clave de Deepgram: el audio va a Deepgram y a ningún otro sitio, el plugin no tiene servidor en medio.',
    off: 'Desactivada',
    enable: 'Entrada por voz',
    enableHint: 'Muestra el botón del micrófono y escucha los atajos de abajo.',

    key: 'CLAVE DE DEEPGRAM',
    keyPlaceholder: 'Pega tu clave',
    keySet: (tail: string): string => `Clave guardada, termina en ${tail}`,
    keySave: 'Guardar',
    keyForget: 'Olvidar esta clave',

    balanceLeft: (amount: string): string => `Quedan ${amount} en la cuenta`,
    balanceChecking: 'Preguntando a Deepgram…',
    balanceNoKey: 'Todavía no hay clave.',
    balanceNoAccess: 'La clave funciona. Para ver el saldo hace falta una clave con el rol Owner o Admin.',
    balanceRejected: 'Deepgram no reconoce esta clave.',
    balanceFailed: 'No se pudo contactar con Deepgram. Revisa la red e inténtalo de nuevo.',
    balanceRefresh: 'Actualizar',

    getKey: '¿Aún sin clave?',
    getKeyHint: 'Regístrate en deepgram.com y crea una clave de API. Las cuentas nuevas reciben 200 $ de crédito sin tarjeta: a estos precios son varios cientos de horas de dictado.',
    openSite: 'Abrir deepgram.com',

    hotkeys: 'ATAJOS',
    hotkeysHint: 'Funcionan mientras el teclado esté en el IDE: en el editor, en el panel, en un diálogo. No en otra aplicación.',
    push: 'Pulsar y hablar',
    pushHint: 'Graba mientras lo mantienes y para al soltarlo.',
    hold: 'Manos libres',
    holdHint: 'Una pulsación empieza, la siguiente termina.',
    keyboard: 'TECLA',
    mouse: 'RATÓN',
    record: 'Asignar',
    recording: 'Pulsa una tecla…',
    recordingMouse: 'Pulsa un botón…',
    notSet: 'Sin asignar',
    clear: 'Quitar',
    sideLeft: 'Izquierdo',
    sideRight: 'Derecho',
    badButton: 'Solo sirven los botones laterales del ratón: los tres principales ya significan algo en todo el IDE.',
    modifierTip: 'Un solo modificador va muy bien aquí: mantén el Option derecho o el Ctrl derecho y nada en el IDE competirá por él.',

    language: 'Idioma hablado',
    languageHint: 'Qué escucha el dictado',
    searchLanguages: 'Buscar idioma…',
    multiHint: 'El modo multilingüe sigue el cambio de idioma a mitad de frase. Medido contra un idioma concreto sale peor en ambos casos: elígelo solo si de verdad mezclas dos idiomas en una misma frase.',

    device: 'Micrófono',
    deviceHint: 'Por cuál escuchar',
    deviceDefault: 'El del sistema',
    deviceDefaultHint: 'Sigue lo que tenga configurado el sistema',
    deviceNote: 'El cambio se aplica en el próximo dictado.',

    errorNoKey: 'Añade primero una clave de Deepgram: Ajustes y luego Entrada por voz.',
    errorNoKeyRemote: 'No hay clave de Deepgram en el equipo donde corre esta conversación: añádela allí, en Ajustes, Entrada por voz.',
    errorOff: 'La entrada por voz está desactivada en el equipo donde corre esta conversación: actívala allí, en Ajustes.',
    errorMicrophone: 'El micrófono no se abrió. Puede que otra aplicación lo esté usando.',
    errorKey: 'Deepgram rechazó la clave. Revísala en la pantalla de entrada por voz.',
    errorNetwork: 'No se pudo contactar con Deepgram. Revisa la red e inténtalo de nuevo.',
    errorGeneral: 'El dictado se detuvo. Inténtalo de nuevo.',
  },

  modes: {
    manual: {
      label: 'Pedir permiso',
      sub: 'Lee con libertad; pregunta antes de cada escritura y cada comando.',
      short: 'Pide',
    },
    acceptEdits: {
      label: 'Aceptar ediciones',
      sub: 'Aprueba solo los cambios de archivos del directorio de trabajo. Para la shell sigue preguntando.',
      short: 'Acepta',
    },
    plan: {
      label: 'Plan',
      sub: 'Investiga y propone un plan. No toca nada hasta que lo apruebes.',
      short: 'Plan',
    },
    auto: {
      label: 'Auto',
      sub: 'Sin preguntas - un clasificador revisa cada acción arriesgada. No está en todos los modelos.',
      short: 'Auto',
    },
    dontAsk: {
      label: 'No preguntar',
      sub: 'Nunca pregunta; deniega todo lo que no esté aprobado de antemano. Para ejecuciones sin vigilancia.',
      short: 'Calla',
    },
    bypassPermissions: {
      label: 'Saltarse los permisos',
      sub: 'Se salta casi todas las comprobaciones. Los borrados peligrosos siguen preguntando. Solo en contenedores y máquinas desechables.',
      short: 'Salta',
    },
    tags: {
      default: 'por defecto',
      readOnly: 'solo lectura',
      preview: 'vista previa',
      settings: 'ajustes',
      danger: 'peligro',
    },
  },

  effort: {
    auto: { sub: 'Vuelve al esfuerzo que el modelo trae por defecto en esta sesión.' },
    ultracode: {
      sub: 'Razonamiento xhigh y, cuando la tarea lo pide, flujos automáticos con varios agentes.',
    },
    max: { sub: 'Todo lo que tiene. Arquitectura y bugs enrevesados.' },
    xhigh: { sub: 'Más de lo mismo, para cambios que se reparten por muchos archivos.' },
    high: { sub: 'Razonamiento largo antes de actuar. Cambios en varios archivos.' },
    medium: { sub: 'Equilibrado. Buen punto de partida para trabajar en funcionalidades.' },
    low: { sub: 'Piensa lo mínimo. Ediciones mecánicas y respuestas rápidas.' },
    tags: { ultra: 'ultra', slow: 'lento', default: 'por defecto' },
  },

  models: {
    default: { label: 'Por defecto (recomendado)', sub: 'Usa el modelo con el que arranca esta sesión.' },
    opus: { sub: 'Opus 5 · El mejor para el día a día y las tareas complejas' },
    opus1m: {
      label: 'Opus (contexto de 1M)',
      sub: 'Opus 5 con contexto de 1M · Para sesiones largas sobre bases de código grandes',
    },
    sonnet: { sub: 'Sonnet 5 · Eficiente para tareas rutinarias' },
    sonnet1m: {
      label: 'Sonnet (contexto de 1M)',
      sub: 'Sonnet 5 con contexto de 1M · Para sesiones largas sobre bases de código grandes',
    },
    haiku: { sub: 'Haiku 4.5 · El más rápido para respuestas cortas' },
    opusplan: { label: 'Opus en modo plan', sub: 'Opus en modo plan, Sonnet en el resto' },
    unavailable: 'no disponible',
    /** The line under a model the agent moved to by itself - see modelMenu. */
    switchedItself: 'Claude Code cambió a este modelo por su cuenta.',
  },

  composer: {
    placeholder: 'Pregunta, o describe un cambio…',
    placeholderPlan: 'Describe qué planificar…',
    attach: 'Adjuntar archivos o carpetas',
    slash: 'Comandos con barra',
    improve: 'Mejorar el prompt',
    improveAgain: 'Otro intento, a partir de lo que escribiste',
    restore: 'Volver a lo que escribiste',
    stop: 'Parar',
    forceStop: 'No responde · Forzar la parada',
    forceStopHint: 'Claude no confirma la parada',
    queue: 'En cola',
    queueHint: 'Se envía cuando termine el turno actual',
    send: 'Enviar',
    run: 'Ejecutar',
    runHint: 'Se ejecuta en tu shell - Claude verá la salida con tu próximo mensaje',
    improveEmpty: 'Claude Code respondió con nada que poner en el campo.',
    improveChanged: 'El borrador cambió mientras se reescribía, así que se dejó como estaba.',
    improveTerminal: 'Un comando de terminal no se reescribe',
    voice: 'Dictar',
    voiceStop: 'Terminar el dictado',
  },

  header: {
    idle: 'En reposo',
    running: 'Claude está trabajando',
    done: 'Turno terminado',
    attention: 'Te está esperando',
    crashed: 'La sesión se cortó de forma inesperada',
    statistics: 'Estadísticas',
    closeStatistics: 'Cerrar las estadísticas',
    conversations: 'Conversaciones',
    newSession: 'Conversación nueva',
    menu: 'Menú',
    watchers: (n) => `Hay ${n} ${n === 1 ? 'cliente más viendo' : 'clientes más viendo'} este proyecto`,
  },

  thanks: {
    button: '¿Te gusta el plugin? Da las gracias',
    title: 'DAR LAS GRACIAS',
    star: 'Dar una estrella en GitHub',
    starSub: 'Ayuda a que otros encuentren el plugin',
    rate: 'Puntuarlo en la página del plugin',
    rateSub: 'Una reseña en el JetBrains Marketplace',
    share: 'Compartir con amigos',
    shareSub: 'Copia una línea sobre él y el enlace',
    shareCopied: 'Copiado - pégalo donde quieras',
    shareText:
      'Échale un ojo a Amazing Claude Code GUI - Claude Code como un panel en condiciones dentro de los IDE de JetBrains: https://plugins.jetbrains.com/plugin/33255-amazing-claude-code',
  },

  login: {
    checking: 'Buscando Claude Code…',
    notFound: 'No se encuentra Claude Code',
    notFoundText:
      'El panel funciona a través del CLI claude. Si está instalado, señálale dónde - el IDE no siempre ve el mismo PATH que tu terminal.',
    useThis: 'Usar este',
    whereLooked: 'Dónde ha buscado el panel',
    checkAgain: 'Comprobar otra vez',
    signIn: 'Inicia sesión en Claude Code',
    signInText:
      'Se inicia sesión una vez, en la terminal del IDE: Claude abre un navegador y espera a que vuelvas. El panel lo recoge solo.',
    logIn: 'Iniciar sesión',
    openTerminalAgain: 'Abrir la terminal otra vez',
    finishInTerminal: 'Termina el inicio de sesión en la terminal - esta pantalla se cierra sola.',
  },

  stream: {
    waitingForYou: 'Te está esperando',
    waitingForSubagent: 'Esperando a un subagente',
    waitingForSubagents: (n) => `Esperando a ${n} subagentes`,
    thinking: 'Claude está pensando',
    retryWaiting: (label, waited) => `${label} · esperando ${waited}`,
    withElapsed: (label, elapsed) => `${label} · ${elapsed}`,
  },

  agentTask: {
    failedBeforeFinishing: 'Falló antes de terminar.',
    stoppedBeforeFinishing: 'Se paró antes de terminar.',
    backgroundEnded: (outcome, duration) =>
      duration ? `El comando en segundo plano ${outcome} tras ${duration}.` : `El comando en segundo plano ${outcome}.`,
    outcomeFailed: 'falló',
    outcomeStopped: 'se paró',
    outcomeFinished: 'terminó',
    trimmed: (n) => `…se recortaron ${n} pasos anteriores`,
  },

  feed: {
    empty: { title: 'Pregúntale a Claude sobre este proyecto', hint: '@ para archivos · / para comandos' },
    you: 'TÚ',
    jumpToLatest: 'Ir a lo más reciente',
    copyBlock: 'Copiar este bloque',
    copyReply: 'Copiar toda la respuesta',
    pastedLines: (n) => `${n} ${n === 1 ? 'línea pegada' : 'líneas pegadas'}`,
    pasteClose: 'Volver a plegarlo',
    copyPaste: 'Copiar el texto pegado',
    pasteShown: (shown, total) => `Primeras ${shown} líneas de ${total} · al copiar se lleva todo`,
    fromOutput: 'de la salida',

    think: { chip: 'PIENSA', thoughts: (n) => `${n} ${n === 1 ? 'idea' : 'ideas'}` },

    workflow: {
      agents: (n) => `${n} ${n === 1 ? 'agente' : 'agentes'}`,
      running: (n) => `${n} en curso`,
      done: (n) => `${n} ${n === 1 ? 'listo' : 'listos'}`,
      failed: (n) => `${n} ${n === 1 ? 'fallido' : 'fallidos'}`,
      queued: 'en cola',
      skipped: 'omitido',
      attempt: (n) => `intento ${n}`,
      cached: 'del registro',
    },

    tool: {
      running: '· en curso',
      waitingForYou: '· te espera',
      failed: '· falló',
      lines: (n) => `· ${n} ${n === 1 ? 'línea' : 'líneas'}`,
      matches: (n) => (n > 0 ? `· ${n} ${n === 1 ? 'coincidencia' : 'coincidencias'}` : '· sin coincidencias'),
      output: (empty) => (empty ? '· sin salida' : '· con salida'),
      diff: (added, removed) => `· +${added} −${removed}`,
      moreLines: (n) => `… ${n} líneas más`,
      count: (n) => `${n} ${n === 1 ? 'herramienta' : 'herramientas'}`,
      closed: {
        replay: 'La conversación guardada no tiene el resultado de esta llamada.',
        exited: 'Claude Code dejó de responder antes de que esto terminara.',
        stopped: 'Se paró antes de terminar.',
        turnEnded: 'El turno acabó antes que esta llamada.',
        untracked: 'Sigue corriendo en segundo plano - el panel ya no lo sigue.',
      },
      closedMeta: {
        replay: '· no está en la transcripción',
        exited: '· interrumpido',
        stopped: '· interrumpido',
        turnEnded: '· sin terminar',
        untracked: '· suelto',
      },
    },

    /** The counter under a subagent's own log while it runs. */
      agentWorking: (duration) => `Trabajando · ${duration}`,
    task: {
      /** The heading over a subagent's errand inside its card in the feed (see TaskCard). */
      errand: 'LO QUE SE LE PIDIÓ',
      closed: {
        replay: 'Cómo acabó esto no está en la conversación guardada.',
        exited: 'La sesión terminó antes de que esto devolviera nada.',
        stopped: 'Se paró antes de devolver nada.',
        turnEnded: 'El turno acabó antes de que esto devolviera nada.',
        untracked: 'Sigue corriendo - el panel ya no lo sigue.',
      },
    },

    bash: { running: 'en curso', noOutput: 'sin salida' },

    checkpoint: {
      cleared: 'conversación borrada - de aquí para arriba ya no se recuerda nada',
      earlier: 'mensajes anteriores',
      notKept: 'los mensajes anteriores ya no se guardan',
      notOnPhone: 'los mensajes anteriores no se envían al teléfono',
      loadEarlier: 'cargar mensajes anteriores',
    },

    compact: {
      label: 'CONTEXTO',
      running: 'Compactando la conversación…',
      done: (manual) => `contexto compactado ${manual ? 'a mano' : 'automáticamente'}`,
      doneWith: (manual, before, after, took) =>
        `${manual ? 'a mano' : 'automáticamente'}: ${before} de contexto compactados en ${after ? `un resumen de ${after}` : 'un resumen'}${took ? ` en ${took}` : ''}`,
    },

    retry: {
      label: 'REINTENTO',
      reason: {
        rateLimited: 'Demasiadas peticiones',
        overloaded: 'API sobrecargada',
        auth: 'Fallo de autenticación',
        error: 'Error de la API',
      },
      attempt: (n) => `intento ${n}`,
      attemptOf: (n, max) => `intento ${n}/${max}`,
      retryingIn: (seconds) => `reintento en ${seconds} s`,
      retrying: 'reintentando…',
      recovered: (attempts) => `salió tras ${attempts} ${attempts === 1 ? 'intento' : 'intentos'}`,
      failed: (attempts) => `se rindió tras ${attempts} ${attempts === 1 ? 'intento' : 'intentos'}`,
      stopped: (attempts) => `se paró tras ${attempts} ${attempts === 1 ? 'intento' : 'intentos'}`,
    },

    result: {
      worked: (duration) => (duration ? `Trabajó ${duration}` : 'Trabajó'),
      stopped: (duration) => (duration ? `Lo paraste tú · ${duration}` : 'Lo paraste tú'),
    },

    modelSwitch: { label: 'MODELO', note: 'lo cambió Claude Code, no tú' },

    crash: {
      label: 'SESIÓN',
      text: 'Claude Code se cerró de forma inesperada.',
      textWithCode: (code) => `Claude Code se cerró de forma inesperada (código ${code}).`,
    },

    limit: {
      label: 'LÍMITE',
      extraLabel: 'USO EXTRA',
      extra: (window) =>
        `${window ? `El límite ${window}` : 'El límite de uso'} se ha agotado - el trabajo sigue como uso extra, facturado aparte del plan`,
      waiting: (window) => `${window ? `El límite ${window}` : 'El límite de uso'} se ha agotado - esperando a que se reinicie`,
      resetAt: (clock, left) => `${clock} · en ${left}`,
    },

    plan: {
      label: 'PLAN LISTO',
      steps: (n) => `· ${n} ${n === 1 ? 'paso' : 'pasos'}`,
      approve: 'Aprobar y ejecutar',
      keepPlanning: 'Seguir planificando',
      withdrawn: 'El agente dejó de esperar una decisión',
    },

    ask: {
      label: 'CLAUDE PREGUNTA',
      blocks: (n) => `${n} ${n === 1 ? 'pregunta' : 'preguntas'} · bloquea la ejecución`,
      pickAny: 'elige las que quieras',
      other: 'Otra',
      ownAnswer: 'escribe tu propia respuesta…',
      send: 'Enviar respuestas',
      pickToContinue: 'Elige para continuar',
      note: 'la ejecución sigue justo donde preguntó',
      expand: 'Desplegar la pregunta',
      collapse: 'Plegar la pregunta',
      dismiss: 'Cerrar la pregunta',
      dismissHint: 'Cerrar y responder con tus palabras',
    },

    findings: {
      label: 'REVISIÓN',
      fixed: 'arreglado',
      skipped: 'omitido',
      noChange: 'no hace falta cambiar nada',
      unconfirmed: 'sin confirmar',
    },

    copy: { copied: 'Copiado', click: 'Clic para copiar' },
  },

  chrome: {
    tasks: {
      label: 'TAREAS',
      listLabel: 'LISTA DE TAREAS',
      progress: (done, total) => `${done} / ${total} hechas`,
      collapse: 'Plegar la lista de tareas',
      expand: 'Ver el resto de la lista',
    },
    queue: {
      label: 'EN COLA',
      hint: (n) => `${n} saldrán en orden cuando termine la ejecución · arrastra para reordenar`,
    },
    selection: { quote: 'Citar', fork: 'Bifurcar desde aquí' },
    streams: {
      main: 'principal',
      background: 'fondo',
      stopAgent: 'Parar este agente',
      stopAgentNamed: (name) => `Parar: ${name}`,
      stopAgentTitle: '¿Parar este agente?',
      stopCommand: 'Parar este comando',
      stopCommandTitle: '¿Parar este comando?',
    },
    confirm: { cancel: 'Cancelar', stop: 'Parar', open: 'Abrir' },
    resume: { title: 'Esta pestaña sigue trabajando. ¿Abrir aquí la conversación anterior?' },
    noChats: { title: 'No hay conversaciones abiertas', button: 'Nueva conversación' },
    crash: {
      title: 'El panel se ha topado con un error',
      text: 'Recargar es seguro: tus conversaciones viven en los procesos de Claude Code que hay detrás del panel y le sobreviven.',
      button: 'Recargar el panel',
    },
  },

  remote: {
    codeLabel: 'Código de emparejamiento',
    states: {
      idle: { label: 'Apagado', hint: 'A este IDE no se llega desde fuera.' },
      connecting: { label: 'Conectando…', hint: 'Primer contacto con el relay.' },
      connected: { label: 'Conectado', hint: 'Un dispositivo vinculado puede ver este proyecto.' },
      reconnecting: {
        label: 'Reconectando…',
        hint: 'Se cayó la línea. Es normal - vuelve sola.',
      },
      unreachable: {
        label: 'Relay inalcanzable',
        hint: 'El relay no responde. Tu trabajo no se ve afectado; solo el teléfono.',
      },
      refused: {
        label: 'Rechazado',
        hint: 'El relay no aceptó este plugin: puede ser demasiado viejo, o que otro IDE ocupe esta dirección.',
      },
    },
    agent: (id) => `agente ${id}`,
    thisIde: 'ESTE IDE',
    relay: 'RELAY',
    device: 'DISPOSITIVO',
    allow: 'Permitir llegar a este IDE en remoto',
    allowHint: 'Apagado hasta que lo enciendas, y apagado otra vez en cuanto lo vuelvas a apagar.',
    relayAddress: 'DIRECCIÓN DEL RELAY',
    noSafe:
      'Este IDE está configurado para no recordar contraseñas, así que una vinculación no sobrevivirá a un reinicio. Activa el almacén de contraseñas del IDE si quieres que aguante.',
    wantsToPair: (device) => `${device} quiere vincularse`,
    checkFingerprint: 'Así se llama el dispositivo a sí mismo - comprueba que la huella de abajo coincide con la de su pantalla.',
    allowDevice: 'Permitir',
    refuse: 'Rechazar',
    scanThis: 'Escanea esto con el teléfono',
    codeNote: (left) =>
      `${left} · sirve una vez. El secreto está en la parte de la dirección después de la almohadilla, que los navegadores nunca mandan al servidor.`,
    minutesLeft: (minutes) => `quedan ${minutes} min`,
    secondsLeft: (seconds) => `quedan ${seconds} s`,
    stopOffering: 'Dejar de ofrecerlo',
    pairDevice: 'Vincular un dispositivo',
    pairedDevices: 'DISPOSITIVOS VINCULADOS',
    revoke: 'Revocar',
    whatTravels: 'Qué sale de aquí y qué puede hacer un teléfono',
    whatTravelsSub: 'Léelo antes de activarlo',
    fingerprint: 'La huella de este IDE',
    about: {
      first:
        'Con esto activado, tus conversaciones pasan por un relay para que un teléfono vinculado pueda leerlas y responder. Eso incluye lo que el agente lee y escribe: código fuente, rutas de archivos, la salida de los comandos.',
      second:
        'El relay no puede leer nada de eso - el contenido va sellado entre este IDE y tu teléfono. Sí ve cuándo estás conectado y cuánto pasa por él, que es más o menos tu horario. Puedes levantar un relay propio.',
      can: 'Un teléfono vinculado puede responder permisos, enviar mensajes y parar un turno.',
      cannot:
        'No puede ejecutar comandos de shell, instalar plugins, cambiar el modo de permisos ni tocar el portapapeles de esta máquina.',
      third:
        'Una vinculación se prueba con un código que se muestra una sola vez en esta pantalla. Comparar las dos huellas atrapa lo único que el código no puede: alguien que fotografió la pantalla y escaneó antes.',
    },
  },

  feedback: {
    button: 'Reportar un fallo o mandar una idea',
    kinds: {
      bug: { label: 'Fallo', placeholder: '¿Qué pasó, y qué esperabas en su lugar?' },
      idea: { label: 'Idea', placeholder: '¿Qué te gustaría que hiciera el panel?' },
      hello: { label: 'Hola', placeholder: 'Lo que sea - llega a una persona, no a una cola.' },
    },
    email: 'CORREO',
    emailOptional: 'opcional',
    attachments: 'ADJUNTOS',
    addFiles: 'Añadir archivos',
    removeFile: (name) => `Quitar: ${name}`,
    attachTotal: (count, max, size, budget) => `${count} de ${max} · ${size} de ${budget}`,
    logs: 'Adjuntar registros de depuración',
    logsFromTab: (tab) => `De la pestaña ${tab} - `,
    logsFromOpenTab: 'De la pestaña que tienes abierta ahora: ',
    logsWhat:
      'versiones, tiempos y lo que falló. Ni tu conversación, ni tus nombres de archivo, ni tus rutas - y puedes leerlo entero antes de que salga.',
    logsOnlyBug:
      'Solo con un fallo: el informe es el relato de algo que salió mal, y aquí no hay nada que contar.',
    seeWhat: 'Ver exactamente qué se adjunta',
    send: 'Enviar',
    sending: 'Enviando…',
    sentPartly: (note) => `Enviado, pero no todo. ${note}`,
    sent: 'Enviado. Gracias ❤️ - me llega directamente.',
    notSent: 'No se pudo enviar. No se perdió nada - inténtalo otra vez.',
    reportNote: (tab) =>
      `Este es el adjunto entero, palabra por palabra${tab ? `, para la pestaña ${tab}` : ''}. Se construye aquí, en tu IDE, con lo que el propio plugin vio: versiones, la forma de esa conversación y todo lo que falló. Los nombres de archivo aparecen como hashes cortos, así que el mismo archivo se lee como el mismo sin decir cuál es.`,
    building: 'Construyéndolo…',
    copy: 'Copiar',
    problems: {
      empty: 'Escribe unas palabras primero.',
      tooLong: (max) => `Eso pasa de ${max} caracteres.`,
      tooMany: (max) => `No más de ${max} archivos.`,
      tooHeavy: (budget) => `Los archivos suman más de ${budget}.`,
    },
  },

  mcp: {
    empty: 'No hay servidores MCP configurados.',
    addServer: 'AÑADIR SERVIDOR',
    namePlaceholder: 'nombre',
    commandPlaceholder: 'comando, o URL para sse/http',
    refreshAll: 'Refrescar todos',
    refreshing: 'Refrescando…',
    add: 'Añadir',
    adding: 'Añadiendo…',
    authenticate: 'Iniciar sesión',
    opening: 'Abriendo…',
    reconnect: 'Reconectar',
    retry: 'Reintentar',
    reconnecting: 'Reconectando…',
    remove: 'Quitar',
    removing: 'Quitando…',
    status: { connected: 'conectado', needsAuth: 'requiere inicio de sesión', failed: 'falló', pending: 'conectando…', disabled: 'desactivado' },
  },

  plugins: {
    tabInstalled: 'Instalados',
    tabBrowse: 'Explorar',
    tabMarkets: 'Mercados',
    emptyInstalled: 'No hay plugins instalados.',
    searchPlaceholder: 'Buscar plugins por nombre o descripción…',
    noMarketplaces: 'No hay marketplaces conectados.',
    noMatches: 'Sin coincidencias.',
    emptyMarketplaces: 'No hay marketplaces configurados.',
    addMarketplace: 'AÑADIR MARKETPLACE',
    marketplacePlaceholder: 'URL, ruta, o owner/repo en GitHub',
    refresh: 'Refrescar',
    refreshing: 'Refrescando…',
    install: 'Instalar',
    installing: 'Instalando…',
    uninstall: 'Desinstalar',
    uninstalling: 'Desinstalando…',
    enable: 'Activar',
    enabling: 'Activando…',
    disable: 'Desactivar',
    disabling: 'Desactivando…',
    add: 'Añadir',
    adding: 'Añadiendo…',
    remove: 'Quitar',
    removing: 'Quitando…',
  },

  mobile: {
    pair: 'Vincular',
    removeFromQueue: 'Quitar de la cola',
    newSessionTitle: 'conversación nueva',

    sessions: {
      nothingYet: 'Todavía no hay nada que mostrar. Abre un proyecto en el IDE, o vincula otro.',
      nonePaired: 'Este teléfono aún no está vinculado a ningún IDE. Toca Vincular para añadir uno.',
      recentlyOpened: 'Abiertos hace poco',
      projectClosed: 'Ahora mismo no está abierto en el IDE.',
      noConversations: 'Todavía no hay conversaciones.',
      hidden: (n) => `${n} ocultas · mostrar`,
      pastConversations: 'Conversaciones anteriores',
      newChat: 'Conversación nueva',
      reach: {
        connecting: 'Conectando…',
        asleep: 'Conectado al relay, pero ningún IDE responde.',
        elsewhere: 'También está abierto en otra pestaña o en la app instalada - esa copia tiene la conexión.',
        reconnecting: 'Reconectando… la lista de abajo puede estar desactualizada.',
        offline: 'No se llega al relay. No se pierde nada - esto vuelve solo.',
      },
      agent: {
        connecting: 'conectando…',
        asleep: 'no responde',
        elsewhere: 'abierto en otro sitio',
        reconnecting: 'reconectando…',
        offline: 'sin conexión',
      },
    },

    history: { title: 'Historial', empty: 'Todavía no hay conversaciones anteriores en este proyecto.' },

    decision: {
      planWaiting: 'Hay un plan esperando',
      questionOf: (n, total) => `Pregunta ${n} de ${total}`,
      nothingWaiting: 'Aquí ya no queda nada esperándote.',
      openConversation: 'Abrir la conversación',
      allowOnce: 'Permitir una vez',
      deny: 'Denegar',
    },

    thread: {
      loading: 'Cargando la conversación…',
      waitingPerm: 'Hace falta un permiso - respóndelo',
      waitingAsk: 'Hay una pregunta esperando - respóndela',
      waitingPlan: 'Hay un plan esperando - decide',
    },

    newSession: {
      title: 'Conversación nueva',
      asConfigured: 'Como esté configurado',
      asConfiguredSub: 'Como esté puesto Claude Code en esa máquina.',
      model: 'Modelo',
      effort: 'Esfuerzo',
      mode: 'Modo',
      closedProject: 'Este proyecto está cerrado - el IDE lo abrirá antes de empezar.',
      start: 'Empezar',
      opening: 'Abriendo el proyecto…',
    },

    pairing: {
      title: 'Vincular con un IDE',
      fromCode: 'Vinculando con el IDE que mostró este código. Ahora le está pidiendo permiso a quien esté en la máquina.',
      how: 'En el IDE, abre el menú del panel → Acceso remoto → Vincular un dispositivo. Escanea el código con la cámara, o escríbelo abajo.',
      fingerprintAsk: 'El IDE está mostrando una huella. Permítelo solo si dice:',
      fingerprintNote: 'El IDE te pedirá confirmar y mostrará una huella. Esta app mostrará la misma - permítelo solo si coinciden.',
      waiting: 'Esperando al IDE…',
      done: 'Vinculado.',
      failed: 'La vinculación no funcionó.',
      notACode: 'Eso no parece un código de vinculación.',
      iphone: 'Un iPhone',
      ipad: 'Un iPad',
      android: 'Un teléfono Android',
      browser: 'Un navegador',
    },

    composer: {
      commands: 'Comandos',
      closeList: 'Cerrar la lista',
      usageLimits: 'Límites de uso',
      removeImage: (name) => `Quitar: ${name}`,
      say: 'Di algo…',
      reconnecting: 'Reconectando…',
      slash: 'Comandos con barra',
      attachPhoto: 'Adjuntar una foto',
      voice: 'Dictar',
      voiceStop: 'Terminar el dictado',
      stop: 'Parar la ejecución',
      whatTravels: 'Qué viaja entre tu IDE y este teléfono',
      projectFiles: 'Archivos del proyecto',
      ofTotal: (shown, total) => `${shown} de ${total}`,
      photosDropped: (n) => `Otras ${n} no caben en un mensaje - manda primero estas.`,
      photoTooBig: 'Eso no cabe en un mensaje. Prueba con una foto cada vez.',
    },

    limits: {
      title: 'Límites y contexto',
      fiveHourWindow: 'Ventana de cinco horas',
      weeklyWindow: 'Ventana semanal',
      paceNote: (percent) =>
        `El arco tenue es el ritmo constante: a día de hoy ya “toca” el ${percent}% de la semana. Mientras el arco brillante sea más corto, la semana va en plan.`,
      context: 'El contexto de esta conversación',
      ofTotal: (used, total) => `${used} de ${total}`,
      spentToday: 'Gastado hoy',
      acrossProjects: 'en todos los proyectos',
      noWindows: 'El IDE todavía no ha informado de las ventanas de la suscripción.',
      extraUsage: 'Uso extra',
      extraUsed: (window) =>
        `${window ? `el límite ${window}` : 'el límite'} se ha agotado, se factura aparte del plan`,
      resetUnknown: 'aún no se sabe cuándo se reinicia',
      resetsIn: (left) => `se reinicia en ${left}`,
    },
  },

  status: {
    todayTokens: 'Tokens gastados hoy, en todos los proyectos',
    openPr: 'Abrir el pull request en el navegador',
    noPr: 'sin PR',
    effortHint: (effort) => `Esfuerzo de razonamiento: ${effort}`,
    modelHint: (model) => `Modelo: ${model}`,
    modelHintSwitched: (model, from) => `Modelo: ${model} - Claude Code cambió a él por su cuenta, desde ${from}`,
    modeHint: (mode) => `Modo de permisos: ${mode}`,
    sessionLimit: 'Límite de 5 horas',
    weekLimit: 'Límite semanal',
    windowUsed: (title, percent) => `${title}: ${percent}% usado`,
    resetsIn: (left) => `Se reinicia en ${left}`,
    paceBudget: (percent) => `Anillo tenue: ${percent}% del gasto a ritmo constante para hoy`,
    extraUsage: (limit) => `Uso extra: ${limit} se ha agotado, el trabajo se factura aparte del plan`,
    extraSpent: (percent) => `${percent}% del uso extra mensual gastado`,
    limitNamed: (window) => `el límite ${window}`,
    limitUnnamed: 'el límite',
  },

  limits: {
    fiveHour: 'de 5 horas',
    weekly: 'semanal',
    weeklyOpus: 'semanal de Opus',
    weeklySonnet: 'semanal de Sonnet',
    weeklyApps: 'semanal de apps',
    weeklyWithExtra: 'semanal, uso extra incluido',
    extra: 'de uso extra',
  },

  permission: {
    label: 'PERMISO',
    decisions: { once: 'Permitir una vez', always: 'Permitir siempre', deny: 'Denegar' },
    underMode: (mode) => `Modo: ${mode}`,
  },

  selectors: {
    model: 'MODELO',
    effort: 'ESFUERZO',
    mode: 'MODO',
    modeHint: 'shift+tab',
  },

  commands: {
    resume: 'abrir una conversación anterior de este proyecto',
    fork: 'seguir esta conversación en una pestaña nueva',
    login: 'iniciar sesión en Claude Code desde la terminal del IDE',
    logout: 'cerrar sesión - abre la terminal del IDE',
    model: 'cambiar el modelo de esta sesión',
    effort: 'ajustar cuánto piensa Claude antes de actuar',
    context: 'qué ocupa ahora mismo la ventana de contexto',
    cost: 'gasto y ventanas de uso de esta sesión',
    usage: 'ventanas de la suscripción y cuándo se reinician',
    codeReview: 'revisar un pull request',
  },
}
