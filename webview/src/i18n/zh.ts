import type { Dict } from './en'

/**
 * 简体中文。英文词典（见 en.ts）的翻译，而不是另写一份文案。
 *
 * 约定：使用全角标点（，。、：），中文与拉丁字母、数字之间留一个空格；短标签末尾不加句号，
 * 成句的说明才加。产品名称（Claude Code、MCP、Opus、Sonnet、Haiku、Git、PR）和 CLI 工具名不翻译。
 * 破折号沿用原文的写法 - 前后带空格的连字符，不用中文破折号。
 */
export const zh: Dict = {
  common: {
    back: '返回',
    close: '关闭',
    closeMenu: '关闭菜单',
    loading: '加载中…',
    muted: '静音',
    countOn: (n) => `${n} 项开启`,
  },

  menu: {
    titles: {
      menu: { title: '菜单', hint: '面板平时收起来的一切' },
      history: { title: '历史记录', hint: '本项目过去的对话' },
      mcp: { title: 'MCP 服务器', hint: '状态 · 登录 · 重新连接' },
      plugins: { title: '插件', hint: '已安装 · 浏览 · 市场' },
      settings: { title: '设置', hint: '面板的行为和提示音' },
      sounds: { title: '提示音', hint: '面板需要你的时候' },
      remote: { title: '远程访问', hint: '状态 · 中继 · 已配对设备' },
      remoteAbout: { title: '哪些内容会离开本机', hint: '开启之前请先读一遍' },
      defaultMode: { title: '默认模式', hint: '新标签页从哪种模式开始' },
      composerLayout: { title: '输入框布局', hint: '输入框放在哪里' },
      pasteCollapse: { title: '粘贴的文本', hint: '何时把粘贴折叠成小卡片' },
      improvePrompt: { title: '优化提示词', hint: '星标按钮按什么要求改写' },
      voice: { title: '语音输入', hint: '用说的，不用打字' },
      voiceLanguage: { title: '口述语言', hint: '听写要听哪种语言' },
      voiceDevice: { title: '麦克风', hint: '用哪一个来听' },
      language: { title: '语言', hint: '面板使用的语言' },
      feedback: { title: '反馈', hint: '问题、想法，或者只是打个招呼' },
      feedbackLog: { title: '将要附带的内容', hint: '发送之前的完整报告' },
    },

    groups: {
      project: '本项目',
      devices: '设备',
      plugin: '插件本身',
      author: '来自作者',
    },

    rows: {
      history: { label: '历史记录', sub: '本项目过去的对话' },
      statistics: { label: '统计', sub: '时长、习惯、成就' },
      mcp: { label: 'MCP 服务器', sub: '状态、登录、重新连接' },
      plugins: { label: '插件', sub: '已安装、浏览、市场' },
      remote: { label: '远程访问', sub: '状态、中继、已配对设备' },
      settings: { label: '设置', sub: '提示音、模式、布局、语言' },
      feedback: { label: '发送反馈', sub: '问题、想法，或者只是打个招呼' },
    },

    author: {
      title: '马上要面试了吗？',
      body: '我为此做了一个 AI 助手。免费试用 - 也算是支持我。谢谢',
      tagline: '实时面试副驾',
    },

    footer: 'Amazing Claude Code GUI',
  },

  settings: {
    rows: {
      sounds: { label: '提示音', sub: '面板需要你的时候' },
      defaultMode: { label: '默认模式', sub: '新标签页从哪种模式开始' },
      composerLayout: { label: '输入框布局', sub: '输入框放在哪里' },
      pasteCollapse: { label: '粘贴的文本', sub: '何时把粘贴折叠成小卡片' },
      improvePrompt: { label: '优化提示词', sub: '星标按钮按什么要求改写' },
      voice: { label: '语音输入', sub: '用你自己的 Deepgram 密钥听写' },
      language: { label: '语言', sub: '面板使用的语言' },
    },

    improveSummary: { builtIn: '内置', custom: '自定义' },
  },

  language: {
    note: '这里只影响面板本身。Claude 用哪种语言回答，是 Claude Code 自己的设置，与终端共用，这里不会改动它。',
    followIde: '自动',
    followIdeSub: (language) => `跟随 IDE - 当前是${language}`,
    followIdeUnknown: '跟随 IDE',
  },

  sounds: {
    turnFinished: { label: '回合结束', hint: 'Claude 回答完了，正在等你' },
    permission: { label: '请求授权', hint: '有工具调用需要你批准' },
    question: { label: '提出问题', hint: 'Claude 请你选一个答案' },
    plan: { label: '计划就绪', hint: '有计划在等你决定' },
    rateLimit: { label: '达到用量上限', hint: '订阅额度用尽，回合被中断' },
    extraUsage: {
      label: '开始额外计费',
      hint: '套餐额度已用完 - 之后的用量另行计费',
    },
    trouble: { label: '出错了', hint: '报错、进程结束，或登录已失效' },
    play: '试听',
    playNamed: (sound) => `试听${sound}`,
    volumeOf: (sound) => `${sound}音量`,
  },

  history: {
    empty: '这个项目还没有过去的对话。',
    today: '今天',
    earlier: '更早',
    messages: (n) => `${n} 条消息`,
  },

  composerLayout: {
    bottom: '默认',
    compact: '紧凑',
    left: '靠左',
    right: '靠右',
  },

  pasteCollapse: {
    note: '多行粘贴会折叠成一张小卡片，免得大段文字塞满输入框。两种方式都不会丢内容 - 折叠后的粘贴完整保留原文，点它上面的铅笔按钮就能展开回输入框。',
    never: '从不折叠',
    neverSub: '粘贴的内容始终以纯文本留在输入框里',
    from: (lines) => `${lines} 行起`,
    foldLabel: '长粘贴折叠',
    foldSub: (min, max) => `从多少行起 - ${min} 到 ${max}`,
  },

  improvePrompt: {
    note: '回形针旁边的星标按钮会改写输入框里的内容，这就是它提出的要求。它会作为一次独立的 Claude Code 运行发出 - 不带工具、不读文件、不接入对话 - 并和普通消息一样计入你的用量。',
    label: '改写要求',
    emptyMeans: '留空就用上面灰色显示的内置要求。',
    builtInLanguage:
      '内置文字是英文的，因为它是写给模型的指令，而不是界面的一部分 - 它已经要求用草稿本身的语言返回。你自己写时用任何语言都可以。',
    editBuiltIn: '编辑内置文字',
    backToBuiltIn: '恢复内置文字',
  },

  voice: {
    note: '按住一个键说话，字就随着话音落进输入框。它用的是你自己的 Deepgram 密钥：音频只发给 Deepgram，插件中间没有任何服务器。',
    off: '已关闭',
    enable: '语音输入',
    enableHint: '显示麦克风按钮，并监听下面的快捷键。',

    key: 'DEEPGRAM API 密钥',
    keyPlaceholder: '粘贴你的密钥',
    keySet: (tail: string): string => `密钥已保存，末尾是 ${tail}`,
    keySave: '保存',
    keyForget: '忘记这个密钥',

    balanceLeft: (amount: string): string => `账户还剩 ${amount}`,
    balanceChecking: '正在询问 Deepgram…',
    balanceNoKey: '还没有密钥。',
    balanceNoAccess: '密钥可用。要查看余额，需要 Owner 或 Admin 角色的密钥。',
    balanceRejected: 'Deepgram 不认这个密钥。',
    balanceFailed: '连不上 Deepgram。请检查网络后重试。',
    balanceRefresh: '刷新',

    getKey: '还没有密钥？',
    getKeyHint: '到 deepgram.com 注册并创建一个 API 密钥。新账户免绑卡即送 200 美元额度 —— 按现在的价格，够听写好几百个小时。',
    openSite: '打开 deepgram.com',

    hotkeys: '快捷键',
    hotkeysHint: '只要键盘在 IDE 里就有效 —— 编辑器、面板、对话框都算。切到别的应用就不行。',
    push: '按住说话',
    pushHint: '按住时录音，松开就停。',
    hold: '解放双手',
    holdHint: '按一次开始，再按一次结束。',
    keyboard: '按键',
    mouse: '鼠标',
    record: '设置',
    recording: '请按一个键…',
    recordingMouse: '请按鼠标按键…',
    notSet: '未设置',
    clear: '清除',
    sideLeft: '左',
    sideRight: '右',
    badButton: '只能用鼠标的侧键 —— 主要的三个键在 IDE 里到处都已有各自的含义。',
    modifierTip: '这里用单个修饰键最合适：按住右 Option 或右 Ctrl，IDE 里没有别的功能来抢。',

    language: '口述语言',
    languageHint: '听写要听哪种语言',
    searchLanguages: '搜索语言…',
    multiHint: '多语种模式能跟上一句话中途换语言。但和指定语言相比，两种情况下它都更差 —— 只有真的会在一句话里混两种语言时才选它。',

    device: '麦克风',
    deviceHint: '用哪一个来听',
    deviceDefault: '系统默认',
    deviceDefaultHint: '跟随系统的设置',
    deviceNote: '改动会在下一次听写时生效。',

    errorNoKey: '请先填入 Deepgram 密钥 —— 设置，然后是语音输入。',
    errorNoKeyRemote: '运行这个对话的那台机器上还没有 Deepgram 密钥 —— 请到那边的设置里，在语音输入中添加。',
    errorOff: '运行这个对话的那台机器上，语音输入是关闭的 —— 请到那边的设置里打开。',
    errorMicrophone: '麦克风打不开，可能被别的应用占着。',
    errorKey: 'Deepgram 拒绝了这个密钥。请在语音输入界面里检查。',
    errorNetwork: '连不上 Deepgram。请检查网络后重试。',
    errorGeneral: '听写中断了，请再试一次。',
  },

  modes: {
    manual: {
      label: '询问权限',
      sub: '可以自由读取，每次写入和每条命令之前都会先问你。',
      short: '询问',
    },
    acceptEdits: {
      label: '接受编辑',
      sub: '自动批准工作目录内的文件改动，执行命令仍然会问。',
      short: '接受',
    },
    plan: {
      label: '计划',
      sub: '先调研并给出计划，你批准之前不动任何东西。',
      short: '计划',
    },
    auto: {
      label: '自动',
      sub: '不再询问 - 有风险的操作交由分类器逐一把关。并非所有模型都支持。',
      short: '自动',
    },
    dontAsk: {
      label: '从不询问',
      sub: '从不弹出询问；凡是没有预先批准的一律拒绝。适合无人值守地运行。',
      short: '不问',
    },
    bypassPermissions: {
      label: '跳过权限检查',
      sub: '几乎跳过所有检查。危险的删除仍然会问。只在容器和用完即弃的虚拟机里使用。',
      short: '跳过',
    },
    tags: {
      default: '默认',
      readOnly: '只读',
      preview: '预览',
      settings: '设置',
      danger: '危险',
    },
  },

  effort: {
    auto: { sub: '恢复为该模型在本次会话中的默认思考强度。' },
    ultracode: { sub: 'xhigh 级别的推理，任务需要时还会自动启用多智能体工作流。' },
    max: { sub: '全力以赴。适合架构设计和难缠的 bug。' },
    xhigh: { sub: '同样的推理再多一些，适合跨很多文件的改动。' },
    high: { sub: '动手之前长时间推理。适合多文件改动。' },
    medium: { sub: '折中。做功能开发时不错的默认值。' },
    low: { sub: '几乎不思考。适合机械改动和快速回答。' },
    tags: { ultra: 'ultra', slow: '较慢', default: '默认' },
  },

  models: {
    default: { label: '默认（推荐）', sub: '沿用本次会话启动时的模型。' },
    opus: { sub: 'Opus 5 · 日常与复杂任务的首选' },
    opus1m: {
      label: 'Opus（100 万上下文）',
      sub: 'Opus 5，100 万上下文 · 适合大型代码库上的长会话',
    },
    sonnet: { sub: 'Sonnet 5 · 处理常规任务更省' },
    sonnet1m: {
      label: 'Sonnet（100 万上下文）',
      sub: 'Sonnet 5，100 万上下文 · 适合大型代码库上的长会话',
    },
    haiku: { sub: 'Haiku 4.5 · 简短回答最快' },
    opusplan: { label: 'Opus 计划模式', sub: '计划模式用 Opus，其余用 Sonnet' },
    unavailable: '不可用',
    /** The line under a model the agent moved to by itself - see modelMenu. */
    switchedItself: 'Claude Code 自己切换到了这个模型。',
  },

  composer: {
    placeholder: '提问，或者描述要改什么…',
    placeholderPlan: '说说要规划什么…',
    attach: '附加文件或文件夹',
    slash: '斜杠命令',
    improve: '优化提示词',
    improveAgain: '再来一版，还是从你写的开始',
    restore: '还原成你写的',
    stop: '停止',
    forceStop: '没有响应 · 强制停止',
    forceStopHint: 'Claude 没有确认这次停止',
    queue: '排队',
    queueHint: '当前回合结束后发送',
    send: '发送',
    run: '运行',
    runHint: '在你的 shell 里运行 - Claude 会随你的下一条消息看到输出',
    improveEmpty: 'Claude Code 什么也没返回，没有内容可以放进输入框。',
    improveChanged: '改写期间草稿变了，所以没有动它。',
    improveTerminal: '终端命令不会被改写',
    voice: '语音输入',
    voiceStop: '结束听写',
  },

  header: {
    idle: '空闲',
    running: 'Claude 正在工作',
    done: '回合结束',
    attention: '在等你',
    crashed: '会话意外中断',
    statistics: '统计',
    closeStatistics: '关闭统计',
    conversations: '对话',
    newSession: '新建对话',
    menu: '菜单',
    watchers: (n) => `另有 ${n} 个客户端正在看这个项目`,
  },

  thanks: {
    button: '觉得好用？说声谢谢',
    title: '说声谢谢',
    star: '在 GitHub 上加星',
    starSub: '让更多人能找到这个插件',
    rate: '去插件页面打个分',
    rateSub: '在 JetBrains Marketplace 写条评价',
    share: '分享给朋友',
    shareSub: '复制一句介绍和链接',
    shareCopied: '已复制 - 想贴哪儿就贴哪儿',
    shareText:
      '推荐一下 Amazing Claude Code GUI - 把 Claude Code 做成 JetBrains IDE 里像样的面板：https://plugins.jetbrains.com/plugin/33255-amazing-claude-code',
  },

  login: {
    checking: '正在查找 Claude Code…',
    notFound: '没有找到 Claude Code',
    notFoundText:
      '面板是通过 claude 命令行工作的。如果已经装了，请指出它的位置 - IDE 看到的 PATH 不一定和你终端里的一样。',
    useThis: '用这个',
    whereLooked: '面板找过哪些地方',
    checkAgain: '再检查一次',
    signIn: '登录 Claude Code',
    signInText:
      '登录只做一次，在 IDE 的终端里：Claude 会打开浏览器并等你回来。面板会自己接上。',
    logIn: '登录',
    openTerminalAgain: '重新打开终端',
    finishInTerminal: '在终端里完成登录 - 这个界面会自动关闭。',
  },

  stream: {
    waitingForYou: '在等你',
    waitingForSubagent: '在等子智能体',
    waitingForSubagents: (n) => `在等 ${n} 个子智能体`,
    thinking: 'Claude 正在思考',
    retryWaiting: (label, waited) => `${label} · 已等待 ${waited}`,
    withElapsed: (label, elapsed) => `${label} · ${elapsed}`,
  },

  agentTask: {
    failedBeforeFinishing: '还没做完就失败了。',
    stoppedBeforeFinishing: '还没做完就被停止了。',
    backgroundEnded: (outcome, duration) =>
      duration ? `后台命令${outcome}，用时 ${duration}。` : `后台命令${outcome}。`,
    outcomeFailed: '失败了',
    outcomeStopped: '被停止了',
    outcomeFinished: '结束了',
    trimmed: (n) => `…已省略前面 ${n} 步`,
  },

  feed: {
    empty: { title: '问问 Claude 这个项目', hint: '@ 找文件 · / 用命令' },
    you: '你',
    jumpToLatest: '回到最新',
    copyBlock: '复制这段代码',
    copyReply: '复制整条回复',
    pastedLines: (n) => `粘贴了 ${n} 行`,
    pasteClose: '重新折叠',
    copyPaste: '复制粘贴的文本',
    pasteShown: (shown, total) => `共 ${total} 行，显示前 ${shown} 行 · 复制的是全部`,
    fromOutput: '来自输出',

    think: { chip: '思考', thoughts: (n) => `${n} 段思考` },

    workflow: {
      agents: (n) => `${n} 个代理`,
      running: (n) => `${n} 个进行中`,
      done: (n) => `${n} 个完成`,
      failed: (n) => `${n} 个失败`,
      queued: '排队中',
      skipped: '已跳过',
      attempt: (n) => `第 ${n} 次`,
      cached: '来自日志',
    },

    tool: {
      running: '· 进行中',
      waitingForYou: '· 等你决定',
      failed: '· 失败',
      lines: (n) => `· ${n} 行`,
      matches: (n) => (n > 0 ? `· ${n} 处匹配` : '· 没有匹配'),
      output: (empty) => (empty ? '· 没有输出' : '· 有输出'),
      diff: (added, removed) => `· +${added} −${removed}`,
      moreLines: (n) => `… 还有 ${n} 行`,
      count: (n) => `${n} 个工具`,
      closed: {
        replay: '保存的对话里没有这次调用的结果。',
        exited: 'Claude Code 在这一步结束前就没有响应了。',
        stopped: '还没做完就被停止了。',
        turnEnded: '这一回合先结束了，它还没做完。',
        untracked: '仍在后台运行 - 面板不再跟踪它了。',
      },
      closedMeta: {
        replay: '· 记录里没有',
        exited: '· 已中断',
        stopped: '· 已中断',
        turnEnded: '· 未完成',
        untracked: '· 不再跟踪',
      },
    },

    /** The counter under a subagent's own log while it runs. */
      agentWorking: (duration) => `工作中 · ${duration}`,
    task: {
      /** The heading over a subagent's errand inside its card in the feed (see TaskCard). */
      errand: '交给它的任务',
      closed: {
        replay: '它是怎么结束的，保存的对话里没有记录。',
        exited: '会话在它返回之前就结束了。',
        stopped: '还没返回结果就被停止了。',
        turnEnded: '这一回合先结束了，它还没返回。',
        untracked: '仍在运行 - 面板不再跟踪它了。',
      },
    },

    bash: { running: '进行中', noOutput: '没有输出' },

    checkpoint: {
      cleared: '对话已清空 - 这条线以上的内容都不再记得了',
      earlier: '更早的消息',
      notKept: '更早的消息已经不再保留',
      notOnPhone: '更早的消息不会发到手机上',
      loadEarlier: '加载更早的消息',
    },

    compact: {
      label: '上下文',
      running: '正在压缩对话…',
      done: (manual) => `上下文已${manual ? '手动' : '自动'}压缩`,
      doneWith: (manual, before, after, took) =>
        `${manual ? '手动' : '自动'}把 ${before} 的上下文压缩成${after ? ` ${after} 的摘要` : '一份摘要'}${took ? `，用时 ${took}` : ''}`,
    },

    retry: {
      label: '重试',
      reason: {
        rateLimited: '请求过于频繁',
        overloaded: 'API 过载',
        auth: '认证失败',
        error: 'API 出错',
      },
      attempt: (n) => `第 ${n} 次尝试`,
      attemptOf: (n, max) => `第 ${n}/${max} 次尝试`,
      retryingIn: (seconds) => `${seconds} 秒后重试`,
      retrying: '正在重试…',
      recovered: (attempts) => `第 ${attempts} 次尝试后成功`,
      failed: (attempts) => `尝试 ${attempts} 次后放弃`,
      stopped: (attempts) => `在第 ${attempts} 次尝试时停止`,
    },

    result: {
      worked: (duration) => (duration ? `用时 ${duration}` : '已完成'),
      stopped: (duration) => (duration ? `你停止了 · ${duration}` : '你停止了'),
    },

    modelSwitch: { label: '模型', note: '这是 Claude Code 自己换的，不是你' },

    crash: {
      label: '会话',
      text: 'Claude Code 意外退出了。',
      textWithCode: (code) => `Claude Code 意外退出了（退出码 ${code}）。`,
    },

    limit: {
      label: '额度',
      extraLabel: '额外计费',
      extra: (window) => `${window ? `${window}额度` : '订阅额度'}已用尽 - 工作继续，但转为额外计费，在套餐之外`,
      waiting: (window) => `${window ? `${window}额度` : '订阅额度'}已用尽 - 正在等待重置`,
      resetAt: (clock, left) => `${clock} · ${left} 后`,
    },

    plan: {
      label: '计划就绪',
      steps: (n) => `· ${n} 步`,
      approve: '批准并执行',
      keepPlanning: '继续规划',
      withdrawn: '智能体不再等待你的决定了',
    },

    ask: {
      label: 'CLAUDE 提问',
      blocks: (n) => `${n} 个问题 · 回合在等你`,
      pickAny: '可多选',
      other: '其他',
      ownAnswer: '写下你自己的回答…',
      send: '发送答案',
      pickToContinue: '选一个继续',
      note: '回合会从提问的地方接着往下走',
      expand: '展开问题',
      collapse: '收起问题',
      dismiss: '关闭问题',
      dismissHint: '关闭，用自己的话回答',
    },

    findings: {
      label: '审查',
      fixed: '已修复',
      skipped: '已跳过',
      noChange: '无需改动',
      unconfirmed: '未确认',
    },

    copy: { copied: '已复制', click: '点击复制' },
  },

  chrome: {
    tasks: {
      label: '任务',
      listLabel: '任务清单',
      progress: (done, total) => `已完成 ${done} / ${total}`,
      collapse: '收起任务清单',
      expand: '显示其余任务',
    },
    queue: {
      label: '排队中',
      hint: (n) => `${n} 条会在本轮结束后按顺序发出 · 拖动可调整顺序`,
    },
    selection: { quote: '引用', fork: '从这里分叉' },
    streams: {
      main: '主线',
      background: '后台',
      stopAgent: '停止这个智能体',
      stopAgentNamed: (name) => `停止：${name}`,
      stopAgentTitle: '停止这个智能体？',
      stopCommand: '停止这条命令',
      stopCommandTitle: '停止这条命令？',
    },
    confirm: { cancel: '取消', stop: '停止', open: '打开' },
    resume: { title: '这个标签页还在工作。要在这里打开过去的对话吗？' },
    noChats: { title: '没有打开的对话', button: '新建对话' },
    crash: {
      title: '面板出错了',
      text: '重新加载是安全的：对话保存在面板背后的 Claude Code 进程里，不会随面板一起消失。',
      button: '重新加载面板',
    },
  },

  remote: {
    codeLabel: '配对码',
    states: {
      idle: { label: '已关闭', hint: '外部无法访问这个 IDE。' },
      connecting: { label: '连接中…', hint: '第一次去连中继。' },
      connected: { label: '已连接', hint: '配对过的设备可以看到这个项目。' },
      reconnecting: {
        label: '重连中…',
        hint: '线路断了。这很常见 - 它会自己恢复。',
      },
      unreachable: {
        label: '中继不可达',
        hint: '中继没有应答。这不影响你的工作，只影响手机。',
      },
      refused: {
        label: '被拒绝',
        hint: '中继不接受这个插件：可能版本太旧，也可能这个地址被另一台 IDE 占了。',
      },
    },
    agent: (id) => `代理 ${id}`,
    thisIde: '本机 IDE',
    relay: '中继',
    device: '设备',
    allow: '允许远程访问这台 IDE',
    allowHint: '默认关闭，你打开它才生效；关掉的那一刻就立即失效。',
    relayAddress: '中继地址',
    noSafe:
      '这台 IDE 被设置为不记住密码，所以配对撑不过重启。想让它保持下来，请打开 IDE 的密码保险库。',
    wantsToPair: (device) => `${device} 请求配对`,
    checkFingerprint: '这是设备自报的名字 - 请核对下面的指纹和它屏幕上显示的是否一致。',
    allowDevice: '允许',
    refuse: '拒绝',
    scanThis: '用手机扫这个码',
    codeNote: (left) =>
      `${left} · 只能用一次。密钥藏在地址井号后面的部分，浏览器从不会把那一段发给服务器。`,
    minutesLeft: (minutes) => `还剩 ${minutes} 分钟`,
    secondsLeft: (seconds) => `还剩 ${seconds} 秒`,
    stopOffering: '取消配对邀请',
    pairDevice: '配对设备',
    pairedDevices: '已配对的设备',
    revoke: '解除',
    whatTravels: '哪些内容会离开本机，手机能做什么',
    whatTravelsSub: '开启之前请先读一遍',
    fingerprint: '本机 IDE 的指纹',
    about: {
      first:
        '打开之后，你的对话会经过中继，配对的手机才能读到并回应。这也包括智能体读写的内容：源代码、文件路径、命令的输出。',
      second:
        '中继读不到这些内容 - 它们在这台 IDE 和你的手机之间是封好的。它能看到你什么时候在线、大概过了多少数据，也就是你的工作时段。你也可以自己架一个中继。',
      can: '配对的手机可以回应授权、发送消息、停止一个回合。',
      cannot: '它不能执行 shell 命令、安装插件、更改权限模式，也碰不到这台机器的剪贴板。',
      third:
        '配对靠这个界面上只出现一次的码来验证。核对两边的指纹能挡住码本身挡不住的情况：有人拍下屏幕，抢先扫了码。',
    },
  },

  feedback: {
    button: '报告问题或提个想法',
    kinds: {
      bug: { label: '问题', placeholder: '发生了什么？你原本期待的是什么？' },
      idea: { label: '想法', placeholder: '你希望这个面板能做什么？' },
      hello: { label: '打招呼', placeholder: '随便说点什么 - 这会到一个人手里，不是排队系统。' },
    },
    email: '邮箱',
    emailOptional: '可不填',
    attachments: '附件',
    addFiles: '添加文件',
    removeFile: (name) => `移除：${name}`,
    attachTotal: (count, max, size, budget) => `${count} / ${max} · ${size} / ${budget}`,
    logs: '附带调试日志',
    logsFromTab: (tab) => `来自标签页 ${tab} - `,
    logsFromOpenTab: '来自当前打开的标签页：',
    logsWhat:
      '版本、耗时和出错的地方。不含你的对话内容、文件名和路径 - 而且发送前你可以整份读一遍。',
    logsOnlyBug: '只在报告问题时可用：这份报告是在讲哪里出了错，而这里没有可讲的。',
    seeWhat: '看看究竟会附带什么',
    send: '发送',
    sending: '发送中…',
    sentPartly: (note) => `已发送，但不是全部。${note}`,
    sent: '已发送。谢谢 ❤️ - 这会直接到我手里。',
    notSent: '没能发出去。什么都没丢 - 再试一次吧。',
    reportNote: (tab) =>
      `这就是附件的全部内容，一字不差${tab ? `，对应标签页 ${tab}` : ''}。它是在你的 IDE 里、用插件自己看到的东西拼出来的：版本、那次对话的形状，以及所有失败的地方。文件名以短哈希出现，同一个文件读起来还是同一个，但不会说是哪一个。`,
    building: '正在生成…',
    copy: '复制',
    problems: {
      empty: '先写几句吧。',
      tooLong: (max) => `超过 ${max} 个字符了。`,
      tooMany: (max) => `最多 ${max} 个文件。`,
      tooHeavy: (budget) => `这些文件加起来超过 ${budget} 了。`,
    },
  },

  mcp: {
    empty: '还没有配置 MCP 服务器。',
    addServer: '添加服务器',
    namePlaceholder: '名称',
    commandPlaceholder: '命令，或 sse/http 的 URL',
    refreshAll: '全部刷新',
    refreshing: '刷新中…',
    add: '添加',
    adding: '添加中…',
    authenticate: '登录',
    opening: '打开中…',
    reconnect: '重新连接',
    retry: '重试',
    reconnecting: '重新连接中…',
    remove: '移除',
    removing: '移除中…',
    status: {
      connected: '已连接',
      needsAuth: '需要登录',
      failed: '失败',
      pending: '连接中…',
      disabled: '已停用',
    },
  },

  plugins: {
    tabInstalled: '已安装',
    tabBrowse: '浏览',
    tabMarkets: '市场',
    emptyInstalled: '还没有安装插件。',
    searchPlaceholder: '按名称或描述搜索插件…',
    noMarketplaces: '还没有接入任何市场。',
    noMatches: '没有匹配的结果。',
    emptyMarketplaces: '还没有配置市场。',
    addMarketplace: '添加市场',
    marketplacePlaceholder: 'URL、路径，或 GitHub 上的 owner/repo',
    refresh: '刷新',
    refreshing: '刷新中…',
    install: '安装',
    installing: '安装中…',
    uninstall: '卸载',
    uninstalling: '卸载中…',
    enable: '启用',
    enabling: '启用中…',
    disable: '停用',
    disabling: '停用中…',
    add: '添加',
    adding: '添加中…',
    remove: '移除',
    removing: '移除中…',
  },

  mobile: {
    pair: '配对',
    removeFromQueue: '从队列中移除',
    newSessionTitle: '新对话',

    sessions: {
      nothingYet: '暂时没有可显示的内容。在 IDE 里打开一个项目，或者再配对一台。',
      nonePaired: '这台手机还没有配对任何 IDE。点「配对」添加一台。',
      recentlyOpened: '最近打开过',
      projectClosed: '现在没有在 IDE 里打开。',
      noConversations: '还没有对话。',
      hidden: (n) => `已隐藏 ${n} 个 · 显示`,
      pastConversations: '过去的对话',
      newChat: '新建对话',
      reach: {
        connecting: '正在连接…',
        asleep: '和中继连上了，但没有 IDE 应答。',
        elsewhere: '另一个标签页或已安装的应用里也开着 - 连接由那一份持有。',
        reconnecting: '正在重连… 下面的列表可能不是最新的。',
        offline: '连不上中继。什么都不会丢 - 连接会自己恢复。',
      },
      agent: {
        connecting: '连接中…',
        asleep: '没有应答',
        elsewhere: '在别处打开',
        reconnecting: '重连中…',
        offline: '离线',
      },
    },

    history: { title: '历史记录', empty: '这个项目还没有过去的对话。' },

    decision: {
      planWaiting: '有计划在等你',
      questionOf: (n, total) => `第 ${n} 个问题，共 ${total} 个`,
      nothingWaiting: '这里没有需要你处理的事情了。',
      openConversation: '打开对话',
      allowOnce: '这次允许',
      deny: '拒绝',
    },

    thread: {
      loading: '正在加载对话…',
      waitingPerm: '需要授权 - 请处理',
      waitingAsk: '有问题在等你 - 请回答',
      waitingPlan: '有计划在等你 - 请决定',
    },

    newSession: {
      title: '新建对话',
      asConfigured: '按已有配置',
      asConfiguredSub: '用那台机器上 Claude Code 的设置。',
      model: '模型',
      effort: '思考强度',
      mode: '模式',
      closedProject: '这个项目没打开 - IDE 会先打开它再开始。',
      start: '开始',
      opening: '正在打开项目…',
    },

    pairing: {
      title: '与 IDE 配对',
      fromCode: '正在和显示这个码的 IDE 配对。它现在正在请机器前的人确认。',
      how: '在 IDE 里打开面板菜单 → 远程访问 → 配对设备。用相机扫码，或者在下面手动输入。',
      fingerprintAsk: 'IDE 会显示一个指纹。只有在它显示为下面这串时才允许：',
      fingerprintNote: '接着 IDE 会请你确认并显示一个指纹。这个应用会显示同样的一串 - 只有对上了才允许。',
      waiting: '等待 IDE…',
      done: '已配对。',
      failed: '配对没有成功。',
      notACode: '这看起来不像配对码。',
      iphone: 'iPhone',
      ipad: 'iPad',
      android: 'Android 手机',
      browser: '浏览器',
    },

    composer: {
      commands: '命令',
      closeList: '关闭列表',
      usageLimits: '用量额度',
      removeImage: (name) => `移除：${name}`,
      say: '说点什么…',
      reconnecting: '重连中…',
      slash: '斜杠命令',
      attachPhoto: '添加照片',
      voice: '语音输入',
      voiceStop: '结束听写',
      stop: '停止这一回合',
      whatTravels: '你的 IDE 和这台手机之间会传些什么',
      projectFiles: '项目文件',
      ofTotal: (shown, total) => `${shown} / ${total}`,
      photosDropped: (n) => `还有 ${n} 张放不进同一条消息 - 先把这些发出去吧。`,
      photoTooBig: '这放不进一条消息。试试一次发一张。',
    },

    limits: {
      title: '额度与上下文',
      fiveHourWindow: '5 小时窗口',
      weeklyWindow: '每周窗口',
      paceNote: (percent) =>
        `暗色弧线是匀速线：按这个速度，本周到今天该用掉 ${percent}%。只要亮色弧线比它短，这周就没有超前。`,
      context: '这次对话的上下文',
      ofTotal: (used, total) => `${used} / ${total}`,
      spentToday: '今天已用',
      acrossProjects: '所有项目合计',
      noWindows: 'IDE 还没有报告订阅的用量窗口。',
      extraUsage: '额外计费',
      extraUsed: (window) => `${window ? `${window}额度` : '额度'}已用尽，之后的工作在套餐之外计费`,
      resetUnknown: '重置时间还不清楚',
      resetsIn: (left) => `${left} 后重置`,
    },
  },

  status: {
    todayTokens: '今天所有项目消耗的 token',
    openPr: '在浏览器中打开 pull request',
    noPr: '无 PR',
    effortHint: (effort) => `思考强度：${effort}`,
    modelHint: (model) => `模型：${model}`,
    modelHintSwitched: (model, from) => `模型：${model} - Claude Code 自己从 ${from} 切了过来`,
    modeHint: (mode) => `权限模式：${mode}`,
    sessionLimit: '5 小时额度',
    weekLimit: '每周额度',
    windowUsed: (title, percent) => `${title}：已用 ${percent}%`,
    resetsIn: (left) => `${left} 后重置`,
    paceBudget: (percent) => `暗色圆环：${percent}%，按匀速计算今天该用到的量`,
    extraUsage: (limit) => `额外计费：${limit}已用尽，之后的工作在套餐之外单独计费`,
    extraSpent: (percent) => `本月额外计费额度已用 ${percent}%`,
    limitNamed: (window) => `${window}额度`,
    limitUnnamed: '额度',
  },

  limits: {
    fiveHour: '5 小时',
    weekly: '每周',
    weeklyOpus: '每周 Opus',
    weeklySonnet: '每周 Sonnet',
    weeklyApps: '每周应用',
    weeklyWithExtra: '每周（含额外计费）',
    extra: '额外计费',
  },

  permission: {
    label: '授权',
    decisions: { once: '这次允许', always: '总是允许', deny: '拒绝' },
    underMode: (mode) => `${mode}模式`,
  },

  selectors: {
    model: '模型',
    effort: '思考强度',
    mode: '模式',
    modeHint: 'shift+tab',
  },

  commands: {
    resume: '打开本项目过去的一次对话',
    fork: '在新标签页里继续这个对话',
    login: '在 IDE 终端里登录 Claude Code',
    logout: '退出登录 - 会打开 IDE 终端',
    model: '切换本次会话使用的模型',
    effort: '设置 Claude 动手前思考多久',
    context: '当前上下文窗口里装了什么',
    cost: '本次会话的花费和用量窗口',
    usage: '订阅的用量窗口，以及什么时候重置',
    codeReview: '审查一个 pull request',
  },
}
