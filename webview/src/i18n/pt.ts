import type { Dict } from './en'

/**
 * Português do Brasil. Tradução do dicionário em inglês (ver en.ts), não um texto à parte.
 *
 * Trata o usuário por "você", como o original. Nomes de produto (Claude Code, MCP, Opus, Sonnet, Haiku,
 * Git, PR) e nomes de ferramentas do CLI não são traduzidos. O travessão do original é um hífen com
 * espaços, e aqui continua assim.
 */
export const pt: Dict = {
  common: {
    back: 'Voltar',
    close: 'Fechar',
    closeMenu: 'Fechar o menu',
    loading: 'Carregando…',
    muted: 'sem som',
    countOn: (n) => `${n} ligados`,
  },

  menu: {
    titles: {
      menu: { title: 'MENU', hint: 'tudo o que o painel mantém fora do caminho' },
      history: { title: 'HISTÓRICO', hint: 'conversas anteriores deste projeto' },
      mcp: { title: 'SERVIDORES MCP', hint: 'estado · entrar · reconectar' },
      plugins: { title: 'PLUGINS', hint: 'instalados · explorar · marketplaces' },
      settings: { title: 'CONFIGURAÇÕES', hint: 'como o painel se comporta e como ele soa' },
      sounds: { title: 'AVISOS SONOROS', hint: 'quando o painel chama você' },
      remote: { title: 'ACESSO REMOTO', hint: 'estado · relay · dispositivos pareados' },
      remoteAbout: { title: 'O QUE SAI DAQUI', hint: 'leia antes de ligar' },
      defaultMode: { title: 'MODO PADRÃO', hint: 'com o que as novas abas começam' },
      composerLayout: { title: 'LAYOUT DO CAMPO', hint: 'onde fica o campo de escrita' },
      pasteCollapse: { title: 'TEXTO COLADO', hint: 'quando uma colagem vira um chip' },
      sendKey: { title: 'ENVIAR UMA MENSAGEM', hint: 'qual tecla envia' },
      improvePrompt: { title: 'MELHORAR O PROMPT', hint: 'o que o botão da estrela pede' },
      voice: { title: 'ENTRADA POR VOZ', hint: 'ditar em vez de digitar' },
      voiceLanguage: { title: 'IDIOMA FALADO', hint: 'o que o ditado escuta' },
      voiceDevice: { title: 'MICROFONE', hint: 'por qual escutar' },
      language: { title: 'IDIOMA', hint: 'em que idioma o painel fala' },
      accounts: { title: 'CONTAS DO CLAUDE', hint: 'qual assinatura paga o trabalho' },
      feedback: { title: 'FEEDBACK', hint: 'um bug, uma ideia ou só um oi' },
      feedbackLog: { title: 'O QUE VAI ANEXADO', hint: 'o relatório inteiro, antes de ir' },
    },

    groups: {
      author: 'DO AUTOR',
    },

    rows: {
      history: { label: 'Histórico', sub: 'Conversas anteriores deste projeto' },
      statistics: { label: 'Estatísticas', sub: 'Horas, hábitos, conquistas' },
      mcp: { label: 'Servidores MCP', sub: 'Estado, entrada, reconexão' },
      plugins: { label: 'Plugins', sub: 'Instalados, explorar, marketplaces' },
      remote: { label: 'Acesso remoto', sub: 'Estado, relay, dispositivos pareados' },
      accounts: { label: 'Contas do Claude', sub: 'Trocar sem sair da conta' },
      settings: { label: 'Configurações', sub: 'Sons, modo, layout, idioma' },
      feedback: { label: 'Enviar feedback', sub: 'Um bug, uma ideia ou só um oi' },
    },

    author: {
      title: 'Tem uma entrevista chegando?',
      body: 'Fiz um assistente de IA para ela. Teste de graça - e me ajude. Obrigado',
      tagline: 'copiloto de entrevistas em tempo real',
    },

    footer: 'Amazing Claude Code GUI',
  },

  settings: {
    rows: {
      sounds: { label: 'Avisos sonoros', sub: 'Quando o painel chama você' },
      defaultMode: { label: 'Modo padrão', sub: 'Com o que as novas abas começam' },
      composerLayout: { label: 'Layout do campo', sub: 'Onde fica o campo de escrita' },
      pasteCollapse: { label: 'Texto colado', sub: 'Quando uma colagem vira um chip' },
      sendKey: { label: 'Enviar uma mensagem', sub: 'Qual tecla envia' },
      improvePrompt: { label: 'Melhorar o prompt', sub: 'O que o botão da estrela pede' },
      voice: { label: 'Entrada por voz', sub: 'Dite com a sua própria chave da Deepgram' },
      language: { label: 'Idioma', sub: 'Em que idioma o painel fala' },
    },

    improveSummary: { builtIn: 'Padrão', custom: 'Personalizado' },
  },

  language: {
    note: 'Só o painel. O idioma em que o Claude responde é uma configuração do próprio Claude Code, compartilhada com o terminal, e isto aqui não mexe nela.',
    followIde: 'Automático',
    followIdeSub: (language) => `Seguir a IDE - agora, ${language}`,
    followIdeUnknown: 'Seguir a IDE',
  },

  sounds: {
    turnFinished: { label: 'Turno concluído', hint: 'o Claude respondeu e está esperando por você' },
    permission: { label: 'Permissão pedida', hint: 'uma chamada de ferramenta precisa da sua aprovação' },
    question: { label: 'Pergunta feita', hint: 'o Claude pediu que você escolha uma resposta' },
    plan: { label: 'Plano pronto', hint: 'um plano está esperando sua aprovação' },
    rateLimit: { label: 'Limite atingido', hint: 'o limite da assinatura parou o turno' },
    extraUsage: {
      label: 'Começou o uso extra',
      hint: 'o plano acabou - daqui em diante o trabalho é cobrado à parte',
    },
    trouble: { label: 'Algo quebrou', hint: 'um erro, um processo morto ou uma sessão deslogada' },
    play: 'Ouvir',
    playNamed: (sound) => `Ouvir: ${sound}`,
    volumeOf: (sound) => `Volume de: ${sound}`,
  },

  history: {
    empty: 'Ainda não há conversas anteriores aqui.',
    today: 'HOJE',
    earlier: 'ANTES',
    messages: (n) => (n === 1 ? `${n} mensagem` : `${n} mensagens`),
  },

  search: {
    title: 'Buscar',
    button: 'Buscar nas conversas',
    tabs: { chat: 'Este chat', project: 'Todos os chats', ai: 'Perguntar ao Claude' },
    placeholder: 'Palavras, ou uma frase "entre aspas"…',
    aiPlaceholder: 'Descreva o que procura: sobre o que era, mais ou menos quando…',
    aiNote: 'Claude lê as conversas deste projeto · uma execução à parte, conta no seu consumo',
    find: 'Buscar',
    cancel: 'Cancelar',
    retry: 'Tentar de novo',
    copy: 'Copiar',
    openInChat: 'Abrir no chat',
    aiSearching: 'Lendo as conversas…',
    noChat: 'Esta aba ainda não tem conversa: tente todos os chats.',
    typeToSearch: 'Os resultados aparecerão aqui.',
    aiEmpty: 'Descreva acima e pressione Buscar.',
    nothing: 'Nada encontrado.',
    nothingHere: 'Nada neste chat.',
    aiNothing: 'O modelo não encontrou nada que sirva.',
    results: (n) => (n === 1 ? '1 resultado' : `${n} resultados`),
    inChats: (n, chats) => `${n} em ${chats === 1 ? '1 chat' : `${chats} chats`}`,
    showing: (shown, total) => `mostrando ${shown} de ${total}`,
    places: (n) =>
      n === 1 ? '1 lugar que o modelo aponta' : `${n} lugares que o modelo aponta`,
    you: 'Você',
    more: 'Mostrar a mensagem inteira',
    less: 'Mostrar menos',
    clear: 'Limpar',
    matchCase: 'Diferenciar maiúsculas',
    wholeWords: 'Só palavras inteiras',
    chars: (shown, total) => `${shown} de ${total} caracteres`,
    failed: 'A busca falhou.',
    failedLabel: 'FALHOU',
    steps: {
      grep: (subject) => `procurou “${subject}”`,
      read: (subject) => `leu “${subject}”`,
      list: 'leu a lista de conversas',
      other: 'passou pelos arquivos',
      count: (n) => (n === 1 ? '1 passo' : `${n} passos`),
    },
    capsule: {
      reopen: 'Voltar à busca',
      close: 'Fechar a busca',
      loading: 'Procurando a mensagem…',
      missing: 'não está entre as mensagens carregadas',
      previous: 'Ocorrência anterior neste chat',
      next: 'Próxima ocorrência neste chat',
    },
  },

  composerLayout: {
    bottom: 'Padrão',
    compact: 'Compacto',
    left: 'Esquerda',
    right: 'Direita',
  },

  pasteCollapse: {
    note: 'Uma colagem longa vira um chip para que uma parede de texto não encha o campo de entrada. As linhas são contadas como ficariam no próprio campo, então um texto colado em uma única linha sem fim também vira chip. Nada se perde em nenhum dos casos: uma colagem recolhida guarda o texto inteiro e volta ao campo pelo botão do lápis.',
    never: 'Nunca recolher',
    neverSub: 'Tudo o que for colado fica no campo como texto comum',
    from: (lines) => `A partir de ${lines} linhas`,
    foldLabel: 'Recolher colagens longas',
    foldSub: (min, max) => `A partir de quantas linhas - ${min} a ${max}`,
  },

  sendKey: {
    note: 'Qual tecla solta a mensagem. A outra quebra a linha, então uma mensagem de vários parágrafos é digitada com a mesma tecla de qualquer forma.',
    enter: 'Enter',
    enterSub: 'Shift+Enter quebra a linha',
    modEnter: (mod: string): string => `${mod}+Enter`,
    modEnterSub: 'Enter quebra a linha',
  },

  improvePrompt: {
    note: 'O botão da estrela, ao lado do clipe, reescreve o que está no campo de escrita. É isto que ele pede. Sai como uma execução própria do Claude Code - sem ferramentas, sem arquivos, sem conversa - e conta no seu uso como qualquer outra mensagem.',
    label: 'INSTRUÇÕES',
    emptyMeans: 'Vazio significa o texto cinza acima - o que o botão usa de fábrica.',
    builtInLanguage:
      'Está em inglês porque é uma instrução para o modelo, não parte da interface: ele já pede a resposta no idioma do rascunho. O seu pode estar em qualquer idioma.',
    editBuiltIn: 'Editar o texto embutido',
    backToBuiltIn: 'Voltar ao texto embutido',
  },

  voice: {
    note: 'Segure uma tecla e fale - as palavras aparecem no campo enquanto você diz. Funciona com a sua própria chave da Deepgram: o áudio vai para a Deepgram e para mais lugar nenhum, o plugin não tem servidor no meio.',
    off: 'Desligada',
    enable: 'Entrada por voz',

    key: 'CHAVE DA DEEPGRAM',
    keyPlaceholder: 'Cole a sua chave',
    keySet: (tail: string): string => `Chave guardada, terminando em ${tail}`,
    keySave: 'Salvar',
    keyForget: 'Esquecer esta chave',

    balanceLeft: (amount: string): string => `Restam ${amount} na conta`,
    balanceChecking: 'Perguntando à Deepgram…',
    balanceNoKey: 'Ainda sem chave.',
    balanceNoAccess: 'A chave funciona. Para ver o saldo é preciso uma chave com papel Owner ou Admin.',
    balanceRejected: 'A Deepgram não reconhece esta chave.',
    balanceFailed: 'Não deu para falar com a Deepgram. Verifique a rede e tente de novo.',
    balanceRefresh: 'Atualizar',

    getKey: 'Ainda sem chave?',
    getKeyHint: 'Cadastre-se em deepgram.com e crie uma chave de API. $200 de crédito sem cartão.',
    openSite: 'Abrir deepgram.com',

    hotkeys: 'ATALHOS',
    push: 'Segurar para falar',
    pushHint: 'Grava enquanto você segura e para quando solta.',
    hold: 'Mãos livres',
    holdHint: 'Um toque começa, o seguinte termina.',
    keyboard: 'TECLA',
    mouse: 'MOUSE',
    record: 'Definir',
    recording: 'Pressione uma tecla…',
    recordingMouse: 'Pressione um botão…',
    notSet: 'Não definido',
    clear: 'Limpar',
    sideLeft: 'Esquerdo',
    sideRight: 'Direito',
    badButton: 'Só servem os botões laterais do mouse - os três principais já significam alguma coisa em toda a IDE.',

    language: 'Idioma falado',
    languageHint: 'O que o ditado escuta',
    searchLanguages: 'Buscar idioma…',
    multiHint: 'O modo multilíngue acompanha a troca de idioma no meio da frase. Medido contra um idioma nomeado, ele perde nos dois casos - escolha só se você realmente mistura duas línguas na mesma frase.',

    device: 'Microfone',
    deviceHint: 'Por qual escutar',
    deviceDefault: 'Padrão do sistema',
    deviceDefaultHint: 'Segue o que o sistema estiver usando',
    deviceNote: 'A mudança vale a partir do próximo ditado.',

    promo: {
      title: 'Gostou de ditar por aqui?',
      body: 'Segure uma tecla e fale em qualquer outra janela: meu outro app escreve sua voz onde você estiver. Cadastre-se agora e continua grátis para você.',
      tagline: 'ditado para Mac e Windows',
    },

    errorNoKey: 'Adicione primeiro uma chave da Deepgram - Configurações e depois Entrada por voz.',
    errorNoKeyRemote: 'Não há chave da Deepgram na máquina onde esta conversa roda - adicione lá, em Configurações, Entrada por voz.',
    errorOff: 'A entrada por voz está desligada na máquina onde esta conversa roda - ligue lá, em Configurações.',
    errorMicrophone: 'O microfone não abriu. Outro aplicativo pode estar com ele.',
    errorKey: 'A Deepgram recusou a chave. Confira na tela de entrada por voz.',
    errorNetwork: 'Não deu para falar com a Deepgram. Verifique a rede e tente de novo.',
    errorGeneral: 'O ditado parou. Tente de novo.',
  },

  modes: {
    manual: {
      label: 'Pedir permissão',
      sub: 'Lê à vontade; pergunta antes de cada escrita e cada comando.',
      short: 'Pede',
    },
    acceptEdits: {
      label: 'Aceitar edições',
      sub: 'Aprova sozinho as edições de arquivo no diretório de trabalho. Para a shell, ainda pergunta.',
      short: 'Aceita',
    },
    plan: {
      label: 'Plano',
      sub: 'Pesquisa e propõe um plano. Não toca em nada até você aprovar.',
      short: 'Plano',
    },
    auto: {
      label: 'Auto',
      sub: 'Sem perguntas - um classificador avalia cada ação arriscada. Não está em todos os modelos.',
      short: 'Auto',
    },
    dontAsk: {
      label: 'Não perguntar',
      sub: 'Nunca pergunta; nega tudo o que não foi aprovado antes. Para execuções sem ninguém olhando.',
      short: 'Calado',
    },
    bypassPermissions: {
      label: 'Ignorar permissões',
      sub: 'Pula quase toda verificação. Exclusões perigosas ainda perguntam. Só em contêineres e VMs descartáveis.',
      short: 'Pula',
    },
    tags: {
      default: 'padrão',
      readOnly: 'só leitura',
      preview: 'prévia',
      settings: 'configurações',
      danger: 'perigo',
    },
  },

  effort: {
    auto: { sub: 'Volta ao esforço padrão do modelo para esta sessão.' },
    ultracode: {
      sub: 'Raciocínio xhigh mais fluxos automáticos com vários agentes quando a tarefa pede.',
    },
    max: { sub: 'Tudo o que ele tem. Arquitetura e bugs cabeludos.' },
    xhigh: { sub: 'Mais do mesmo, para mudanças espalhadas por muitos arquivos.' },
    high: { sub: 'Raciocínio longo antes de agir. Mudanças em vários arquivos.' },
    medium: { sub: 'Equilibrado. Bom padrão para trabalhar em funcionalidades.' },
    low: { sub: 'Pensa o mínimo. Edições mecânicas e respostas rápidas.' },
    tags: { ultra: 'ultra', slow: 'lento', default: 'padrão' },
  },

  models: {
    default: { label: 'Padrão (recomendado)', sub: 'Usa o modelo com que esta sessão começa.' },
    opus: { sub: 'Opus 5 · O melhor para o dia a dia e tarefas complexas' },
    opus1m: {
      label: 'Opus (contexto de 1M)',
      sub: 'Opus 5 com contexto de 1M · Para sessões longas em bases de código grandes',
    },
    sonnet: { sub: 'Sonnet 5 · Eficiente em tarefas rotineiras' },
    sonnet1m: {
      label: 'Sonnet (contexto de 1M)',
      sub: 'Sonnet 5 com contexto de 1M · Para sessões longas em bases de código grandes',
    },
    haiku: { sub: 'Haiku 4.5 · O mais rápido para respostas curtas' },
    opusplan: { label: 'Opus no modo plano', sub: 'Opus no modo plano, Sonnet no resto' },
    unavailable: 'indisponível',
    /** The line under a model the agent moved to by itself - see modelMenu. */
    switchedItself: 'O Claude Code trocou para este modelo sozinho.',
  },

  composer: {
    placeholder: 'Pergunte, ou descreva uma mudança…',
    placeholderPlan: 'Descreva o que planejar…',
    attach: 'Anexar arquivos ou pastas',
    slash: 'Comandos com barra',
    improve: 'Melhorar o prompt',
    improveAgain: 'Outra tentativa, a partir do que você escreveu',
    restore: 'Voltar ao que você escreveu',
    stop: 'Parar',
    forceStop: 'Não responde · Forçar a parada',
    forceStopHint: 'O Claude não está confirmando a parada',
    queue: 'Na fila',
    queueHint: 'Vai quando o turno atual terminar',
    send: 'Enviar',
    run: 'Executar',
    runHint: 'Roda na sua shell - o Claude vê a saída na sua próxima mensagem',
    improveEmpty: 'O Claude Code respondeu sem nada para colocar no campo.',
    improveChanged: 'O rascunho mudou durante a reescrita, então ele ficou como estava.',
    improveTerminal: 'Um comando de terminal não é reescrito',
    voice: 'Ditar',
    voiceStop: 'Terminar o ditado',
  },

  header: {
    idle: 'Parado',
    running: 'O Claude está trabalhando',
    done: 'Turno concluído',
    attention: 'Esperando você',
    crashed: 'A sessão parou de forma inesperada',
    statistics: 'Estatísticas',
    closeStatistics: 'Fechar as estatísticas',
    conversations: 'Conversas',
    newSession: 'Nova conversa',
    menu: 'Menu',
    watchers: (n) => `Há mais ${n} ${n === 1 ? 'cliente vendo' : 'clientes vendo'} este projeto`,
  },

  thanks: {
    button: 'Curtindo o plugin? Diga obrigado',
    title: 'DIZER OBRIGADO',
    star: 'Dar uma estrela no GitHub',
    starSub: 'Ajuda outras pessoas a encontrarem o plugin',
    rate: 'Avaliar na página do plugin',
    rateSub: 'Uma avaliação no JetBrains Marketplace',
    share: 'Compartilhar com amigos',
    shareSub: 'Copia uma linha sobre ele e o link',
    shareCopied: 'Copiado - cole onde quiser',
    shareText:
      'Dá uma olhada no Amazing Claude Code GUI - o Claude Code como um painel de verdade dentro das IDEs da JetBrains: https://plugins.jetbrains.com/plugin/33255-amazing-claude-code',
  },

  login: {
    checking: 'Procurando o Claude Code…',
    notFound: 'Claude Code não encontrado',
    notFoundText:
      'O painel funciona pelo CLI claude. Se ele estiver instalado, aponte onde - a IDE nem sempre enxerga o mesmo PATH do seu terminal.',
    useThis: 'Usar este',
    whereLooked: 'Onde o painel procurou',
    checkAgain: 'Verificar de novo',
    orSwitch: 'Ou troque para outra conta:',
    signIn: 'Entre no Claude Code',
    signInText:
      'O login é feito uma vez, no terminal da IDE: o Claude abre um navegador e espera você voltar. O painel percebe sozinho.',
    logIn: 'Entrar',
    openTerminalAgain: 'Abrir o terminal de novo',
    finishInTerminal: 'Termine o login no terminal - esta tela fecha sozinha.',
  },

  stream: {
    waitingForYou: 'Esperando você',
    waitingForSubagent: 'Esperando um subagente',
    waitingForSubagents: (n) => `Esperando ${n} subagentes`,
    thinking: 'O Claude está pensando',
    retryWaiting: (label, waited) => `${label} · esperando ${waited}`,
    withElapsed: (label, elapsed) => `${label} · ${elapsed}`,
  },

  agentTask: {
    failedBeforeFinishing: 'Falhou antes de terminar.',
    stoppedBeforeFinishing: 'Parou antes de terminar.',
    backgroundEnded: (outcome, duration) =>
      duration ? `O comando em segundo plano ${outcome} depois de ${duration}.` : `O comando em segundo plano ${outcome}.`,
    outcomeFailed: 'falhou',
    outcomeStopped: 'foi parado',
    outcomeFinished: 'terminou',
    trimmed: (n) => `…${n} passos anteriores foram cortados`,
  },

  feed: {
    empty: { title: 'Pergunte ao Claude sobre este projeto', hint: '@ para arquivos · / para comandos' },
    you: 'VOCÊ',
    jumpToLatest: 'Ir para a mais recente',
    copyBlock: 'Copiar este bloco',
    copyReply: 'Copiar a resposta inteira',
    copyMessage: 'Copiar esta mensagem, com os caminhos do que foi anexado',
    reuse: {
      label: 'Editar e enviar de novo',
      hint: 'Devolver esta mensagem ao campo de entrada, para editar e enviar de novo',
      lostImages: (n: number): string =>
        n === 1
          ? 'Volta ao campo de entrada, mas a imagem colada não - anexe-a de novo'
          : `Volta ao campo de entrada, mas as ${n} imagens coladas não - anexe-as de novo`,
    },
    pastedLines: (n) => `${n} ${n === 1 ? 'linha colada' : 'linhas coladas'}`,
    pasteClose: 'Recolher de novo',
    copyPaste: 'Copiar o texto colado',
    pasteShown: (shown, total) => `Primeiras ${shown} linhas de ${total} · copiar leva tudo`,
    fromOutput: 'da saída',

    think: { chip: 'PENSA', thoughts: (n) => `${n} ${n === 1 ? 'ideia' : 'ideias'}` },

    workflow: {
      agents: (n) => `${n} ${n === 1 ? 'agente' : 'agentes'}`,
      running: (n) => `${n} em andamento`,
      done: (n) => `${n} ${n === 1 ? 'pronto' : 'prontos'}`,
      failed: (n) => `${n} ${n === 1 ? 'falhou' : 'falharam'}`,
      queued: 'na fila',
      skipped: 'pulado',
      attempt: (n) => `tentativa ${n}`,
      cached: 'do registro',
    },

    tool: {
      running: '· rodando',
      waitingForYou: '· esperando você',
      failed: '· falhou',
      lines: (n) => `· ${n} ${n === 1 ? 'linha' : 'linhas'}`,
      matches: (n) => (n > 0 ? `· ${n} ${n === 1 ? 'ocorrência' : 'ocorrências'}` : '· nenhuma ocorrência'),
      output: (empty) => (empty ? '· sem saída' : '· com saída'),
      diff: (added, removed) => `· +${added} −${removed}`,
      moreLines: (n) => `… mais ${n} linhas`,
      fewerLines: '… recolher',
      count: (n) => `${n} ${n === 1 ? 'ferramenta' : 'ferramentas'}`,
      closed: {
        replay: 'A conversa salva não guarda o resultado desta chamada.',
        exited: 'O Claude Code parou de responder antes de isto terminar.',
        stopped: 'Parou antes de terminar.',
        turnEnded: 'O turno acabou antes desta chamada.',
        untracked: 'Ainda rodando em segundo plano - o painel não acompanha mais.',
      },
      closedMeta: {
        replay: '· não está na transcrição',
        exited: '· interrompido',
        stopped: '· interrompido',
        turnEnded: '· inacabado',
        untracked: '· solto',
      },
    },

    /** The counter under a subagent's own log while it runs. */
      agentWorking: (duration) => `Trabalhando · ${duration}`,
    task: {
      /** The heading over a subagent's errand inside its card in the feed (see TaskCard). */
      errand: 'O QUE FOI PEDIDO',
      closed: {
        replay: 'Como isto terminou não está na conversa salva.',
        exited: 'A sessão acabou antes de isto retornar.',
        stopped: 'Parou antes de retornar.',
        turnEnded: 'O turno acabou antes de isto retornar.',
        untracked: 'Ainda rodando - o painel não acompanha mais.',
      },
    },

    bash: { running: 'rodando', noOutput: 'sem saída' },

    checkpoint: {
      cleared: 'conversa limpa - nada acima disto é lembrado',
      earlier: 'mensagens anteriores',
      notKept: 'as mensagens anteriores não são mais guardadas',
      notOnPhone: 'as mensagens anteriores não são enviadas para o celular',
      loadEarlier: 'carregar mensagens anteriores',
    },

    compact: {
      label: 'CONTEXTO',
      running: 'Compactando a conversa…',
      done: (manual) => `contexto compactado ${manual ? 'na mão' : 'automaticamente'}`,
      doneWith: (manual, before, after, took) =>
        `${manual ? 'na mão' : 'automaticamente'}: ${before} de contexto compactados em ${after ? `um resumo de ${after}` : 'um resumo'}${took ? ` em ${took}` : ''}`,
    },

    retry: {
      label: 'NOVA TENTATIVA',
      reason: {
        rateLimited: 'Pedidos demais',
        overloaded: 'API sobrecarregada',
        auth: 'Falha de autenticação',
        error: 'Erro da API',
      },
      attempt: (n) => `tentativa ${n}`,
      attemptOf: (n, max) => `tentativa ${n}/${max}`,
      retryingIn: (seconds) => `nova tentativa em ${seconds} s`,
      retrying: 'tentando de novo…',
      recovered: (attempts) => `deu certo depois de ${attempts} ${attempts === 1 ? 'tentativa' : 'tentativas'}`,
      failed: (attempts) => `desistiu depois de ${attempts} ${attempts === 1 ? 'tentativa' : 'tentativas'}`,
      stopped: (attempts) => `parou depois de ${attempts} ${attempts === 1 ? 'tentativa' : 'tentativas'}`,
    },

    result: {
      worked: (duration) => (duration ? `Trabalhou ${duration}` : 'Trabalhou'),
      stopped: (duration) => (duration ? `Você parou · ${duration}` : 'Você parou'),
      movedAccount: (duration) => (duration ? `Interrompido para trocar de conta · ${duration}` : 'Interrompido para trocar de conta'),
    },

    modelSwitch: { label: 'MODELO', note: 'quem trocou foi o Claude Code, não você' },

    crash: {
      label: 'SESSÃO',
      text: 'O Claude Code encerrou de forma inesperada.',
      textWithCode: (code) => `O Claude Code encerrou de forma inesperada (código ${code}).`,
    },

    limit: {
      label: 'LIMITE',
      extraLabel: 'USO EXTRA',
      extra: (window) =>
        `${window ? `O limite ${window}` : 'O limite de uso'} acabou - o trabalho continua como uso extra, cobrado por fora do plano`,
      waiting: (window) => `${window ? `O limite ${window}` : 'O limite de uso'} acabou - esperando ele zerar`,
      resetAt: (clock, left) => `${clock} · em ${left}`,
    },

    plan: {
      label: 'PLANO PRONTO',
      steps: (n) => `· ${n} ${n === 1 ? 'passo' : 'passos'}`,
      approve: 'Aprovar e executar',
      keepPlanning: 'Continuar planejando',
      withdrawn: 'O agente parou de esperar uma decisão',
    },

    ask: {
      label: 'CLAUDE PERGUNTA',
      blocks: (n) => `${n} ${n === 1 ? 'pergunta' : 'perguntas'} · segura a execução`,
      pickAny: 'pode marcar várias',
      other: 'Outra',
      ownAnswer: 'escreva a sua própria resposta…',
      send: 'Enviar respostas',
      pickToContinue: 'Escolha para continuar',
      note: 'a execução segue exatamente de onde perguntou',
      expand: 'Abrir a pergunta',
      collapse: 'Fechar a pergunta',
      dismiss: 'Dispensar a pergunta',
      dismissHint: 'Dispensar e responder com suas palavras',
    },

    findings: {
      label: 'REVISÃO',
      fixed: 'corrigido',
      skipped: 'pulado',
      noChange: 'não precisa mudar nada',
      unconfirmed: 'não confirmado',
    },

    copy: { copied: 'Copiado', click: 'Clique para copiar', openFile: 'Abrir no editor', openFolder: 'Mostrar a pasta' },
  },

  chrome: {
    tasks: {
      label: 'TAREFAS',
      listLabel: 'LISTA DE TAREFAS',
      progress: (done, total) => `${done} / ${total} feitas`,
      collapse: 'Fechar a lista de tarefas',
      expand: 'Ver o resto da lista',
    },
    queue: {
      label: 'NA FILA',
      hint: (n) => `${n} vão sair em ordem quando a rodada terminar · arraste para reordenar`,
    },
    selection: { quote: 'Citar', fork: 'Ramificar daqui' },
    streams: {
      main: 'principal',
      background: 'fundo',
      stopAgent: 'Parar este agente',
      stopAgentNamed: (name) => `Parar: ${name}`,
      stopAgentTitle: 'Parar este agente?',
      stopCommand: 'Parar este comando',
      stopCommandTitle: 'Parar este comando?',
    },
    confirm: { cancel: 'Cancelar', stop: 'Parar' },
    noChats: { title: 'Animado para trabalhar com você!', button: 'Vamos começar' },
    crash: {
      title: 'O painel esbarrou num erro',
      text: 'Recarregar é seguro: suas conversas vivem nos processos do Claude Code atrás do painel e sobrevivem a ele.',
      button: 'Recarregar o painel',
    },
  },

  accounts: {
    empty: { title: 'O do trabalho e o pessoal, lado a lado', body: 'Troque entre contas do Claude sem sair. Skills, hooks, configurações e histórico continuam compartilhados.' },
    intro:
      'Tudo funciona na conta escolhida aqui: todas as conversas abertas passam para ela, e a que estiver no meio de um turno é interrompida para poder passar.',
    unnamed: 'Fazendo login…',
    defaultName: 'Login do Claude Code',
    current: 'em uso',
    signingIn: 'fazendo login',
    use: 'Selecionar',
    switching: 'Trocando…',
    rename: 'Renomear',
    save: 'Salvar',
    logout: 'Sair',
    logoutConfirm: 'Sair do Claude Code?',
    forget: 'Esquecer',
    add: 'Adicionar uma conta',
    adding: 'Esperando o login…',
    cancel: 'Cancelar',
    addHint: 'Um terminal abre para o login. Sua conta atual não é tocada.',
    mcpNote: 'Os servidores MCP entram por conta, então uma conta nova autentica todos uma vez. Skills, hooks, configurações e histórico são compartilhados.',
    designAuthorize: 'Autorizar o Claude Design',
    designNote: 'O Claude Design também entra por conta, e só um terminal consegue fazer isso. Ele abre para a conta em uso; depois o DesignSync funciona sozinho no painel.',
    aliasPlaceholder: 'Trabalho, casa, um cliente…',
    absent: 'Nenhuma credencial guardada. Entre de novo para usar esta conta.',
    fiveHour: '5h',
    weekly: 'semana',
    row: {
      one: 'Uma conta',
      adding: 'Fazendo login…',
    },
    unavailable: {
      ignored: 'Este Claude Code não consegue separar dois logins. Atualize-o e abra esta tela de novo.',
      wsl: 'Indisponível para um projeto dentro do WSL: o Claude Code roda lá, não nesta máquina.',
      not_signed_in: 'Entre no Claude Code primeiro, depois adicione uma segunda conta aqui.',
      api_key: 'Esta máquina entra com uma chave de API, que vale para todas as conversas. Não dá para trocar de conta enquanto ela estiver definida.',
    },
    outcome: {
      'did-not-land': 'Esse login não terminou, então nada foi adicionado.',
      'no-terminal': 'O terminal não abriu, então o login nem começou.',
      'no-executable': 'O Claude Code não foi encontrado nesta máquina.',
      'no-store': 'Não deu para criar uma pasta para a nova conta.',
      'design-no-account': 'Não deu para saber qual é a conta em uso, então nada foi aberto.',
      'not-supported': 'Este Claude Code não consegue separar dois logins, então nada foi adicionado.',
      'logout-failed': 'Não foi possível sair. Tente em um terminal.',
      'already-running': 'Já tem um login em andamento.',
      unknown: 'Isso não funcionou.',
    } as Record<string, string>,
  },

  remote: {
    codeLabel: 'Código de pareamento',
    states: {
      idle: { label: 'Desligado', hint: 'Não dá para chegar nesta IDE de fora.' },
      connecting: { label: 'Conectando…', hint: 'Primeiro contato com o relay.' },
      connected: { label: 'Conectado', hint: 'Um dispositivo pareado consegue ver este projeto.' },
      reconnecting: {
        label: 'Reconectando…',
        hint: 'A linha caiu. É comum - ela volta sozinha.',
      },
      unreachable: {
        label: 'Relay inalcançável',
        hint: 'O relay não responde. Seu trabalho não é afetado; só o celular.',
      },
      refused: {
        label: 'Recusado',
        hint: 'O relay não aceitou este plugin: pode estar velho demais, ou outra IDE ocupou este endereço.',
      },
    },
    agent: (id) => `agente ${id}`,
    thisIde: 'ESTA IDE',
    relay: 'RELAY',
    device: 'DISPOSITIVO',
    allow: 'Permitir alcançar esta IDE remotamente',
    allowHint: 'Desligado até você ligar, e desligado de novo assim que você desligar.',
    relayAddress: 'ENDEREÇO DO RELAY',
    noSafe:
      'Esta IDE está configurada para não lembrar senhas, então um pareamento não sobrevive a um reinício. Ligue o cofre de senhas da IDE se quiser que ele fique.',
    wantsToPair: (device) => `${device} quer parear`,
    checkFingerprint: 'É assim que o dispositivo se chama - confira se a impressão digital abaixo bate com a da tela dele.',
    allowDevice: 'Permitir',
    refuse: 'Recusar',
    scanThis: 'Escaneie isto com o celular',
    codeNote: (left) =>
      `${left} · serve uma vez. O segredo está na parte do endereço depois do cerquilha, que os navegadores nunca mandam para o servidor.`,
    minutesLeft: (minutes) => `faltam ${minutes} min`,
    secondsLeft: (seconds) => `faltam ${seconds} s`,
    stopOffering: 'Parar de oferecer',
    pairDevice: 'Parear um dispositivo',
    pairedDevices: 'DISPOSITIVOS PAREADOS',
    revoke: 'Revogar',
    whatTravels: 'O que sai daqui e o que um celular pode fazer',
    whatTravelsSub: 'Leia antes de ligar',
    fingerprint: 'A impressão digital desta IDE',
    about: {
      first:
        'Com isto ligado, suas conversas passam por um relay para que um celular pareado consiga lê-las e responder. Isso inclui o que o agente lê e escreve: código-fonte, caminhos de arquivo, a saída dos comandos.',
      second:
        'O relay não consegue ler nada disso - o conteúdo vai lacrado entre esta IDE e seu celular. Ele vê quando você está conectado e quanto passa por ele, que é mais ou menos o seu horário de trabalho. Você pode subir um relay próprio.',
      can: 'Um celular pareado pode responder permissões, mandar mensagens e parar um turno.',
      cannot:
        'Ele não pode rodar comandos de shell, instalar plugins, mudar o modo de permissão, nem tocar na área de transferência desta máquina.',
      third:
        'Um pareamento é provado por um código mostrado uma única vez nesta tela. Comparar as duas impressões digitais pega a única coisa que o código não pega: alguém que fotografou a tela e escaneou primeiro.',
    },
  },

  feedback: {
    button: 'Relatar um bug ou mandar uma ideia',
    kinds: {
      bug: { label: 'Bug', placeholder: 'O que aconteceu, e o que você esperava no lugar?' },
      idea: { label: 'Ideia', placeholder: 'O que você gostaria que o painel fizesse?' },
      hello: { label: 'Oi', placeholder: 'Qualquer coisa - isto chega a uma pessoa, não a uma fila.' },
    },
    email: 'E-MAIL',
    emailOptional: 'opcional',
    attachments: 'ANEXOS',
    addFiles: 'Adicionar arquivos',
    removeFile: (name) => `Remover: ${name}`,
    attachTotal: (count, max, size, budget) => `${count} de ${max} · ${size} de ${budget}`,
    logs: 'Anexar logs de depuração',
    logsFromTab: (tab) => `Da aba ${tab} - `,
    logsFromOpenTab: 'Da aba que você tem aberta agora: ',
    logsWhat:
      'versões, tempos e o que deu errado. Nada da sua conversa, dos seus nomes de arquivo ou dos seus caminhos - e você pode ler tudo antes de enviar.',
    logsOnlyBug: 'Só com um bug: o relatório conta algo que deu errado, e aqui não há o que contar.',
    seeWhat: 'Ver exatamente o que vai anexado',
    send: 'Enviar',
    sending: 'Enviando…',
    sentPartly: (note) => `Enviado, mas não tudo. ${note}`,
    sent: 'Enviado. Obrigado ❤️ - isto chega direto a mim.',
    notSent: 'Não deu para enviar. Nada se perdeu - tente de novo.',
    reportNote: (tab) =>
      `Este é o anexo inteiro, palavra por palavra${tab ? `, para a aba ${tab}` : ''}. Ele é montado aqui, na sua IDE, com o que o próprio plugin viu: versões, o formato daquela conversa e tudo o que falhou. Nomes de arquivo aparecem como hashes curtos, então o mesmo arquivo se lê como o mesmo sem dizer qual é.`,
    building: 'Montando…',
    copy: 'Copiar',
    problems: {
      empty: 'Escreva algumas palavras primeiro.',
      tooLong: (max) => `Isso passa de ${max} caracteres.`,
      tooMany: (max) => `No máximo ${max} arquivos.`,
      tooHeavy: (budget) => `Os arquivos somam mais de ${budget}.`,
    },
  },

  mcp: {
    empty: 'Nenhum servidor MCP configurado.',
    addServer: 'ADICIONAR SERVIDOR',
    namePlaceholder: 'nome',
    commandPlaceholder: 'comando, ou URL para sse/http',
    refreshAll: 'Atualizar todos',
    refreshing: 'Atualizando…',
    add: 'Adicionar',
    adding: 'Adicionando…',
    authenticate: 'Entrar',
    opening: 'Abrindo…',
    reconnect: 'Reconectar',
    retry: 'Tentar de novo',
    reconnecting: 'Reconectando…',
    remove: 'Remover',
    removing: 'Removendo…',
    status: { connected: 'conectado', needsAuth: 'precisa entrar', failed: 'falhou', pending: 'conectando…', disabled: 'desativado' },
  },

  plugins: {
    tabInstalled: 'Instalados',
    tabBrowse: 'Explorar',
    tabMarkets: 'Mercados',
    emptyInstalled: 'Nenhum plugin instalado.',
    searchPlaceholder: 'Buscar plugins por nome ou descrição…',
    noMarketplaces: 'Nenhum marketplace conectado.',
    noMatches: 'Nada encontrado.',
    emptyMarketplaces: 'Nenhum marketplace configurado.',
    addMarketplace: 'ADICIONAR MARKETPLACE',
    marketplacePlaceholder: 'URL, caminho, ou owner/repo no GitHub',
    refresh: 'Atualizar',
    refreshing: 'Atualizando…',
    install: 'Instalar',
    installing: 'Instalando…',
    uninstall: 'Desinstalar',
    uninstalling: 'Desinstalando…',
    enable: 'Ativar',
    enabling: 'Ativando…',
    disable: 'Desativar',
    disabling: 'Desativando…',
    add: 'Adicionar',
    adding: 'Adicionando…',
    remove: 'Remover',
    removing: 'Removendo…',
  },

  mobile: {
    pair: 'Parear',
    removeFromQueue: 'Tirar da fila',
    newSessionTitle: 'nova conversa',

    sessions: {
      nothingYet: 'Ainda não há nada para mostrar. Abra um projeto na IDE, ou pareie outra.',
      nonePaired: 'Este celular ainda não está pareado com nenhuma IDE. Toque em Parear para adicionar uma.',
      recentlyOpened: 'Abertos recentemente',
      projectClosed: 'Não está aberto na IDE agora.',
      noConversations: 'Ainda não há conversas.',
      hidden: (n) => `${n} ocultas · mostrar`,
      pastConversations: 'Conversas anteriores',
      newChat: 'Nova conversa',
      reach: {
        connecting: 'Conectando…',
        asleep: 'Conectado ao relay, mas nenhuma IDE responde.',
        elsewhere: 'Também está aberto em outra aba ou no app instalado - aquela cópia segura a conexão.',
        reconnecting: 'Reconectando… a lista abaixo pode estar desatualizada.',
        offline: 'Não dá para alcançar o relay. Nada se perde - isso volta sozinho.',
      },
      agent: {
        connecting: 'conectando…',
        asleep: 'não responde',
        elsewhere: 'aberto em outro lugar',
        reconnecting: 'reconectando…',
        offline: 'offline',
      },
    },

    history: { title: 'Histórico', empty: 'Ainda não há conversas anteriores neste projeto.' },

    decision: {
      planWaiting: 'Um plano está esperando',
      questionOf: (n, total) => `Pergunta ${n} de ${total}`,
      nothingWaiting: 'Não há mais nada esperando por você aqui.',
      openConversation: 'Abrir a conversa',
      allowOnce: 'Permitir uma vez',
      deny: 'Negar',
    },

    thread: {
      loading: 'Carregando a conversa…',
      waitingPerm: 'Precisa de permissão - responda',
      waitingAsk: 'Tem uma pergunta esperando - responda',
      waitingPlan: 'Tem um plano esperando - decida',
    },

    newSession: {
      title: 'Nova conversa',
      asConfigured: 'Como está configurado',
      asConfiguredSub: 'Do jeito que o Claude Code está naquela máquina.',
      model: 'Modelo',
      effort: 'Esforço',
      mode: 'Modo',
      closedProject: 'Este projeto está fechado - a IDE vai abrir antes de começar.',
      start: 'Começar',
      opening: 'Abrindo o projeto…',
    },

    pairing: {
      title: 'Parear com uma IDE',
      fromCode: 'Pareando com a IDE que mostrou este código. Agora ela está pedindo permissão a quem está na máquina.',
      how: 'Na IDE, abra o menu do painel → Acesso remoto → Parear um dispositivo. Escaneie o código com a câmera, ou digite abaixo.',
      fingerprintAsk: 'A IDE está mostrando uma impressão digital. Só permita se ela disser:',
      fingerprintNote: 'A IDE vai pedir para você confirmar e mostrar uma impressão digital. Este app vai mostrar a mesma - só permita se baterem.',
      waiting: 'Esperando a IDE…',
      done: 'Pareado.',
      failed: 'O pareamento não deu certo.',
      notACode: 'Isso não parece um código de pareamento.',
      iphone: 'Um iPhone',
      ipad: 'Um iPad',
      android: 'Um celular Android',
      browser: 'Um navegador',
    },

    composer: {
      commands: 'Comandos',
      closeList: 'Fechar a lista',
      usageLimits: 'Limites de uso',
      removeImage: (name) => `Remover: ${name}`,
      say: 'Diga alguma coisa…',
      reconnecting: 'Reconectando…',
      slash: 'Comandos com barra',
      attachPhoto: 'Anexar uma foto',
      voice: 'Ditar',
      voiceStop: 'Terminar o ditado',
      stop: 'Parar a execução',
      whatTravels: 'O que viaja entre sua IDE e este celular',
      projectFiles: 'Arquivos do projeto',
      ofTotal: (shown, total) => `${shown} de ${total}`,
      photosDropped: (n) => `Mais ${n} não cabem em uma mensagem - mande estas primeiro.`,
      photoTooBig: 'Isso não cabe em uma mensagem. Tente uma foto por vez.',
    },

    limits: {
      title: 'Limites e contexto',
      fiveHourWindow: 'Janela de cinco horas',
      weeklyWindow: 'Janela semanal',
      paceNote: (percent) =>
        `O arco apagado é o ritmo constante: até hoje já “cabe” ${percent}% da semana. Enquanto o arco aceso for mais curto, a semana está no plano.`,
      context: 'O contexto desta conversa',
      ofTotal: (used, total) => `${used} de ${total}`,
      spentToday: 'Gasto hoje',
      acrossProjects: 'em todos os projetos',
      noWindows: 'A IDE ainda não informou as janelas da assinatura.',
      extraUsage: 'Uso extra',
      extraUsed: (window) => `${window ? `o limite ${window}` : 'o limite'} acabou, cobrado por fora do plano`,
      resetUnknown: 'ainda não se sabe quando zera',
      resetsIn: (left) => `zera em ${left}`,
    },
  },

  status: {
    todayTokens: 'Tokens gastos hoje, em todos os projetos',
    openPr: 'Abrir o pull request no navegador',
    noPr: 'sem PR',
    effortHint: (effort) => `Esforço de raciocínio: ${effort}`,
    modelHint: (model) => `Modelo: ${model}`,
    modelHintSwitched: (model, from) => `Modelo: ${model} - o Claude Code mudou para ele sozinho, saindo de ${from}`,
    modeHint: (mode) => `Modo de permissão: ${mode}`,
    sessionLimit: 'Limite de 5 horas',
    weekLimit: 'Limite semanal',
    windowUsed: (title, percent) => `${title}: ${percent}% usado`,
    resetsIn: (left) => `Zera em ${left}`,
    paceBudget: (percent) => `Anel apagado: ${percent}% do gasto em ritmo constante para hoje`,
    extraUsage: (limit) => `Uso extra: ${limit} acabou, o trabalho é cobrado por fora do plano`,
    extraSpent: (percent) => `${percent}% do uso extra do mês já gasto`,
    limitNamed: (window) => `o limite ${window}`,
    limitUnnamed: 'o limite',
  },

  limits: {
    fiveHour: 'de 5 horas',
    weekly: 'semanal',
    weeklyOpus: 'semanal do Opus',
    weeklySonnet: 'semanal do Sonnet',
    weeklyApps: 'semanal de apps',
    weeklyWithExtra: 'semanal, com uso extra incluído',
    extra: 'de uso extra',
  },

  permission: {
    label: 'PERMISSÃO',
    decisions: { once: 'Permitir uma vez', always: 'Sempre permitir', deny: 'Negar' },
    underMode: (mode) => `Modo: ${mode}`,
  },

  selectors: {
    model: 'MODELO',
    effort: 'ESFORÇO',
    mode: 'MODO',
    modeHint: 'shift+tab',
  },

  commands: {
    resume: 'abrir uma conversa anterior deste projeto',
    fork: 'continuar esta conversa numa aba nova',
    login: 'entrar no Claude Code pelo terminal da IDE',
    logout: 'sair - abre o terminal da IDE',
    designLogin: 'autorizar o Claude Design no terminal da IDE',
    model: 'trocar o modelo desta sessão',
    effort: 'definir quanto o Claude pensa antes de agir',
    context: 'o que ocupa a janela de contexto agora',
    cost: 'gasto e janelas de uso desta sessão',
    usage: 'janelas da assinatura e quando elas zeram',
    codeReview: 'revisar um pull request',
  },
}
