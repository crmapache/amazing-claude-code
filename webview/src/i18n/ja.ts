import type { Dict } from './en'

/**
 * 日本語。英語辞書（en.ts）の翻訳であり、別の文章ではありません。
 *
 * 見出しや行ラベルは体言止め、説明文は「です・ます」で統一しています。製品名（Claude Code、MCP、
 * Opus、Sonnet、Haiku、Git、PR）と CLI のツール名は訳しません。原文のダッシュは前後に空白を置いた
 * ハイフンで、ここでも同じにしています。
 *
 * 「plan」は計画機能のことなので「計画」と訳します。「プラン」は料金プランと紛らわしいためです。
 */
export const ja: Dict = {
  common: {
    back: '戻る',
    close: '閉じる',
    closeMenu: 'メニューを閉じる',
    loading: '読み込み中…',
    muted: 'ミュート',
    countOn: (n) => `${n} 件オン`,
  },

  menu: {
    titles: {
      menu: { title: 'メニュー', hint: 'パネルが普段しまってあるもの' },
      history: { title: '履歴', hint: 'このプロジェクトの過去の会話' },
      mcp: { title: 'MCP サーバー', hint: '状態 · サインイン · 再接続' },
      plugins: { title: 'プラグイン', hint: 'インストール済み · 一覧 · マーケットプレイス' },
      settings: { title: '設定', hint: 'パネルの動きと音' },
      sounds: { title: '通知音', hint: 'パネルがあなたを呼ぶとき' },
      remote: { title: 'リモートアクセス', hint: '状態 · リレー · ペアリング済みの端末' },
      remoteAbout: { title: '外に出る情報', hint: 'オンにする前にお読みください' },
      defaultMode: { title: 'デフォルトのモード', hint: '新しいタブが始まるモード' },
      composerLayout: { title: '入力欄のレイアウト', hint: '入力欄を置く場所' },
      pasteCollapse: { title: '貼り付けたテキスト', hint: '貼り付けをチップにまとめる条件' },
      improvePrompt: { title: 'プロンプトの改善', hint: '星ボタンが出す指示' },
      voice: { title: '音声入力', hint: '打つかわりに話す' },
      voiceLanguage: { title: '話す言語', hint: '音声入力が聞き取る言語' },
      voiceDevice: { title: 'マイク', hint: 'どれで聞くか' },
      language: { title: '言語', hint: 'パネルが話す言語' },
      feedback: { title: 'フィードバック', hint: '不具合、アイデア、ひとことでも' },
      feedbackLog: { title: '添付される内容', hint: '送る前のレポート全文' },
    },

    groups: {
      project: 'このプロジェクト',
      devices: '端末',
      plugin: 'プラグイン本体',
      author: '作者から',
    },

    rows: {
      history: { label: '履歴', sub: 'このプロジェクトの過去の会話' },
      statistics: { label: '統計', sub: '時間、習慣、実績' },
      mcp: { label: 'MCP サーバー', sub: '状態、サインイン、再接続' },
      plugins: { label: 'プラグイン', sub: 'インストール済み、一覧、マーケットプレイス' },
      remote: { label: 'リモートアクセス', sub: '状態、リレー、ペアリング済みの端末' },
      settings: { label: '設定', sub: '通知音、モード、レイアウト、言語' },
      feedback: { label: 'フィードバックを送る', sub: '不具合、アイデア、ひとことでも' },
    },

    author: {
      title: '面接を控えていますか？',
      body: 'そのための AI アシスタントを作りました。無料で試せます - 応援にもなります。ありがとう',
      tagline: 'リアルタイム面接コパイロット',
    },

    footer: 'Amazing Claude Code GUI',
  },

  settings: {
    rows: {
      sounds: { label: '通知音', sub: 'パネルがあなたを呼ぶとき' },
      defaultMode: { label: 'デフォルトのモード', sub: '新しいタブが始まるモード' },
      composerLayout: { label: '入力欄のレイアウト', sub: '入力欄を置く場所' },
      pasteCollapse: { label: '貼り付けたテキスト', sub: '貼り付けをチップにまとめる条件' },
      improvePrompt: { label: 'プロンプトの改善', sub: '星ボタンが出す指示' },
      voice: { label: '音声入力', sub: '自分の Deepgram キーで口述する' },
      language: { label: '言語', sub: 'パネルが話す言語' },
    },

    improveSummary: { builtIn: '標準', custom: 'カスタム' },
  },

  language: {
    note: 'ここで変わるのはパネルだけです。Claude がどの言語で答えるかは Claude Code 自体の設定で、ターミナルと共通のものです。ここからは触りません。',
    followIde: '自動',
    followIdeSub: (language) => `IDE に合わせる - 現在は${language}`,
    followIdeUnknown: 'IDE に合わせる',
  },

  sounds: {
    turnFinished: { label: 'ターン終了', hint: 'Claude が答え終わって待っています' },
    permission: { label: '権限の確認', hint: 'ツールの実行にあなたの承認が要ります' },
    question: { label: '質問', hint: 'Claude が答えを選ぶよう求めています' },
    plan: { label: '計画ができた', hint: '計画があなたの承認を待っています' },
    rateLimit: { label: '上限に到達', hint: 'サブスクリプションの上限でターンが止まりました' },
    extraUsage: {
      label: '追加利用の開始',
      hint: 'プランを使い切りました - ここからの作業は別途課金されます',
    },
    trouble: { label: '何かが壊れた', hint: 'エラー、プロセスの停止、またはサインアウト' },
    play: '再生',
    playNamed: (sound) => `再生：${sound}`,
    volumeOf: (sound) => `音量：${sound}`,
  },

  history: {
    empty: 'このプロジェクトにはまだ過去の会話がありません。',
    today: '今日',
    earlier: 'それ以前',
    messages: (n) => `${n} 件のメッセージ`,
  },

  composerLayout: {
    bottom: '標準',
    compact: 'コンパクト',
    left: '左',
    right: '右',
  },

  pasteCollapse: {
    note: '複数行の貼り付けは、大量のテキストが入力欄を埋めないようにチップへまとめられます。どちらでも内容は失われません - チップは全文をそのまま保持し、付いている鉛筆ボタンで入力欄に戻せます。',
    never: 'まとめない',
    neverSub: '貼り付けたものはそのまま入力欄のテキストとして残ります',
    from: (lines) => `${lines} 行から`,
    foldLabel: '長い貼り付けをまとめる',
    foldSub: (min, max) => `何行からまとめるか - ${min}〜${max}`,
  },

  improvePrompt: {
    note: 'クリップの隣にある星ボタンは、入力欄の文章を書き直します。ここに書かれているのがその指示です。下書きと一緒に Claude Code の独立した実行へ送られ - ツールもファイルも会話もなし - ほかのメッセージと同じように利用量に数えられます。',
    label: '指示',
    emptyMeans: '空欄なら、上に灰色で見えている初期状態の指示が使われます。',
    builtInLanguage:
      '英語なのは、インターフェースではなくモデルへの指示だからです。その中で下書きと同じ言語で返すよう求めています。自分の指示は好きな言語で書けます。',
    editBuiltIn: '組み込みの文章を編集',
    backToBuiltIn: '組み込みの文章に戻す',
  },

  voice: {
    note: 'キーを押したまま話すと、言葉がそのまま入力欄に入ります。動かしているのはあなた自身の Deepgram キーで、音声は Deepgram だけに送られます。プラグインは間にサーバーを持ちません。',
    off: 'オフ',
    enable: '音声入力',
    enableHint: 'マイクのボタンを表示し、下のホットキーを待ち受けます。',

    key: 'DEEPGRAM API キー',
    keyPlaceholder: 'キーを貼り付け',
    keySet: (tail: string): string => `キーを保存しました。末尾は ${tail}`,
    keySave: '保存',
    keyForget: 'このキーを忘れる',

    balanceLeft: (amount: string): string => `残高は ${amount}`,
    balanceChecking: 'Deepgram に問い合わせ中…',
    balanceNoKey: 'まだキーがありません。',
    balanceNoAccess: 'キーは有効です。残高を見るには Owner か Admin のロールを持つキーが必要です。',
    balanceRejected: 'Deepgram はこのキーを認識しません。',
    balanceFailed: 'Deepgram に届きませんでした。ネットワークを確認してもう一度お試しください。',
    balanceRefresh: '更新',

    getKey: 'キーはまだですか？',
    getKeyHint: 'deepgram.com で登録し、API キーを作ってください。新規アカウントにはカード不要で 200 ドル分が付きます。いまの料金なら数百時間の口述に相当します。',
    openSite: 'deepgram.com を開く',

    hotkeys: 'ホットキー',
    hotkeysHint: 'キーボードが IDE にある間だけ効きます - エディタでも、パネルでも、ダイアログでも。ほかのアプリでは効きません。',
    push: '押している間だけ話す',
    pushHint: '押している間だけ録り、離すと止まります。',
    hold: '両手を空けて',
    holdHint: '一度押すと始まり、もう一度押すと終わります。',
    keyboard: 'キー',
    mouse: 'マウス',
    record: '設定',
    recording: 'キーを押してください…',
    recordingMouse: 'ボタンを押してください…',
    notSet: '未設定',
    clear: '解除',
    sideLeft: '左',
    sideRight: '右',
    badButton: '使えるのはマウスのサイドボタンだけです。主要な三つは IDE のあちこちですでに意味を持っています。',
    modifierTip: 'ここは修飾キー単独が向いています。右 Option か右 Ctrl を押しっぱなしにすれば、IDE の中で取り合いになりません。',

    language: '話す言語',
    languageHint: '音声入力が聞き取る言語',
    searchLanguages: '言語を検索…',
    multiHint: '多言語モードは文の途中の言語の切り替えについていきます。ただし言語を指定した場合と比べると、どちらの場面でも成績は落ちます。ひとつの文で本当に二言語を混ぜるときだけ選んでください。',

    device: 'マイク',
    deviceHint: 'どれで聞くか',
    deviceDefault: 'システムの既定',
    deviceDefaultHint: 'システムの設定にそのまま従います',
    deviceNote: '変更は次の音声入力から有効になります。',

    errorNoKey: 'まず Deepgram のキーを追加してください - 設定、そして音声入力。',
    errorNoKeyRemote: 'この会話が動いているマシンに Deepgram のキーがありません。向こうの設定の音声入力で追加してください。',
    errorOff: 'この会話が動いているマシンでは音声入力がオフです。向こうの設定でオンにしてください。',
    errorMicrophone: 'マイクを開けませんでした。ほかのアプリが使っているかもしれません。',
    errorKey: 'Deepgram がキーを受け付けませんでした。音声入力の画面で確認してください。',
    errorNetwork: 'Deepgram に届きませんでした。ネットワークを確認してもう一度お試しください。',
    errorGeneral: '音声入力が止まりました。もう一度お試しください。',
  },

  modes: {
    manual: {
      label: '毎回確認する',
      sub: '読み取りは自由に行い、書き込みとコマンドの前に必ず確認します。',
      short: '確認',
    },
    acceptEdits: {
      label: '編集を自動で許可',
      sub: '作業ディレクトリ内のファイル編集は自動で許可します。シェルは引き続き確認します。',
      short: '編集可',
    },
    plan: {
      label: '計画',
      sub: '調べたうえで計画を出します。承認するまで何も触りません。',
      short: '計画',
    },
    auto: {
      label: '自動',
      sub: '確認なし - 危険な操作は分類器が一つずつ判定します。すべてのモデルで使えるわけではありません。',
      short: '自動',
    },
    dontAsk: {
      label: '確認しない',
      sub: '一切確認せず、事前に許可されていないものはすべて拒否します。無人実行向けです。',
      short: '無確認',
    },
    bypassPermissions: {
      label: '権限確認を飛ばす',
      sub: 'ほぼすべての確認を飛ばします。危険な削除だけは確認します。コンテナと使い捨ての VM でのみ使ってください。',
      short: '飛ばす',
    },
    tags: {
      default: '標準',
      readOnly: '読み取り専用',
      preview: 'プレビュー',
      settings: '設定',
      danger: '危険',
    },
  },

  effort: {
    auto: { sub: 'このセッションでのモデル標準の思考の深さに戻します。' },
    ultracode: { sub: 'xhigh の推論に加え、必要なときは複数エージェントの処理を自動で使います。' },
    max: { sub: '持てるすべてを使います。設計と厄介なバグ向け。' },
    xhigh: { sub: 'さらに深く。多数のファイルにまたがる変更向け。' },
    high: { sub: '動く前に長く考えます。複数ファイルの変更向け。' },
    medium: { sub: 'ちょうど中間。機能開発の既定値として手頃です。' },
    low: { sub: 'ほとんど考えません。機械的な修正と手早い返答向け。' },
    tags: { ultra: 'ultra', slow: '低速', default: '標準' },
  },

  models: {
    default: { label: '標準（おすすめ）', sub: 'このセッションが始まったときのモデルを使います。' },
    opus: { sub: 'Opus 5 · 日常から複雑な作業まで一番の選択' },
    opus1m: {
      label: 'Opus（100万コンテキスト）',
      sub: 'Opus 5、100万コンテキスト · 大きなコードベースでの長いセッション向け',
    },
    sonnet: { sub: 'Sonnet 5 · 定型作業を効率よく' },
    sonnet1m: {
      label: 'Sonnet（100万コンテキスト）',
      sub: 'Sonnet 5、100万コンテキスト · 大きなコードベースでの長いセッション向け',
    },
    haiku: { sub: 'Haiku 4.5 · 短い返答なら最速' },
    opusplan: { label: 'Opus 計画モード', sub: '計画モードは Opus、それ以外は Sonnet' },
    unavailable: '利用できません',
    /** The line under a model the agent moved to by itself - see modelMenu. */
    switchedItself: 'Claude Code が自分でこのモデルに切り替えました。',
  },

  composer: {
    placeholder: '質問するか、変えたいことを書いてください…',
    placeholderPlan: '何を計画するか書いてください…',
    attach: 'ファイルやフォルダーを添付',
    slash: 'スラッシュコマンド',
    improve: 'プロンプトを改善',
    improveAgain: 'あなたが書いた文章から、もう一度',
    restore: '自分の文章に戻す',
    stop: '停止',
    forceStop: '応答なし · 強制停止',
    forceStopHint: 'Claude が停止を確認していません',
    queue: '順番待ちに入れる',
    queueHint: 'いまのターンが終わったら送ります',
    send: '送信',
    run: '実行',
    runHint: 'あなたのシェルで実行します - Claude は次のメッセージで出力を見ます',
    improveEmpty: 'Claude Code から何も返ってこなかったので、入力欄に入れるものがありません。',
    improveChanged: '書き直しの間に下書きが変わったので、そのままにしました。',
    improveTerminal: 'ターミナルのコマンドは書き直しません',
    voice: '音声入力',
    voiceStop: '音声入力を終える',
  },

  header: {
    idle: '待機中',
    running: 'Claude が作業中',
    done: 'ターン終了',
    attention: 'あなた待ち',
    crashed: 'セッションが予期せず終了しました',
    statistics: '統計',
    closeStatistics: '統計を閉じる',
    conversations: '会話',
    newSession: '新しい会話',
    menu: 'メニュー',
    watchers: (n) => `ほかに ${n} 件がこのプロジェクトを見ています`,
  },

  thanks: {
    button: '気に入りましたか？ お礼を伝える',
    title: 'お礼を伝える',
    star: 'GitHub でスターをつける',
    starSub: 'ほかの人がこのプラグインを見つけやすくなります',
    rate: 'プラグインのページで評価する',
    rateSub: 'JetBrains Marketplace にレビューを書く',
    share: '友達に教える',
    shareSub: '紹介の一文とリンクをコピーします',
    shareCopied: 'コピーしました - 好きなところに貼ってください',
    shareText:
      'Amazing Claude Code GUI、いいですよ - JetBrains の IDE の中に、Claude Code をちゃんとしたパネルとして置けます：https://plugins.jetbrains.com/plugin/33255-amazing-claude-code',
  },

  login: {
    checking: 'Claude Code を探しています…',
    notFound: 'Claude Code が見つかりません',
    notFoundText:
      'パネルは claude コマンドを通して動きます。インストール済みなら場所を指定してください - IDE から見える PATH は、ターミナルのものと同じとは限りません。',
    useThis: 'これを使う',
    whereLooked: 'パネルが探した場所',
    checkAgain: 'もう一度確認',
    signIn: 'Claude Code にサインイン',
    signInText:
      'サインインは IDE のターミナルで一度だけです。Claude がブラウザーを開いて、あなたが戻るのを待ちます。パネルはそれを自分で受け取ります。',
    logIn: 'サインイン',
    openTerminalAgain: 'ターミナルをもう一度開く',
    finishInTerminal: 'ターミナルでサインインを終えてください - この画面は自動で閉じます。',
  },

  stream: {
    waitingForYou: 'あなた待ち',
    waitingForSubagent: 'サブエージェント待ち',
    waitingForSubagents: (n) => `サブエージェント ${n} 件待ち`,
    thinking: 'Claude が考えています',
    retryWaiting: (label, waited) => `${label} · ${waited} 待機中`,
    withElapsed: (label, elapsed) => `${label} · ${elapsed}`,
  },

  agentTask: {
    failedBeforeFinishing: '終わる前に失敗しました。',
    stoppedBeforeFinishing: '終わる前に停止しました。',
    backgroundEnded: (outcome, duration) =>
      duration ? `バックグラウンドのコマンドが${outcome}（${duration}）。` : `バックグラウンドのコマンドが${outcome}。`,
    outcomeFailed: '失敗しました',
    outcomeStopped: '停止しました',
    outcomeFinished: '終了しました',
    trimmed: (n) => `…前の ${n} ステップを省略しました`,
  },

  feed: {
    empty: { title: 'このプロジェクトについて Claude に聞く', hint: '@ でファイル · / でコマンド' },
    you: 'あなた',
    jumpToLatest: '最新へ移動',
    copyBlock: 'このブロックをコピー',
    copyReply: '返信全体をコピー',
    pastedLines: (n) => `${n} 行を貼り付け`,
    pasteClose: '折りたたむ',
    copyPaste: '貼り付けたテキストをコピー',
    pasteShown: (shown, total) => `全 ${total} 行のうち最初の ${shown} 行 · コピーはすべて`,
    fromOutput: '出力から',

    think: { chip: '思考', thoughts: (n) => `${n} 件の考え` },

    workflow: {
      agents: (n) => `エージェント ${n} 体`,
      running: (n) => `${n} 実行中`,
      done: (n) => `${n} 完了`,
      failed: (n) => `${n} 失敗`,
      queued: '待機中',
      skipped: 'スキップ',
      attempt: (n) => `${n} 回目`,
      cached: 'ジャーナルから',
    },

    tool: {
      running: '· 実行中',
      waitingForYou: '· あなた待ち',
      failed: '· 失敗',
      lines: (n) => `· ${n} 行`,
      matches: (n) => (n > 0 ? `· ${n} 件一致` : '· 一致なし'),
      output: (empty) => (empty ? '· 出力なし' : '· 出力あり'),
      diff: (added, removed) => `· +${added} −${removed}`,
      moreLines: (n) => `… 他 ${n} 行`,
      fewerLines: '… 折りたたむ',
      count: (n) => `ツール ${n} 件`,
      closed: {
        replay: '保存された会話には、この呼び出しの結果がありません。',
        exited: 'これが終わる前に Claude Code が応答しなくなりました。',
        stopped: '終わる前に停止しました。',
        turnEnded: 'この呼び出しより先にターンが終わりました。',
        untracked: 'バックグラウンドでまだ動いています - パネルはもう追いかけません。',
      },
      closedMeta: {
        replay: '· 記録になし',
        exited: '· 中断',
        stopped: '· 中断',
        turnEnded: '· 未完了',
        untracked: '· 追跡終了',
      },
    },

    /** The counter under a subagent's own log while it runs. */
      agentWorking: (duration) => `作業中 · ${duration}`,
    task: {
      /** The heading over a subagent's errand inside its card in the feed (see TaskCard). */
      errand: '依頼した内容',
      closed: {
        replay: 'どう終わったかは保存された会話に残っていません。',
        exited: '結果が返る前にセッションが終わりました。',
        stopped: '結果が返る前に停止しました。',
        turnEnded: '結果が返る前にターンが終わりました。',
        untracked: 'まだ動いています - パネルはもう追いかけません。',
      },
    },

    bash: { running: '実行中', noOutput: '出力なし' },

    checkpoint: {
      cleared: '会話をクリアしました - これより上は覚えていません',
      earlier: '以前のメッセージ',
      notKept: '以前のメッセージはもう保存されていません',
      notOnPhone: '以前のメッセージはスマートフォンには送られません',
      loadEarlier: '以前のメッセージを読み込む',
    },

    compact: {
      label: 'コンテキスト',
      running: '会話を圧縮しています…',
      done: (manual) => `コンテキストを${manual ? '手動で' : '自動で'}圧縮しました`,
      doneWith: (manual, before, after, took) =>
        `${manual ? '手動で' : '自動で'} ${before} のコンテキストを${after ? ` ${after} の要約` : '要約'}に圧縮${took ? `（${took}）` : ''}`,
    },

    retry: {
      label: '再試行',
      reason: {
        rateLimited: 'リクエストが多すぎます',
        overloaded: 'API が混み合っています',
        auth: '認証に失敗しました',
        error: 'API エラー',
      },
      attempt: (n) => `${n} 回目`,
      attemptOf: (n, max) => `${n}/${max} 回目`,
      retryingIn: (seconds) => `${seconds} 秒後に再試行`,
      retrying: '再試行中…',
      recovered: (attempts) => `${attempts} 回目で通りました`,
      failed: (attempts) => `${attempts} 回試して諦めました`,
      stopped: (attempts) => `${attempts} 回目で停止しました`,
    },

    result: {
      worked: (duration) => (duration ? `作業時間 ${duration}` : '完了'),
      stopped: (duration) => (duration ? `あなたが停止 · ${duration}` : 'あなたが停止'),
    },

    modelSwitch: { label: 'モデル', note: '切り替えたのは Claude Code で、あなたではありません' },

    crash: {
      label: 'セッション',
      text: 'Claude Code が予期せず終了しました。',
      textWithCode: (code) => `Claude Code が予期せず終了しました（終了コード ${code}）。`,
    },

    limit: {
      label: '上限',
      extraLabel: '追加利用',
      extra: (window) => `${window ? `${window}の上限` : '利用の上限'}を使い切りました - 作業は追加利用として続き、プランとは別に課金されます`,
      waiting: (window) => `${window ? `${window}の上限` : '利用の上限'}を使い切りました - リセットを待っています`,
      resetAt: (clock, left) => `${clock} · ${left} 後`,
    },

    plan: {
      label: '計画ができました',
      steps: (n) => `· ${n} ステップ`,
      approve: '承認して実行',
      keepPlanning: '計画を続ける',
      withdrawn: 'エージェントは決定を待つのをやめました',
    },

    ask: {
      label: 'CLAUDE からの質問',
      blocks: (n) => `${n} 件の質問 · ここで止まっています`,
      pickAny: '複数選べます',
      other: 'その他',
      ownAnswer: '自分で答えを書く…',
      send: '回答を送る',
      pickToContinue: '選ぶと続きます',
      note: '聞いたところからそのまま続きます',
      expand: '質問を開く',
      collapse: '質問を閉じる',
      dismiss: '質問を片づける',
      dismissHint: '片づけて自分の言葉で答える',
    },

    findings: {
      label: 'レビュー',
      fixed: '修正済み',
      skipped: '見送り',
      noChange: '変更不要',
      unconfirmed: '未確認',
    },

    copy: { copied: 'コピーしました', click: 'クリックでコピー', openFile: 'エディタで開く' },
  },

  chrome: {
    tasks: {
      label: 'タスク',
      listLabel: 'タスク一覧',
      progress: (done, total) => `${done} / ${total} 完了`,
      collapse: 'タスク一覧を閉じる',
      expand: '残りのタスクを表示',
    },
    queue: {
      label: '待機中',
      hint: (n) => `${n} 件がこのターンの後に順番に送られます · ドラッグで並べ替え`,
    },
    selection: { quote: '引用', fork: 'ここから分岐' },
    streams: {
      main: 'メイン',
      background: '背後',
      stopAgent: 'このエージェントを止める',
      stopAgentNamed: (name) => `停止：${name}`,
      stopAgentTitle: 'このエージェントを止めますか？',
      stopCommand: 'このコマンドを止める',
      stopCommandTitle: 'このコマンドを止めますか？',
    },
    confirm: { cancel: 'キャンセル', stop: '停止', open: '開く' },
    resume: { title: 'このタブはまだ作業中です。ここに過去の会話を開きますか？' },
    noChats: { title: '開いている会話はありません', button: '新しい会話' },
    crash: {
      title: 'パネルでエラーが起きました',
      text: '再読み込みしても安全です。会話はパネルの裏側にある Claude Code のプロセスにあり、パネルより長生きします。',
      button: 'パネルを再読み込み',
    },
  },

  remote: {
    codeLabel: 'ペアリングコード',
    states: {
      idle: { label: 'オフ', hint: 'この IDE には外から届きません。' },
      connecting: { label: '接続中…', hint: 'リレーへの最初の接続です。' },
      connected: { label: '接続済み', hint: 'ペアリング済みの端末からこのプロジェクトが見えます。' },
      reconnecting: {
        label: '再接続中…',
        hint: '回線が切れました。よくあることで、自然に戻ります。',
      },
      unreachable: {
        label: 'リレーに届きません',
        hint: 'リレーが応答しません。作業には影響せず、影響するのは端末側だけです。',
      },
      refused: {
        label: '拒否されました',
        hint: 'リレーがこのプラグインを受け付けませんでした。古すぎるか、このアドレスを別の IDE が使っている可能性があります。',
      },
    },
    agent: (id) => `エージェント ${id}`,
    thisIde: 'この IDE',
    relay: 'リレー',
    device: '端末',
    allow: 'この IDE に外から届くのを許可する',
    allowHint: 'あなたがオンにするまではオフ、オフに戻せばその瞬間にオフです。',
    relayAddress: 'リレーのアドレス',
    noSafe:
      'この IDE はパスワードを覚えない設定なので、ペアリングは再起動をまたげません。残したい場合は IDE のパスワード保管庫を有効にしてください。',
    wantsToPair: (device) => `${device} がペアリングを求めています`,
    checkFingerprint: '端末が名乗っている名前です - 下のフィンガープリントが端末の画面と一致するか確かめてください。',
    allowDevice: '許可',
    refuse: '拒否',
    scanThis: 'これを端末で読み取ってください',
    codeNote: (left) =>
      `${left} · 一度きり有効です。秘密はアドレスの「#」より後ろにあり、その部分をブラウザーがサーバーに送ることはありません。`,
    minutesLeft: (minutes) => `残り ${minutes} 分`,
    secondsLeft: (seconds) => `残り ${seconds} 秒`,
    stopOffering: '提示をやめる',
    pairDevice: '端末をペアリング',
    pairedDevices: 'ペアリング済みの端末',
    revoke: '解除',
    whatTravels: '外に出る情報と、端末にできること',
    whatTravelsSub: 'オンにする前にお読みください',
    fingerprint: 'この IDE のフィンガープリント',
    about: {
      first:
        'オンにすると、ペアリングした端末が読んで返事できるように、会話がリレーを通ります。エージェントが読み書きするもの - ソースコード、ファイルパス、コマンドの出力 - も含まれます。',
      second:
        'リレーはその中身を読めません。内容はこの IDE と端末の間で封じられています。見えるのは、あなたが接続している時間帯とどれだけ流れたか、つまりおおよその稼働時間だけです。自分でリレーを立てることもできます。',
      can: 'ペアリングした端末は、権限に答え、メッセージを送り、ターンを止められます。',
      cannot:
        'シェルコマンドの実行、プラグインの導入、権限モードの変更、このマシンのクリップボードへのアクセスはできません。',
      third:
        'ペアリングは、この画面に一度だけ表示されるコードで証明します。二つのフィンガープリントを見比べることで、コードだけでは防げないこと - 画面を撮影して先に読み取った人 - を防げます。',
    },
  },

  feedback: {
    button: '不具合を報告する、またはアイデアを送る',
    kinds: {
      bug: { label: '不具合', placeholder: '何が起きて、本来はどうなると思っていましたか？' },
      idea: { label: 'アイデア', placeholder: 'パネルに何ができるとよいですか？' },
      hello: { label: 'ひとこと', placeholder: '何でもどうぞ - 届くのは人であって、受付の列ではありません。' },
    },
    email: 'メール',
    emailOptional: '任意',
    attachments: '添付',
    addFiles: 'ファイルを追加',
    removeFile: (name) => `外す：${name}`,
    attachTotal: (count, max, size, budget) => `${count}／${max} · ${size}／${budget}`,
    logs: 'デバッグログを添付',
    logsFromTab: (tab) => `タブ ${tab} から - `,
    logsFromOpenTab: 'いま開いているタブから：',
    logsWhat:
      'バージョン、所要時間、うまくいかなかったこと。会話の中身も、ファイル名も、パスも入りません - 送る前に全文を読めます。',
    logsOnlyBug: '不具合のときだけです。レポートは何かが壊れた記録であり、ここには書くことがありません。',
    seeWhat: '添付される内容をそのまま見る',
    send: '送信',
    sending: '送信中…',
    sentPartly: (note) => `送信しましたが、すべてではありません。${note}`,
    sent: '送信しました。ありがとうございます ❤️ - 直接わたしに届きます。',
    notSent: '送信できませんでした。失われたものはありません - もう一度お試しください。',
    reportNote: (tab) =>
      `これが添付の全文です${tab ? `（タブ ${tab}）` : ''}。あなたの IDE の中で、プラグイン自身が見たものから組み立てられます：バージョン、その会話の形、失敗したことすべて。ファイル名は短いハッシュで出るので、同じファイルは同じものとして読めますが、どのファイルかは分かりません。`,
    building: '組み立て中…',
    copy: 'コピー',
    problems: {
      empty: 'まず何か書いてください。',
      tooLong: (max) => `${max} 文字を超えています。`,
      tooMany: (max) => `ファイルは ${max} 個までです。`,
      tooHeavy: (budget) => `ファイルの合計が ${budget} を超えています。`,
    },
  },

  mcp: {
    empty: 'MCP サーバーは設定されていません。',
    addServer: 'サーバーを追加',
    namePlaceholder: '名前',
    commandPlaceholder: 'コマンド、または sse/http の URL',
    refreshAll: 'すべて再読み込み',
    refreshing: '再読み込み中…',
    add: '追加',
    adding: '追加中…',
    authenticate: 'サインイン',
    opening: '開いています…',
    reconnect: '再接続',
    retry: 'もう一度',
    reconnecting: '再接続中…',
    remove: '削除',
    removing: '削除中…',
    status: { connected: '接続済み', needsAuth: 'サインインが必要', failed: '失敗', pending: '接続中…', disabled: '無効' },
  },

  plugins: {
    tabInstalled: 'インストール済み',
    tabBrowse: '一覧',
    tabMarkets: 'マーケット',
    emptyInstalled: 'プラグインは入っていません。',
    searchPlaceholder: '名前や説明でプラグインを検索…',
    noMarketplaces: 'マーケットプレイスがつながっていません。',
    noMatches: '該当なし。',
    emptyMarketplaces: 'マーケットプレイスは設定されていません。',
    addMarketplace: 'マーケットプレイスを追加',
    marketplacePlaceholder: 'URL、パス、または GitHub の owner/repo',
    refresh: '再読み込み',
    refreshing: '再読み込み中…',
    install: 'インストール',
    installing: 'インストール中…',
    uninstall: 'アンインストール',
    uninstalling: 'アンインストール中…',
    enable: '有効にする',
    enabling: '有効にしています…',
    disable: '無効にする',
    disabling: '無効にしています…',
    add: '追加',
    adding: '追加中…',
    remove: '削除',
    removing: '削除中…',
  },

  mobile: {
    pair: 'ペアリング',
    removeFromQueue: '待機列から外す',
    newSessionTitle: '新しい会話',

    sessions: {
      nothingYet: 'まだ表示するものがありません。IDE でプロジェクトを開くか、別の IDE をペアリングしてください。',
      nonePaired: 'この端末にはまだ IDE がペアリングされていません。「ペアリング」から追加してください。',
      recentlyOpened: '最近開いたもの',
      projectClosed: 'いま IDE では開かれていません。',
      noConversations: 'まだ会話がありません。',
      hidden: (n) => `非表示 ${n} 件 · 表示する`,
      pastConversations: '過去の会話',
      newChat: '新しい会話',
      reach: {
        connecting: '接続中…',
        asleep: 'リレーには繋がっていますが、応答する IDE がありません。',
        elsewhere: '別のタブかインストール済みのアプリでも開いています - 接続はそちらが持っています。',
        reconnecting: '再接続中… 下のリストは古いかもしれません。',
        offline: 'リレーに届きません。失われるものはなく、接続は自然に戻ります。',
      },
      agent: {
        connecting: '接続中…',
        asleep: '応答なし',
        elsewhere: '別の場所で開いています',
        reconnecting: '再接続中…',
        offline: 'オフライン',
      },
    },

    history: { title: '履歴', empty: 'このプロジェクトにはまだ過去の会話がありません。' },

    decision: {
      planWaiting: '計画が待っています',
      questionOf: (n, total) => `質問 ${n}／${total}`,
      nothingWaiting: 'ここで待っているものはもうありません。',
      openConversation: '会話を開く',
      allowOnce: '今回だけ許可',
      deny: '拒否',
    },

    thread: {
      loading: '会話を読み込んでいます…',
      waitingPerm: '権限の確認が必要です - 答えてください',
      waitingAsk: '質問が待っています - 答えてください',
      waitingPlan: '計画が待っています - 決めてください',
    },

    newSession: {
      title: '新しい会話',
      asConfigured: '設定のまま',
      asConfiguredSub: 'そのマシンの Claude Code の設定に従います。',
      model: 'モデル',
      effort: '思考の深さ',
      mode: 'モード',
      closedProject: 'このプロジェクトは閉じています - 開始前に IDE が開きます。',
      start: '開始',
      opening: 'プロジェクトを開いています…',
    },

    pairing: {
      title: 'IDE とペアリング',
      fromCode: 'このコードを表示した IDE とペアリングしています。いまマシンの前の人に許可を求めています。',
      how: 'IDE でパネルのメニュー → リモートアクセス → デバイスをペアリング を開きます。カメラでコードを読み取るか、下に入力してください。',
      fingerprintAsk: 'IDE がフィンガープリントを表示します。次の文字列と一致するときだけ許可してください：',
      fingerprintNote: 'このあと IDE が確認を求め、フィンガープリントを表示します。このアプリも同じものを表示します - 一致したときだけ許可してください。',
      waiting: 'IDE を待っています…',
      done: 'ペアリングしました。',
      failed: 'ペアリングできませんでした。',
      notACode: 'ペアリングコードには見えません。',
      iphone: 'iPhone',
      ipad: 'iPad',
      android: 'Android スマートフォン',
      browser: 'ブラウザ',
    },

    composer: {
      commands: 'コマンド',
      closeList: '一覧を閉じる',
      usageLimits: '利用の上限',
      removeImage: (name) => `外す：${name}`,
      say: '何か書いてください…',
      reconnecting: '再接続中…',
      slash: 'スラッシュコマンド',
      attachPhoto: '写真を添付',
      voice: '音声入力',
      voiceStop: '音声入力を終える',
      stop: 'ターンを止める',
      whatTravels: 'あなたの IDE とこの端末の間を行き来するもの',
      projectFiles: 'プロジェクトのファイル',
      ofTotal: (shown, total) => `${shown}／${total}`,
      photosDropped: (n) => `あと ${n} 枚は 1 通に収まりません - まずこれらを送ってください。`,
      photoTooBig: '1 通には収まりません。写真は 1 枚ずつ試してください。',
    },

    limits: {
      title: '上限とコンテキスト',
      fiveHourWindow: '5時間のウィンドウ',
      weeklyWindow: '週のウィンドウ',
      paceNote: (percent) =>
        `淡い弧は一定ペースです。今日までなら週の ${percent}% までが「予定内」。明るい弧がそれより短いうちは計画どおりです。`,
      context: 'この会話のコンテキスト',
      ofTotal: (used, total) => `${used}／${total}`,
      spentToday: '今日の使用量',
      acrossProjects: '全プロジェクト合計',
      noWindows: 'IDE からサブスクリプションのウィンドウがまだ届いていません。',
      extraUsage: '追加利用',
      extraUsed: (window) => `${window ? `${window}の上限` : '上限'}を使い切りました。プランとは別に課金されます`,
      resetUnknown: 'リセット時刻はまだ不明',
      resetsIn: (left) => `${left} 後にリセット`,
    },
  },

  status: {
    todayTokens: '今日使ったトークン（全プロジェクト合計）',
    openPr: 'ブラウザで pull request を開く',
    noPr: 'PR なし',
    effortHint: (effort) => `思考の深さ：${effort}`,
    modelHint: (model) => `モデル: ${model}`,
    modelHintSwitched: (model, from) => `モデル: ${model} - Claude Code が ${from} から自分で切り替えました`,
    modeHint: (mode) => `権限モード：${mode}`,
    sessionLimit: '5時間の上限',
    weekLimit: '週の上限',
    windowUsed: (title, percent) => `${title}：${percent}% 使用`,
    resetsIn: (left) => `${left} 後にリセット`,
    paceBudget: (percent) => `淡いリング：一定ペースなら今日までに ${percent}%`,
    extraUsage: (limit) => `追加利用：${limit}を使い切りました。以降の作業はプランとは別に課金されます`,
    extraSpent: (percent) => `今月の追加利用のうち ${percent}% を使用`,
    limitNamed: (window) => `${window}の上限`,
    limitUnnamed: '上限',
  },

  limits: {
    fiveHour: '5時間',
    weekly: '週',
    weeklyOpus: '週の Opus',
    weeklySonnet: '週の Sonnet',
    weeklyApps: '週のアプリ',
    weeklyWithExtra: '週（追加利用を含む）',
    extra: '追加利用',
  },

  permission: {
    label: '権限',
    decisions: { once: '今回だけ許可', always: '常に許可', deny: '拒否' },
    underMode: (mode) => `${mode}モード`,
  },

  selectors: {
    model: 'モデル',
    effort: '思考の深さ',
    mode: 'モード',
    modeHint: 'shift+tab',
  },

  commands: {
    resume: 'このプロジェクトの過去の会話を開く',
    fork: 'この会話を新しいタブで続ける',
    login: 'IDE のターミナルで Claude Code にサインインする',
    logout: 'サインアウトする - IDE のターミナルが開きます',
    model: 'このセッションのモデルを切り替える',
    effort: 'Claude が動く前にどれだけ考えるかを決める',
    context: 'いまコンテキストウィンドウに入っているもの',
    cost: 'このセッションの費用と利用ウィンドウ',
    usage: 'サブスクリプションの利用ウィンドウとリセット時刻',
    codeReview: 'pull request をレビューする',
  },
}
