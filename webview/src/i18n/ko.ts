import type { Dict } from './en'

/**
 * 한국어. 영어 사전(en.ts)의 번역이며, 따로 쓴 문구가 아닙니다.
 *
 * 제목과 행 이름은 명사형으로, 설명은 해요체로 통일했습니다. 제품 이름(Claude Code, MCP, Opus,
 * Sonnet, Haiku, Git, PR)과 CLI 도구 이름은 번역하지 않습니다. 원문의 대시는 앞뒤에 공백을 둔
 * 하이픈이며, 여기서도 그대로 씁니다.
 */
export const ko: Dict = {
  common: {
    back: '뒤로',
    close: '닫기',
    closeMenu: '메뉴 닫기',
    loading: '불러오는 중…',
    muted: '음소거',
    countOn: (n) => `${n}개 켜짐`,
  },

  menu: {
    titles: {
      menu: { title: '메뉴', hint: '패널이 평소 접어 두는 것들' },
      history: { title: '기록', hint: '이 프로젝트의 지난 대화' },
      mcp: { title: 'MCP 서버', hint: '상태 · 로그인 · 다시 연결' },
      plugins: { title: '플러그인', hint: '설치됨 · 둘러보기 · 마켓플레이스' },
      settings: { title: '설정', hint: '패널의 동작과 소리' },
      sounds: { title: '알림음', hint: '패널이 부를 때' },
      remote: { title: '원격 접속', hint: '상태 · 릴레이 · 연결된 기기' },
      remoteAbout: { title: '밖으로 나가는 것', hint: '켜기 전에 읽어 주세요' },
      defaultMode: { title: '기본 모드', hint: '새 탭이 시작하는 모드' },
      composerLayout: { title: '입력창 배치', hint: '입력창을 두는 자리' },
      pasteCollapse: { title: '붙여넣은 텍스트', hint: '붙여넣기를 칩으로 접는 기준' },
      improvePrompt: { title: '프롬프트 다듬기', hint: '별 버튼이 요청하는 내용' },
      voice: { title: '음성 입력', hint: '타이핑 대신 말하기' },
      voiceLanguage: { title: '말하는 언어', hint: '받아쓰기가 알아들을 언어' },
      voiceDevice: { title: '마이크', hint: '어느 것으로 들을지' },
      language: { title: '언어', hint: '패널이 쓰는 언어' },
      feedback: { title: '피드백', hint: '버그, 아이디어, 그냥 인사도 좋아요' },
      feedbackLog: { title: '함께 보내는 내용', hint: '보내기 전 전체 보고서' },
    },

    groups: {
      project: '이 프로젝트',
      devices: '기기',
      plugin: '플러그인 자체',
      author: '만든 사람',
    },

    rows: {
      history: { label: '기록', sub: '이 프로젝트의 지난 대화' },
      statistics: { label: '통계', sub: '시간, 습관, 업적' },
      mcp: { label: 'MCP 서버', sub: '상태, 로그인, 다시 연결' },
      plugins: { label: '플러그인', sub: '설치됨, 둘러보기, 마켓플레이스' },
      remote: { label: '원격 접속', sub: '상태, 릴레이, 연결된 기기' },
      settings: { label: '설정', sub: '알림음, 모드, 배치, 언어' },
      feedback: { label: '피드백 보내기', sub: '버그, 아이디어, 그냥 인사도 좋아요' },
    },

    author: {
      title: '곧 면접이 있나요?',
      body: '그래서 AI 어시스턴트를 만들었어요. 무료로 써보세요 - 응원도 됩니다. 감사합니다',
      tagline: '실시간 면접 코파일럿',
    },

    footer: 'Amazing Claude Code GUI',
  },

  settings: {
    rows: {
      sounds: { label: '알림음', sub: '패널이 부를 때' },
      defaultMode: { label: '기본 모드', sub: '새 탭이 시작하는 모드' },
      composerLayout: { label: '입력창 배치', sub: '입력창을 두는 자리' },
      pasteCollapse: { label: '붙여넣은 텍스트', sub: '붙여넣기를 칩으로 접는 기준' },
      improvePrompt: { label: '프롬프트 다듬기', sub: '별 버튼이 요청하는 내용' },
      voice: { label: '음성 입력', sub: '내 Deepgram 키로 받아쓰기' },
      language: { label: '언어', sub: '패널이 쓰는 언어' },
    },

    improveSummary: { builtIn: '기본', custom: '직접 작성' },
  },

  language: {
    note: '패널만 바뀝니다. Claude가 어떤 언어로 답하는지는 Claude Code 자체의 설정이고 터미널과 공유하는 값이라, 여기서는 건드리지 않습니다.',
    followIde: '자동',
    followIdeSub: (language) => `IDE를 따라감 - 지금은 ${language}`,
    followIdeUnknown: 'IDE를 따라감',
  },

  sounds: {
    turnFinished: { label: '턴 종료', hint: 'Claude가 답을 마치고 기다리고 있어요' },
    permission: { label: '권한 요청', hint: '도구 실행에 승인이 필요해요' },
    question: { label: '질문', hint: 'Claude가 답을 골라 달라고 해요' },
    plan: { label: '계획 준비됨', hint: '계획이 승인을 기다리고 있어요' },
    rateLimit: { label: '한도 도달', hint: '구독 한도 때문에 턴이 멈췄어요' },
    extraUsage: {
      label: '추가 사용 시작',
      hint: '요금제를 다 썼어요 - 이후 작업은 따로 청구돼요',
    },
    trouble: { label: '무언가 고장남', hint: '오류, 프로세스 종료, 또는 로그아웃된 세션' },
    play: '들어보기',
    playNamed: (sound) => `들어보기: ${sound}`,
    volumeOf: (sound) => `볼륨: ${sound}`,
  },

  history: {
    empty: '이 프로젝트에는 아직 지난 대화가 없어요.',
    today: '오늘',
    earlier: '이전',
    messages: (n) => `메시지 ${n}개`,
  },

  composerLayout: {
    bottom: '기본',
    compact: '좁게',
    left: '왼쪽',
    right: '오른쪽',
  },

  pasteCollapse: {
    note: '여러 줄을 붙여넣으면 긴 텍스트가 입력창을 가득 채우지 않도록 칩으로 접힙니다. 어느 쪽이든 내용은 그대로입니다 - 접힌 칩은 전체 텍스트를 담고 있고, 칩에 있는 연필 버튼으로 다시 입력창에 펼칠 수 있습니다.',
    never: '접지 않기',
    neverSub: '붙여넣은 것은 모두 일반 텍스트로 입력창에 남습니다',
    from: (lines) => `${lines}줄부터`,
    foldLabel: '긴 붙여넣기 접기',
    foldSub: (min, max) => `몇 줄부터 접을지 - ${min}~${max}`,
  },

  improvePrompt: {
    note: '클립 옆의 별 버튼은 입력창의 글을 다시 씁니다. 여기 적힌 것이 그 요청입니다. 초안과 함께 별도의 Claude Code 실행으로 나가고 - 도구도, 파일도, 대화도 없이 - 다른 메시지와 똑같이 사용량에 포함됩니다.',
    label: '요청 내용',
    emptyMeans: '비워 두면 위에 회색으로 보이는 기본 요청이 그대로 쓰입니다.',
    builtInLanguage:
      '영어인 이유는 인터페이스가 아니라 모델에게 주는 지시이기 때문입니다. 그 안에서 초안과 같은 언어로 답하라고 이미 요청합니다. 직접 쓸 때는 어떤 언어든 괜찮습니다.',
    editBuiltIn: '기본 문구 편집',
    backToBuiltIn: '기본 문구로 되돌리기',
  },

  voice: {
    note: '키를 누른 채 말하면 말한 순서대로 입력창에 글이 들어옵니다. 본인 Deepgram 키로 동작하며, 음성은 Deepgram으로만 갑니다. 플러그인은 중간에 서버를 두지 않습니다.',
    off: '꺼짐',
    enable: '음성 입력',
    enableHint: '마이크 버튼을 보여 주고 아래 단축키를 기다립니다.',

    key: 'DEEPGRAM API 키',
    keyPlaceholder: '키를 붙여 넣으세요',
    keySet: (tail: string): string => `키를 저장했습니다. 끝자리는 ${tail}`,
    keySave: '저장',
    keyForget: '이 키 지우기',

    balanceLeft: (amount: string): string => `계정에 ${amount} 남음`,
    balanceChecking: 'Deepgram에 확인 중…',
    balanceNoKey: '아직 키가 없습니다.',
    balanceNoAccess: '키는 잘 동작합니다. 잔액을 보려면 Owner나 Admin 역할의 키가 필요합니다.',
    balanceRejected: 'Deepgram이 이 키를 알아보지 못합니다.',
    balanceFailed: 'Deepgram에 닿지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.',
    balanceRefresh: '새로고침',

    getKey: '아직 키가 없나요?',
    getKeyHint: 'deepgram.com에서 가입하고 API 키를 만드세요. 새 계정에는 카드 없이 200달러가 주어지며, 지금 요금이면 수백 시간 분량의 받아쓰기입니다.',
    openSite: 'deepgram.com 열기',

    hotkeys: '단축키',
    hotkeysHint: '키보드가 IDE에 있는 동안에만 동작합니다 - 편집기, 패널, 대화 상자 모두 포함. 다른 앱에서는 동작하지 않습니다.',
    push: '누른 채 말하기',
    pushHint: '누르고 있는 동안 녹음하고, 떼면 멈춥니다.',
    hold: '손 놓고 말하기',
    holdHint: '한 번 누르면 시작하고, 다시 누르면 끝납니다.',
    keyboard: '키',
    mouse: '마우스',
    record: '지정',
    recording: '키를 누르세요…',
    recordingMouse: '버튼을 누르세요…',
    notSet: '지정 안 됨',
    clear: '지우기',
    sideLeft: '왼쪽',
    sideRight: '오른쪽',
    badButton: '마우스는 옆면 버튼만 쓸 수 있습니다. 주요 세 버튼은 IDE 곳곳에서 이미 제 몫이 있습니다.',
    modifierTip: '여기서는 수정 키 하나가 가장 알맞습니다. 오른쪽 Option이나 오른쪽 Ctrl을 누르고 있으면 IDE 안에서 겹칠 일이 없습니다.',

    language: '말하는 언어',
    languageHint: '받아쓰기가 알아들을 언어',
    searchLanguages: '언어 검색…',
    multiHint: '다국어 모드는 문장 도중의 언어 전환을 따라갑니다. 다만 언어를 지정했을 때와 견주면 두 경우 모두 결과가 나빴습니다. 한 문장에 두 언어를 정말 섞어 쓸 때만 고르세요.',

    device: '마이크',
    deviceHint: '어느 것으로 들을지',
    deviceDefault: '시스템 기본',
    deviceDefaultHint: '시스템 설정을 그대로 따릅니다',
    deviceNote: '바꾼 내용은 다음 받아쓰기부터 적용됩니다.',

    errorNoKey: '먼저 Deepgram 키를 넣어 주세요 - 설정, 그다음 음성 입력.',
    errorNoKeyRemote: '이 대화가 도는 컴퓨터에 Deepgram 키가 없습니다. 그쪽 설정의 음성 입력에서 넣어 주세요.',
    errorOff: '이 대화가 도는 컴퓨터에서 음성 입력이 꺼져 있습니다. 그쪽 설정에서 켜 주세요.',
    errorMicrophone: '마이크를 열지 못했습니다. 다른 앱이 쓰고 있을 수 있습니다.',
    errorKey: 'Deepgram이 키를 거절했습니다. 음성 입력 화면에서 확인해 주세요.',
    errorNetwork: 'Deepgram에 닿지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.',
    errorGeneral: '받아쓰기가 멈췄습니다. 다시 시도해 주세요.',
  },

  modes: {
    manual: {
      label: '권한 물어보기',
      sub: '읽기는 자유롭게 하고, 쓰기와 명령 실행 전에는 매번 물어봅니다.',
      short: '물어봄',
    },
    acceptEdits: {
      label: '편집 자동 승인',
      sub: '작업 폴더 안의 파일 편집은 알아서 승인합니다. 셸 실행은 계속 물어봐요.',
      short: '편집',
    },
    plan: {
      label: '계획',
      sub: '먼저 살펴보고 계획을 냅니다. 승인하기 전까지 아무것도 건드리지 않아요.',
      short: '계획',
    },
    auto: {
      label: '자동',
      sub: '묻지 않음 - 위험한 작업은 분류기가 하나씩 검토합니다. 모든 모델에서 되는 건 아니에요.',
      short: '자동',
    },
    dontAsk: {
      label: '묻지 않기',
      sub: '한 번도 묻지 않고, 미리 허용되지 않은 것은 모두 거절합니다. 무인 실행용이에요.',
      short: '안 물음',
    },
    bypassPermissions: {
      label: '권한 검사 건너뛰기',
      sub: '거의 모든 검사를 건너뜁니다. 위험한 삭제는 그래도 물어봐요. 컨테이너와 일회용 VM에서만 쓰세요.',
      short: '건너뜀',
    },
    tags: {
      default: '기본',
      readOnly: '읽기 전용',
      preview: '미리보기',
      settings: '설정',
      danger: '위험',
    },
  },

  effort: {
    auto: { sub: '이 세션에서 모델의 기본 사고 강도로 되돌립니다.' },
    ultracode: { sub: 'xhigh 수준의 추론에, 필요하면 여러 에이전트를 쓰는 흐름까지 자동으로 씁니다.' },
    max: { sub: '가진 걸 다 씁니다. 설계와 까다로운 버그에 어울려요.' },
    xhigh: { sub: '같은 걸 더 깊게. 여러 파일에 걸친 변경에 어울려요.' },
    high: { sub: '움직이기 전에 오래 생각합니다. 여러 파일 변경에 어울려요.' },
    medium: { sub: '균형 잡힌 값. 기능 개발의 기본으로 적당해요.' },
    low: { sub: '거의 생각하지 않습니다. 기계적인 수정과 빠른 답에 어울려요.' },
    tags: { ultra: 'ultra', slow: '느림', default: '기본' },
  },

  models: {
    default: { label: '기본 (권장)', sub: '이 세션이 시작할 때의 모델을 씁니다.' },
    opus: { sub: 'Opus 5 · 일상 작업부터 복잡한 작업까지 최선' },
    opus1m: {
      label: 'Opus (100만 컨텍스트)',
      sub: 'Opus 5, 100만 컨텍스트 · 큰 코드베이스에서의 긴 세션에 적합',
    },
    sonnet: { sub: 'Sonnet 5 · 반복 작업에 효율적' },
    sonnet1m: {
      label: 'Sonnet (100만 컨텍스트)',
      sub: 'Sonnet 5, 100만 컨텍스트 · 큰 코드베이스에서의 긴 세션에 적합',
    },
    haiku: { sub: 'Haiku 4.5 · 짧은 답이라면 가장 빠름' },
    opusplan: { label: 'Opus 계획 모드', sub: '계획 모드는 Opus, 나머지는 Sonnet' },
    unavailable: '사용할 수 없음',
    /** The line under a model the agent moved to by itself - see modelMenu. */
    switchedItself: 'Claude Code가 스스로 이 모델로 바꿨어요.',
  },

  composer: {
    placeholder: '물어보거나, 바꾸고 싶은 걸 적어 주세요…',
    placeholderPlan: '무엇을 계획할지 적어 주세요…',
    attach: '파일이나 폴더 첨부',
    slash: '슬래시 명령',
    improve: '프롬프트 다듬기',
    improveAgain: '당신이 쓴 글에서 다시 한 번',
    restore: '내가 쓴 글로 되돌리기',
    stop: '멈추기',
    forceStop: '응답 없음 · 강제 종료',
    forceStopHint: 'Claude가 멈춤을 확인해 주지 않아요',
    queue: '대기열에',
    queueHint: '지금 턴이 끝나면 보냅니다',
    send: '보내기',
    run: '실행',
    runHint: '당신의 셸에서 실행돼요 - Claude는 다음 메시지에서 출력을 봅니다',
    improveEmpty: 'Claude Code가 아무것도 돌려주지 않아서 입력창에 넣을 게 없어요.',
    improveChanged: '다시 쓰는 동안 초안이 바뀌어서 그대로 뒀어요.',
    improveTerminal: '터미널 명령은 다시 쓰지 않아요',
    voice: '음성 입력',
    voiceStop: '받아쓰기 끝내기',
  },

  header: {
    idle: '대기',
    running: 'Claude가 작업 중',
    done: '턴 종료',
    attention: '기다리는 중',
    crashed: '세션이 갑자기 끊겼어요',
    statistics: '통계',
    closeStatistics: '통계 닫기',
    conversations: '대화',
    newSession: '새 대화',
    menu: '메뉴',
    watchers: (n) => `다른 ${n}곳에서 이 프로젝트를 보고 있어요`,
  },

  thanks: {
    button: '플러그인이 마음에 드나요? 고맙다고 전하기',
    title: '고맙다고 전하기',
    star: 'GitHub에 별 주기',
    starSub: '다른 사람들이 이 플러그인을 찾기 쉬워져요',
    rate: '플러그인 페이지에서 평가하기',
    rateSub: 'JetBrains Marketplace에 리뷰 남기기',
    share: '친구에게 알리기',
    shareSub: '소개 한 줄과 링크를 복사해요',
    shareCopied: '복사했어요 - 원하는 곳에 붙여 넣으세요',
    shareText:
      'Amazing Claude Code GUI 한번 봐 - JetBrains IDE 안에 Claude Code를 제대로 된 패널로 넣어줘: https://plugins.jetbrains.com/plugin/33255-amazing-claude-code',
  },

  login: {
    checking: 'Claude Code를 찾는 중…',
    notFound: 'Claude Code를 찾지 못했어요',
    notFoundText:
      '패널은 claude CLI로 움직여요. 이미 깔려 있다면 위치를 알려 주세요 - IDE가 보는 PATH가 터미널과 늘 같지는 않아요.',
    useThis: '이걸로 쓰기',
    whereLooked: '패널이 찾아본 곳',
    checkAgain: '다시 확인',
    signIn: 'Claude Code에 로그인',
    signInText:
      '로그인은 IDE 터미널에서 한 번만 하면 돼요. Claude가 브라우저를 열고 당신이 돌아오길 기다립니다. 패널은 알아서 이어받아요.',
    logIn: '로그인',
    openTerminalAgain: '터미널 다시 열기',
    finishInTerminal: '터미널에서 로그인을 마쳐 주세요 - 이 화면은 알아서 닫혀요.',
  },

  stream: {
    waitingForYou: '기다리는 중',
    waitingForSubagent: '서브에이전트 기다리는 중',
    waitingForSubagents: (n) => `서브에이전트 ${n}개 기다리는 중`,
    thinking: 'Claude가 생각하는 중',
    retryWaiting: (label, waited) => `${label} · ${waited} 기다리는 중`,
    withElapsed: (label, elapsed) => `${label} · ${elapsed}`,
  },

  agentTask: {
    failedBeforeFinishing: '끝나기 전에 실패했어요.',
    stoppedBeforeFinishing: '끝나기 전에 멈췄어요.',
    backgroundEnded: (outcome, duration) =>
      duration ? `백그라운드 명령이 ${duration} 만에 ${outcome}.` : `백그라운드 명령이 ${outcome}.`,
    outcomeFailed: '실패했어요',
    outcomeStopped: '멈췄어요',
    outcomeFinished: '끝났어요',
    trimmed: (n) => `…이전 ${n}단계를 줄였어요`,
  },

  feed: {
    empty: { title: '이 프로젝트에 대해 Claude에게 물어보세요', hint: '@ 파일 · / 명령' },
    you: '나',
    jumpToLatest: '최신으로 이동',
    copyBlock: '이 블록 복사',
    copyReply: '답변 전체 복사',
    pastedLines: (n) => `${n}줄 붙여넣음`,
    pasteClose: '다시 접기',
    copyPaste: '붙여넣은 텍스트 복사',
    pasteShown: (shown, total) => `전체 ${total}줄 중 처음 ${shown}줄 · 복사는 전체`,
    fromOutput: '출력에서',

    think: { chip: '생각', thoughts: (n) => `생각 ${n}개` },

    workflow: {
      agents: (n) => `에이전트 ${n}개`,
      running: (n) => `${n}개 진행 중`,
      done: (n) => `${n}개 완료`,
      failed: (n) => `${n}개 실패`,
      queued: '대기 중',
      skipped: '건너뜀',
      attempt: (n) => `${n}번째 시도`,
      cached: '저널에서',
    },

    tool: {
      running: '· 진행 중',
      waitingForYou: '· 기다리는 중',
      failed: '· 실패',
      lines: (n) => `· ${n}줄`,
      matches: (n) => (n > 0 ? `· ${n}건 일치` : '· 일치 없음'),
      output: (empty) => (empty ? '· 출력 없음' : '· 출력 있음'),
      diff: (added, removed) => `· +${added} −${removed}`,
      moreLines: (n) => `… ${n}줄 더`,
      count: (n) => `도구 ${n}개`,
      closed: {
        replay: '저장된 대화에는 이 호출의 결과가 없어요.',
        exited: '이게 끝나기 전에 Claude Code가 응답을 멈췄어요.',
        stopped: '끝나기 전에 멈췄어요.',
        turnEnded: '이 호출보다 턴이 먼저 끝났어요.',
        untracked: '백그라운드에서 아직 돌고 있어요 - 패널은 더 이상 따라가지 않아요.',
      },
      closedMeta: {
        replay: '· 기록에 없음',
        exited: '· 중단됨',
        stopped: '· 중단됨',
        turnEnded: '· 미완료',
        untracked: '· 추적 중단',
      },
    },

    /** The counter under a subagent's own log while it runs. */
      agentWorking: (duration) => `작업 중 · ${duration}`,
    task: {
      /** The heading over a subagent's errand inside its card in the feed (see TaskCard). */
      errand: '맡긴 일',
      closed: {
        replay: '어떻게 끝났는지는 저장된 대화에 없어요.',
        exited: '결과가 돌아오기 전에 세션이 끝났어요.',
        stopped: '결과가 돌아오기 전에 멈췄어요.',
        turnEnded: '결과가 돌아오기 전에 턴이 끝났어요.',
        untracked: '아직 돌고 있어요 - 패널은 더 이상 따라가지 않아요.',
      },
    },

    bash: { running: '진행 중', noOutput: '출력 없음' },

    checkpoint: {
      cleared: '대화를 비웠어요 - 이 위로는 아무것도 기억하지 않아요',
      earlier: '이전 메시지',
      notKept: '이전 메시지는 더 이상 보관하지 않아요',
      notOnPhone: '이전 메시지는 휴대폰으로 보내지 않아요',
      loadEarlier: '이전 메시지 불러오기',
    },

    compact: {
      label: '컨텍스트',
      running: '대화를 압축하는 중…',
      done: (manual) => `컨텍스트를 ${manual ? '직접' : '자동으로'} 압축했어요`,
      doneWith: (manual, before, after, took) =>
        `${manual ? '직접' : '자동으로'} ${before}의 컨텍스트를 ${after ? `${after} 요약으` : '요약으'}로 압축${took ? ` (${took})` : ''}`,
    },

    retry: {
      label: '재시도',
      reason: {
        rateLimited: '요청이 너무 잦아요',
        overloaded: 'API 과부하',
        auth: '인증 실패',
        error: 'API 오류',
      },
      attempt: (n) => `${n}번째 시도`,
      attemptOf: (n, max) => `${n}/${max}번째 시도`,
      retryingIn: (seconds) => `${seconds}초 후 재시도`,
      retrying: '재시도 중…',
      recovered: (attempts) => `${attempts}번째 시도에서 성공`,
      failed: (attempts) => `${attempts}번 시도하고 포기`,
      stopped: (attempts) => `${attempts}번째 시도에서 멈춤`,
    },

    result: {
      worked: (duration) => (duration ? `작업 ${duration}` : '완료'),
      stopped: (duration) => (duration ? `직접 멈춤 · ${duration}` : '직접 멈춤'),
    },

    modelSwitch: { label: '모델', note: 'Claude Code가 바꾼 거예요, 당신이 아니라' },

    crash: {
      label: '세션',
      text: 'Claude Code가 예기치 않게 종료됐어요.',
      textWithCode: (code) => `Claude Code가 예기치 않게 종료됐어요 (종료 코드 ${code}).`,
    },

    limit: {
      label: '한도',
      extraLabel: '추가 사용',
      extra: (window) => `${window ? `${window} 한도` : '사용 한도'}를 다 썼어요 - 작업은 추가 사용으로 계속되고, 요금제와 별도로 청구돼요`,
      waiting: (window) => `${window ? `${window} 한도` : '사용 한도'}를 다 썼어요 - 초기화를 기다리는 중`,
      resetAt: (clock, left) => `${clock} · ${left} 후`,
    },

    plan: {
      label: '계획 준비됨',
      steps: (n) => `· ${n}단계`,
      approve: '승인하고 실행',
      keepPlanning: '계획 계속',
      withdrawn: '에이전트가 결정을 기다리지 않게 됐어요',
    },

    ask: {
      label: 'CLAUDE의 질문',
      blocks: (n) => `질문 ${n}개 · 여기서 멈춰 있어요`,
      pickAny: '여러 개 선택 가능',
      other: '기타',
      ownAnswer: '직접 답을 적어요…',
      send: '답변 보내기',
      pickToContinue: '고르면 계속돼요',
      note: '물어본 자리에서 그대로 이어져요',
      expand: '질문 펼치기',
      collapse: '질문 접기',
      dismiss: '질문 닫기',
      dismissHint: '닫고 직접 답하기',
    },

    findings: {
      label: '리뷰',
      fixed: '고침',
      skipped: '건너뜀',
      noChange: '고칠 것 없음',
      unconfirmed: '미확인',
    },

    copy: { copied: '복사됨', click: '클릭해서 복사' },
  },

  chrome: {
    tasks: {
      label: '할 일',
      listLabel: '할 일 목록',
      progress: (done, total) => `${done} / ${total} 완료`,
      collapse: '할 일 목록 접기',
      expand: '나머지 할 일 보기',
    },
    queue: {
      label: '대기 중',
      hint: (n) => `${n}개가 이번 실행이 끝나면 차례로 나가요 · 끌어서 순서 변경`,
    },
    selection: { quote: '인용', fork: '여기서 분기' },
    streams: {
      main: '메인',
      background: '백그라운드',
      stopAgent: '이 에이전트 멈추기',
      stopAgentNamed: (name) => `멈추기: ${name}`,
      stopAgentTitle: '이 에이전트를 멈출까요?',
      stopCommand: '이 명령 멈추기',
      stopCommandTitle: '이 명령을 멈출까요?',
    },
    confirm: { cancel: '취소', stop: '멈추기', open: '열기' },
    resume: { title: '이 탭은 아직 작업 중이에요. 여기에 지난 대화를 열까요?' },
    noChats: { title: '열린 대화가 없어요', button: '새 대화' },
    crash: {
      title: '패널에서 오류가 났어요',
      text: '새로 고쳐도 안전해요. 대화는 패널 뒤의 Claude Code 프로세스에 있고 패널보다 오래 남아요.',
      button: '패널 새로 고침',
    },
  },

  remote: {
    codeLabel: '페어링 코드',
    states: {
      idle: { label: '꺼짐', hint: '이 IDE에는 밖에서 닿을 수 없어요.' },
      connecting: { label: '연결 중…', hint: '릴레이에 처음 닿는 중이에요.' },
      connected: { label: '연결됨', hint: '연결된 기기에서 이 프로젝트가 보여요.' },
      reconnecting: {
        label: '다시 연결 중…',
        hint: '선이 끊겼어요. 흔한 일이고, 알아서 돌아옵니다.',
      },
      unreachable: {
        label: '릴레이에 닿지 않음',
        hint: '릴레이가 응답하지 않아요. 작업에는 영향이 없고, 휴대폰만 영향을 받아요.',
      },
      refused: {
        label: '거절됨',
        hint: '릴레이가 이 플러그인을 받지 않았어요. 너무 오래됐거나, 이 주소를 다른 IDE가 쓰고 있을 수 있어요.',
      },
    },
    agent: (id) => `에이전트 ${id}`,
    thisIde: '이 IDE',
    relay: '릴레이',
    device: '기기',
    allow: '이 IDE에 원격으로 닿을 수 있게 허용',
    allowHint: '켤 때까지는 꺼져 있고, 다시 끄는 순간 바로 꺼져요.',
    relayAddress: '릴레이 주소',
    noSafe:
      '이 IDE는 비밀번호를 기억하지 않도록 설정돼 있어서, 연결이 재시작을 넘기지 못해요. 유지하려면 IDE의 비밀번호 저장소를 켜 주세요.',
    wantsToPair: (device) => `${device}이(가) 연결을 요청해요`,
    checkFingerprint: '기기가 스스로 말하는 이름이에요 - 아래 지문이 그 기기 화면과 같은지 확인하세요.',
    allowDevice: '허용',
    refuse: '거절',
    scanThis: '휴대폰으로 이걸 찍으세요',
    codeNote: (left) =>
      `${left} · 한 번만 됩니다. 비밀은 주소의 # 뒤쪽에 있고, 브라우저는 그 부분을 서버로 보내지 않아요.`,
    minutesLeft: (minutes) => `${minutes}분 남음`,
    secondsLeft: (seconds) => `${seconds}초 남음`,
    stopOffering: '그만 제안하기',
    pairDevice: '기기 연결하기',
    pairedDevices: '연결된 기기',
    revoke: '연결 해제',
    whatTravels: '밖으로 나가는 것, 그리고 휴대폰이 할 수 있는 일',
    whatTravelsSub: '켜기 전에 읽어 주세요',
    fingerprint: '이 IDE의 지문',
    about: {
      first:
        '켜면 연결된 휴대폰이 읽고 답할 수 있도록 대화가 릴레이를 거쳐 갑니다. 에이전트가 읽고 쓰는 것 - 소스 코드, 파일 경로, 명령 출력 - 도 포함돼요.',
      second:
        '릴레이는 그 내용을 읽지 못해요. 내용은 이 IDE와 휴대폰 사이에서 봉해집니다. 릴레이가 보는 건 언제 연결돼 있는지와 얼마나 오갔는지, 즉 대략적인 작업 시간뿐이에요. 직접 릴레이를 운영할 수도 있습니다.',
      can: '연결된 휴대폰은 권한에 답하고, 메시지를 보내고, 턴을 멈출 수 있어요.',
      cannot:
        '셸 명령 실행, 플러그인 설치, 권한 모드 변경, 이 기기의 클립보드 접근은 못 해요.',
      third:
        '연결은 이 화면에 한 번만 나오는 코드로 증명합니다. 두 지문을 맞춰 보면 코드만으로는 못 막는 것 - 화면을 찍어 먼저 스캔한 사람 - 을 걸러낼 수 있어요.',
    },
  },

  feedback: {
    button: '버그를 알리거나 아이디어 보내기',
    kinds: {
      bug: { label: '버그', placeholder: '무슨 일이 있었고, 원래는 어떻게 되리라 생각했나요?' },
      idea: { label: '아이디어', placeholder: '패널이 무엇을 해 주면 좋을까요?' },
      hello: { label: '인사', placeholder: '무엇이든 좋아요 - 대기열이 아니라 사람에게 닿습니다.' },
    },
    email: '이메일',
    emailOptional: '선택',
    attachments: '첨부',
    addFiles: '파일 추가',
    removeFile: (name) => `빼기: ${name}`,
    attachTotal: (count, max, size, budget) => `${count}/${max} · ${size}/${budget}`,
    logs: '디버그 로그 첨부',
    logsFromTab: (tab) => `${tab} 탭에서 - `,
    logsFromOpenTab: '지금 열려 있는 탭에서: ',
    logsWhat:
      '버전, 소요 시간, 그리고 잘못된 부분. 대화 내용도, 파일 이름도, 경로도 들어가지 않아요 - 보내기 전에 전부 읽어 볼 수 있습니다.',
    logsOnlyBug: '버그일 때만 가능해요. 보고서는 무언가 잘못된 이야기인데, 여기엔 이야기할 게 없어요.',
    seeWhat: '무엇이 함께 가는지 그대로 보기',
    send: '보내기',
    sending: '보내는 중…',
    sentPartly: (note) => `보냈지만 전부는 아니에요. ${note}`,
    sent: '보냈어요. 고마워요 ❤️ - 저에게 바로 갑니다.',
    notSent: '보내지 못했어요. 잃은 건 없으니 다시 시도해 주세요.',
    reportNote: (tab) =>
      `이게 첨부되는 전부예요, 한 글자도 빼지 않고${tab ? ` (${tab} 탭)` : ''}. 당신의 IDE 안에서, 플러그인이 직접 본 것으로 만들어집니다: 버전, 그 대화의 모양, 실패한 것들. 파일 이름은 짧은 해시로 나와서 같은 파일은 같은 것으로 읽히지만 어떤 파일인지는 드러나지 않아요.`,
    building: '만드는 중…',
    copy: '복사',
    problems: {
      empty: '먼저 몇 마디 적어 주세요.',
      tooLong: (max) => `${max}자를 넘었어요.`,
      tooMany: (max) => `파일은 ${max}개까지예요.`,
      tooHeavy: (budget) => `파일 합계가 ${budget}을(를) 넘었어요.`,
    },
  },

  mcp: {
    empty: '설정된 MCP 서버가 없어요.',
    addServer: '서버 추가',
    namePlaceholder: '이름',
    commandPlaceholder: '명령, 또는 sse/http의 URL',
    refreshAll: '모두 새로 고침',
    refreshing: '새로 고치는 중…',
    add: '추가',
    adding: '추가하는 중…',
    authenticate: '로그인',
    opening: '여는 중…',
    reconnect: '다시 연결',
    retry: '다시 시도',
    reconnecting: '다시 연결하는 중…',
    remove: '삭제',
    removing: '삭제하는 중…',
    status: { connected: '연결됨', needsAuth: '로그인 필요', failed: '실패', pending: '연결 중…', disabled: '꺼짐' },
  },

  plugins: {
    tabInstalled: '설치됨',
    tabBrowse: '둘러보기',
    tabMarkets: '마켓',
    emptyInstalled: '설치된 플러그인이 없어요.',
    searchPlaceholder: '이름이나 설명으로 플러그인 검색…',
    noMarketplaces: '연결된 마켓플레이스가 없어요.',
    noMatches: '결과 없음.',
    emptyMarketplaces: '설정된 마켓플레이스가 없어요.',
    addMarketplace: '마켓플레이스 추가',
    marketplacePlaceholder: 'URL, 경로, 또는 GitHub의 owner/repo',
    refresh: '새로 고침',
    refreshing: '새로 고치는 중…',
    install: '설치',
    installing: '설치하는 중…',
    uninstall: '제거',
    uninstalling: '제거하는 중…',
    enable: '켜기',
    enabling: '켜는 중…',
    disable: '끄기',
    disabling: '끄는 중…',
    add: '추가',
    adding: '추가하는 중…',
    remove: '삭제',
    removing: '삭제하는 중…',
  },

  mobile: {
    pair: '연결',
    removeFromQueue: '대기열에서 빼기',
    newSessionTitle: '새 대화',

    sessions: {
      nothingYet: '아직 보여줄 게 없어요. IDE에서 프로젝트를 열거나, 다른 IDE를 연결해 보세요.',
      nonePaired: '이 기기에 연결된 IDE가 아직 없어요. 「연결」을 눌러 추가하세요.',
      recentlyOpened: '최근에 연 것',
      projectClosed: '지금 IDE에서 열려 있지 않아요.',
      noConversations: '아직 대화가 없어요.',
      hidden: (n) => `숨김 ${n}개 · 보기`,
      pastConversations: '지난 대화',
      newChat: '새 대화',
      reach: {
        connecting: '연결 중…',
        asleep: '릴레이에는 붙었는데, 응답하는 IDE가 없어요.',
        elsewhere: '다른 탭이나 설치된 앱에서도 열려 있어요 - 연결은 그쪽이 쥐고 있어요.',
        reconnecting: '다시 연결하는 중… 아래 목록은 오래된 것일 수 있어요.',
        offline: '릴레이에 닿지 않아요. 잃는 건 없고, 연결은 알아서 돌아와요.',
      },
      agent: {
        connecting: '연결 중…',
        asleep: '응답 없음',
        elsewhere: '다른 곳에서 열림',
        reconnecting: '다시 연결 중…',
        offline: '오프라인',
      },
    },

    history: { title: '기록', empty: '이 프로젝트에는 아직 지난 대화가 없어요.' },

    decision: {
      planWaiting: '계획이 기다리고 있어요',
      questionOf: (n, total) => `질문 ${n}/${total}`,
      nothingWaiting: '여기서 기다리는 건 이제 없어요.',
      openConversation: '대화 열기',
      allowOnce: '이번만 허용',
      deny: '거절',
    },

    thread: {
      loading: '대화를 불러오는 중…',
      waitingPerm: '권한이 필요해요 - 답해 주세요',
      waitingAsk: '질문이 기다려요 - 답해 주세요',
      waitingPlan: '계획이 기다려요 - 결정해 주세요',
    },

    newSession: {
      title: '새 대화',
      asConfigured: '설정된 대로',
      asConfiguredSub: '그 기기의 Claude Code 설정을 그대로 씁니다.',
      model: '모델',
      effort: '사고 강도',
      mode: '모드',
      closedProject: '이 프로젝트는 닫혀 있어요 - IDE가 먼저 열고 시작해요.',
      start: '시작',
      opening: '프로젝트를 여는 중…',
    },

    pairing: {
      title: 'IDE와 연결',
      fromCode: '이 코드를 보여준 IDE와 연결하는 중이에요. 지금 그 기기 앞의 사람에게 허락을 구하고 있어요.',
      how: 'IDE에서 패널 메뉴 → 원격 접속 → 기기 연결을 여세요. 카메라로 코드를 찍거나, 아래에 직접 입력하세요.',
      fingerprintAsk: 'IDE가 지문을 보여줍니다. 아래와 같을 때만 허용하세요:',
      fingerprintNote: '이어서 IDE가 확인을 요청하며 지문을 보여줍니다. 이 앱도 같은 지문을 보여줘요 - 서로 같을 때만 허용하세요.',
      waiting: 'IDE를 기다리는 중…',
      done: '연결됐어요.',
      failed: '연결하지 못했어요.',
      notACode: '연결 코드로 보이지 않아요.',
      iphone: 'iPhone',
      ipad: 'iPad',
      android: 'Android 폰',
      browser: '브라우저',
    },

    composer: {
      commands: '명령',
      closeList: '목록 닫기',
      usageLimits: '사용 한도',
      removeImage: (name) => `빼기: ${name}`,
      say: '무언가 적어 보세요…',
      reconnecting: '다시 연결 중…',
      slash: '슬래시 명령',
      attachPhoto: '사진 첨부',
      voice: '음성 입력',
      voiceStop: '받아쓰기 끝내기',
      stop: '실행 멈추기',
      whatTravels: 'IDE와 이 기기 사이에 오가는 것',
      projectFiles: '프로젝트 파일',
      ofTotal: (shown, total) => `${shown}/${total}`,
      photosDropped: (n) => `${n}장은 한 메시지에 들어가지 않아요 - 이것부터 보내세요.`,
      photoTooBig: '한 메시지에 들어가지 않아요. 사진을 한 장씩 보내 보세요.',
    },

    limits: {
      title: '한도와 컨텍스트',
      fiveHourWindow: '5시간 창',
      weeklyWindow: '주간 창',
      paceNote: (percent) =>
        `흐린 호가 일정한 속도예요. 오늘까지라면 주간의 ${percent}%까지가 「예정」. 밝은 호가 그보다 짧으면 계획대로예요.`,
      context: '이 대화의 컨텍스트',
      ofTotal: (used, total) => `${used}/${total}`,
      spentToday: '오늘 사용량',
      acrossProjects: '모든 프로젝트 합계',
      noWindows: 'IDE가 아직 구독 사용량 창을 알려주지 않았어요.',
      extraUsage: '추가 사용',
      extraUsed: (window) => `${window ? `${window} 한도` : '한도'}를 다 썼어요, 요금제와 별도로 청구돼요`,
      resetUnknown: '초기화 시각은 아직 몰라요',
      resetsIn: (left) => `${left} 후 초기화`,
    },
  },

  status: {
    todayTokens: '오늘 쓴 토큰 (모든 프로젝트 합계)',
    openPr: '브라우저에서 pull request 열기',
    noPr: 'PR 없음',
    effortHint: (effort) => `사고 강도: ${effort}`,
    modelHint: (model) => `모델: ${model}`,
    modelHintSwitched: (model, from) => `모델: ${model} - Claude Code가 ${from}에서 스스로 옮겼어요`,
    modeHint: (mode) => `권한 모드: ${mode}`,
    sessionLimit: '5시간 한도',
    weekLimit: '주간 한도',
    windowUsed: (title, percent) => `${title}: ${percent}% 사용`,
    resetsIn: (left) => `${left} 후 초기화`,
    paceBudget: (percent) => `흐린 링: 일정한 속도라면 오늘까지 ${percent}%`,
    extraUsage: (limit) => `추가 사용: ${limit}를 다 썼어요. 이후 작업은 요금제와 별도로 청구됩니다`,
    extraSpent: (percent) => `이번 달 추가 사용량의 ${percent}%를 썼어요`,
    limitNamed: (window) => `${window} 한도`,
    limitUnnamed: '한도',
  },

  limits: {
    fiveHour: '5시간',
    weekly: '주간',
    weeklyOpus: '주간 Opus',
    weeklySonnet: '주간 Sonnet',
    weeklyApps: '주간 앱',
    weeklyWithExtra: '주간 (추가 사용 포함)',
    extra: '추가 사용',
  },

  permission: {
    label: '권한',
    decisions: { once: '이번만 허용', always: '항상 허용', deny: '거절' },
    underMode: (mode) => `${mode} 모드`,
  },

  selectors: {
    model: '모델',
    effort: '사고 강도',
    mode: '모드',
    modeHint: 'shift+tab',
  },

  commands: {
    resume: '이 프로젝트의 지난 대화 열기',
    fork: '이 대화를 새 탭에서 이어가기',
    login: 'IDE 터미널에서 Claude Code에 로그인',
    logout: '로그아웃 - IDE 터미널이 열려요',
    model: '이 세션의 모델 바꾸기',
    effort: 'Claude가 움직이기 전에 얼마나 생각할지 정하기',
    context: '지금 컨텍스트 창에 무엇이 들어 있는지',
    cost: '이 세션의 비용과 사용량 창',
    usage: '구독 사용량 창과 초기화 시점',
    codeReview: 'pull request 리뷰하기',
  },
}
