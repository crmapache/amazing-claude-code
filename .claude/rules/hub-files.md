---
paths:
  - "webview/src/App.tsx"
  - "webview/src/mobile/App.tsx"
  - "webview/src/mobile/feed.ts"
  - "webview/src/protocol.ts"
  - "webview/src/feed/build.ts"
  - "webview/src/feed/build.test.ts"
  - "webview/src/feed/types.ts"
  - "webview/src/feed/panelState.ts"
  - "webview/src/harness/player.ts"
  - "webview/src/components/feed.module.css"
  - "webview/src/components/shell.module.css"
  - "webview/src/components/holiday.module.css"
  - "webview/src/components/Feed.tsx"
  - "webview/src/components/Composer.tsx"
  - "webview/src/catalog.ts"
  - "webview/src/tokens.css"
  - "src/main/kotlin/io/github/crmapache/amazingclaudecode/claude/ClaudeSessionHub.kt"
  - "src/main/kotlin/io/github/crmapache/amazingclaudecode/claude/ClaudeSession.kt"
  - "src/main/kotlin/io/github/crmapache/amazingclaudecode/claude/ClaudeSessions.kt"
  - "src/main/kotlin/io/github/crmapache/amazingclaudecode/claude/ProjectCatalog.kt"
  - "src/main/kotlin/io/github/crmapache/amazingclaudecode/claude/SessionCommands.kt"
  - "src/main/kotlin/io/github/crmapache/amazingclaudecode/toolwindow/ClaudePanel.kt"
  - "src/main/kotlin/io/github/crmapache/amazingclaudecode/claude/ClaudeCli.kt"
  - "src/main/kotlin/io/github/crmapache/amazingclaudecode/claude/ClaudeLaunch.kt"
  - "src/main/kotlin/io/github/crmapache/amazingclaudecode/claude/ClaudePreferences.kt"
  - "src/main/kotlin/io/github/crmapache/amazingclaudecode/remote/RemoteCommands.kt"
  - "src/test/kotlin/io/github/crmapache/amazingclaudecode/claude/SessionFanOutTest.kt"
---

## Общие файлы: какая заметка за какой кусок

Эти файлы трогают почти все фичи, поэтому заметки на них целиком не подгружаются - иначе чтение
`App.tsx` снова тянуло бы в контекст половину всех правил. Вместо этого здесь указатель: правишь кусок
из списка - сначала прочитай заметку справа (`.claude/rules/<имя>.md`), если она ещё не подгрузилась
сама. Кусок, которого тут нет, - ищи его имя grep'ом по `.claude/rules/`: заметки называют код, о
котором говорят.

**`webview/src/App.tsx`** (и `mobile/App.tsx`, где заметка говорит «в обоих `App`»):
- `reuseMessage`, `intoField` - message-reuse
- `queueEdits`, `takeBackQueued`, `case 'queuedTaken'`, `before` в `intoTheQueue`, фокус в `startSession` - queue-edit
- `shareEditor`, `editorContext`, `editorSkips`, `withEditor` в `submit`, `case 'editorContext'` - editor-context
- `improveSources`, `restoreDraft`, `registerApply` - prompt-improver
- `feedPlaces`, `key={active}`, `forgetFeedFocus` - reading-place
- `hiddenTaskIds` - subagents
- `sendAnswers`, `dismissAsk` - permissions
- `latestTodo` (список задач из реплея не всплывает) - history
- выбор из истории, какую вкладку занять - history
- `branchFrom` / форк и шкала контекста форка - fork-tabs
- `fork(quote, point)`, `forkWhole`, `forkable`, разрез из выделения (`forkPointAfter`), `openOriginal` - fork-tabs
- `openRewind`, `confirmRewind`, `rewindOutcome`, `rewindInFork`, `rewinding`, `case 'rewindPreview'`/`'rewound'`, `uuid` в `submit` - rewind
- `startingModel`, `setCustomModels`, `stuckPick`, `onBorn` - models
- `jumping`, `resetSearch`, эффект над `sessions` - search
- `watchedRuns`, `scenariosView`, `scenariosShown`, `runRecords`, `case 'scenarioLog'` - scenarios
- `runLocal`, `designAsked` - accounts
- `settingSources`, `settingSourcesFacts`, `openSettingSources` - setting-sources
- `openLink` - side-menu
- `mcpLoading` - idle-sleep
- состояние формы обратной связи - feedback
- новогодние украшения - holiday
- экран без вкладок (`sessions.length === 0`, `Welcome`), `markPanelReady` на первый `auth` - welcome
- голосовая вставка в черновик - voice
- `hiddenIndicators`, `indicatorsSent`, `case 'indicators'`, `metersNode` - indicators
- `theme`, `setTheme`, `textSize`, `textSizeSent`, `case 'typography'`, `case 'theme'` - appearance
- `calls`/`setCalls`, свечение в `alert`, эффект с `callsStanding`, `activeCalling`, `case 'calledAway'` - tab-calls
- `draftsKnown`, `draftsSent`, `draftSaves`, `shellNamedTab`, `case 'drafts'`, `case 'activeTab'`, `restoreTabs` - restore-tabs
- `nameSession`, `case 'sessionTitle'`, `resumedTitle`/`searchHitTitleSource` при открытии из истории и поиска - tab-names
- `usageStats`, `answerUsageStats`, `UsageConsentCard` в `dockCards`, `stat` с `feature` в `openScreen`/`openMenu` - usage-stats
- `claudeConfig*` состояние, `openClaudeConfig`, `case 'claudeConfig'`, `config` в `runLocal` - claude-config
- хоткеи поверх панели, пока собирается иероглиф - composer-field
- `sideThreads`, `askAside`, `forgetSide`, `case 'sideAnswer'`/`'sideProgress'`, Esc над карточкой вопроса сбоку, `SideQuestionCard` в `dockCards` - btw
- только в `mobile/App.tsx`: `PhoneRewind`, `refills`, `RewindSheet` - rewind; `forkFrom`/`forkWhole` (`kind: 'branch'`, `before`) - fork-tabs;
  `openMachineScreen`, `openRepository`, `Door`/`from`, `edit.home`/`edit.origin` -
  remote-access и scenarios; `vividOf` - calm-colors; `case 'effort'` в `mobile/feed.ts` - models

**`webview/src/protocol.ts`**:
- любое новое сообщение - remote-access: реши про него в `RemoteCommands`, иначе красный `RemoteCommandsTest`
- `rejected` - prompt-improver; `'withdrawn'` - permissions; `PaintedTerm`, `matchCase`, `wholeWords` - search
- `mcpList` с `ifRunning` - idle-sleep; `cursor` в `replayFinished`, `historyPage` - history
- `effort`, `setCustomModels`, `customModels` - models; `setSendKey` - composer-field; `queue` - remote-access
- `models` у `usage`, `ModelUsageWindow`, `hiddenIndicators`, `setHiddenIndicators`, факт `indicators` - indicators
- `toolUseResult` у `AgentUserEvent`, `text` у `askAnswer` - permissions; `origin` у `AgentUserEvent` - history
- `settingSources` в `init`, `setSettingSources`, `askSettingSources`, `accountOutranked`, `api_error_status` - setting-sources
- `sideQuestion`, `sideQuestionCancel`, `sideAnswer`, `sideProgress` - btw
- `theme`, `setTheme`, `setTextSize`, размеры в `typography` - appearance
- `claudeConfig`, `askClaudeConfig`, `setClaudeConfig`, `ClaudeConfigSetting` - claude-config
- `activeTab`, `drafts`, `restoreTabs`, `saveDraft`, `tabShown`, `setRestoreTabs` - restore-tabs
- `takeQueued`, `queuedTaken`, `before` у `queuePrompt` - queue-edit
- `EditorRef`, `editorContext`, `shareEditor`, `setShareEditor`, `editor` у `prompt`/`queuePrompt`/`promptEcho` - editor-context
- `TitleSource` (`'user'`), `nameSession`, `titleSource` у `SearchHit` - tab-names
- `usageStats`, `usageStatsReport`, `setUsageStats`, `usageStatsPreview`, `stat` с `kind: 'feature'` - usage-stats
- `rewind`, `rewindPreview`, `rewindOutcome`, `rewound`, `RewindCode`, `RewindRefusal`, `uuid` у `prompt`/`promptEcho` - rewind;
  `before` у `newSession`, `ForkSeamEvent` (`fork_seam`) - fork-tabs

**`webview/src/feed/build.ts`** (редьюсер ленты):
- `TodoWrite`/`TaskCreate`/`TaskUpdate`, `tasksCarried`, `pendingTasks` - task-list
- `stintElapsed`, `stintOver`, `workGoesOn`, `pendingAgents`, подпись под ответом в `case 'result'` - turn-lifecycle
- контекст из реплея в `case 'result'`, `historyPage`, `windowModel`, `resumed`, `SERVICE_BLOCK`,
  `addReplayedPrompt` - history
- `taskPrompt`, ветка `Workflow`, `applyTaskProgress`, `ASYNC_AGENT_LAUNCHED` - subagents
- `modelContextWindow`, `case 'context'` - fork-tabs
- `noteStreamModel`, `ownSwap`/`ownSwapDue`, `stuckPick` - models
- `revivedAsk`, `addReplayedAnswers`, отметка `answered` у вопроса в `applyToolResults` - permissions
- `isEditTool` - tool-cards; `realModel` - stats; `uuid` у `UserItem`/`TextItem` - search
- `case 'outranked'` и `OutrankedItem`, `overSampling` и метки `addError` - setting-sources
- в состояние кладутся признаки, а не слова - i18n
- `editorOfBlocks` в `addReplayedPrompt`, `editor` у действия `prompt` - editor-context
- `applyRewound`, `case 'rewound'`, `uuid`/`steering` у действия `prompt` - rewind
- `case 'fork_seam'` (шов форка, `CheckpointItem.source`) - fork-tabs

**`webview/src/feed/types.ts`** и **`webview/src/feed/panelState.ts`**:
- `DraftEdit` - prompt-improver; `ErrorItem.signIn` - expired-sign-in; `ErrorItem.sampling` - setting-sources;
  `ModelStuckItem` - models
- `ClosedReason`, `ToolMeta`, `CompactOutcome`, `DetailNote`, `PermItem.mode`, `LimitItem.window`,
  `MetaItem.stats` («Stopped by you» не переводится) - i18n; `movedAccount` - accounts
- `CompactItem.startedAt`, `stintStartedAt`, `pausedMs` - turn-lifecycle; `TodoItem.replayed` - history
- `AskItem.historic`/`answered`/`reopened`, `PlanItem.historic` - permissions
- `PanelState.tasks`, `pendingTasks`, `tasksCarried` - task-list; `pins` - pins
- `earlierPages`, `oldestEventUuid`, `reachedStart` - history; `ownSwapDue`, `stuckPick` - models

**`webview/src/components/Feed.tsx`**: `holdPressed` - paste; `pinsHeight` - pins; поправка прокрутки на
`earlierPages` - history; `paint`, `PAINT_INTERVAL_MS`, `goToRow`, фокус находки - search;
`onCopy` - clipboard и markdown (формулы уносятся исходником).

**`webview/src/components/Composer.tsx`**: `keyQueues` - queue-edit; чип `editor` и шаг `editorName` в
`droppable` - editor-context; `registerApply`, `fillField` - prompt-improver; хвост диктовки
`data-voice` - voice; `ContextMeter` - composer-field, calm-colors и indicators (`bar`/`figure`); проп
`indicators` и пустые контейнеры на рельсе и в compact - indicators; сворачивание вставки - paste.

**`webview/src/components/feed.module.css`**: `.userActions` - message-reuse; `.taskLog` - subagents;
`.toolHead` и его распорка `::before` - tool-cards; `.pins`, `.pinOn`, `.textPinnable` - pins;
`.chipPasteCopy` - paste; `.rowLit` - search.

**Слои (z-index)**: лестница записана в `holiday.module.css`. Полка пинов 19, кнопка «вниз» 20, вуаль 21,
капсула поиска 22 - pins и search; чипы MODEL/EFFORT/MODE 41, окно поиска 44/45 - search; подтверждение
46/47 - accounts.

**`webview/src/tokens.css`**: `--acc-hit` и плотность `touch` - remote-access; `--acc-chip-*` - tool-cards;
шрифтовой стек CJK - i18n; ступени `--acc-gauge-*` - calm-colors; светлая тема, `--acc-scrim`/`--acc-drop`,
`color-scheme` - appearance; `--acc-group-deep`/`--acc-group-depth` - active-tab.

**`webview/src/catalog.ts`**: `panelCommands` (`/design-login`) - accounts.

**`webview/src/harness/player.ts`** (плеер играет роль IDE): `answerResume` и страницы истории - history;
`answerModel` (ответ обязан быть отложенным) и `setEffort` - models; переписывание - prompt-improver;
диктовка - voice; `savePastedFile`, `clipboardWrite`/`clipboardRead` - clipboard; `saveImage` - stats;
фидбэк - feedback; поиск - search; вход в аккаунт - expired-sign-in и accounts; транскрипт агента - subagents;
`answerFork` (история и шов нового форка) - fork-tabs.

**`ClaudeSessionHub.kt`** (сам по себе подгружает remote-access):
- `prompt`: сохранение буферов - editor-sync; `sendStatus`, очередь, команда в идущий ход - turn-lifecycle
- `takeQueued`, `before` у `queuePrompt`, `enqueue` - queue-edit; `editorSeen`, `echoWith`, `context` в
  `deliverPrompt` - editor-context
- `changeModel`, `emitLive` для усилия - models
- `INIT_MARKER` - fork-tabs и history; `RESULT_MARKER`, `everyHub`, `accounts`, `accountsChangedElsewhere` - accounts
- `settingSources` у `conversations`, `sendAccountOutranked` - setting-sources
- `resumeConversation`, сообщение `conversation` в `attach`/`resetJournal` - history
- `PROJECT_ORDER`, `broadcastProject` - remote-access и calm-colors; `indicators` в нём - indicators;
  `refreshCommandHints` - slash-hints
- `stats` - stats; круг сна простаивающих - idle-sleep; прогрев `ClaudeHome` - claude-home
- `restoreTabs`, `rememberTabs`, `replayTranscript`, `lostTranscript`, `showTab`, `asleepUntilSeen` - restore-tabs
- `nameSession`, `titleWanted`/`ownTitle` у `conversations` - tab-names
- `rewind`, `previewRewind`, `cutBack`, `rewinding` (очередь и пуш ждут отката), `uuid` в `deliverPrompt` - rewind
- `replayFork`, `forkOpenings` (ожидание в `deliverPrompt`), `unbornFork`, `bringBackFork`, форк в `restoreTabs` - fork-tabs

**`ClaudeSession.kt`** (подгружает turn-lifecycle): `rename`, `nameAfterPerson`, `namedAs`, `ownTitle` - tab-names; `setEffort`, `effort` - models; `awaitingPermission` -
permissions; окружение в `start` - task-list; `rememberConversation` - аргументы запуска в CLAUDE.md;
`isBusy` - idle-sleep; `forkOrigin` - accounts и fork-tabs; `context` в `userMessage` (заметка редактора отдельным блоком) -
editor-context; `rewind`, `previewRewind`, `cut`, `uuid` в `userMessage` - rewind; `forkLaunch`, `origin`, «родился ли» в `start` - fork-tabs.

**`ClaudeSessions.kt`** (подгружает accounts и idle-sleep): `rename`, `ownTitle` - tab-names; `branchFrom` - fork-tabs; `adoptModel` - history;
`newSession`, `onBorn`, `setPermissionMode` - models; `renewAfterSignIn` - expired-sign-in;
`releasedRole` и рамка в `prompt` - scenarios; `branchFrom(before)`, `originOf`, `restoreFork`, `forkOrigin` в `moveTo` - fork-tabs; `rewind`, `previewRewind` - rewind.

**`ProjectCatalog.kt`**: `sendCalmColors` - calm-colors; `runShellCommand` - editor-sync; `sendCustomModels` -
models; `pasteCollapse` в `sendInit` - paste; `authenticateMcp`, `sayProject` - remote-access;
`installedPlugins`, `refreshCommandHints` - slash-hints; список `files` - open-in-editor; страницы нерождённого
форка в `sendHistoryPage` - fork-tabs; `sendIndicators` и
`hiddenIndicators` в `sendInit` - indicators.

**`SessionCommands.kt`**: разбор команд от клиентов; `remember = local` у `setModel`/`setEffort` с телефона -
remote-access; остальное - по заметке фичи, которой принадлежит команда.

**`toolwindow/ClaudePanel.kt`**: сообщения аккаунтов и `designLogin` у двери окна - accounts; `setCustomModels` -
models; `openFile` - open-in-editor; фидбэк и лог незнакомого сообщения (только тип и длина) - feedback;
`setHiddenIndicators` - indicators; `setTheme`, `setTextSize`, `sendTheme`, `appearanceChanged` - appearance;
`saveDraft`, `tabShown`, `setRestoreTabs`, `sendDrafts` - restore-tabs; `watchEditor`, `sendEditorContext`,
`setShareEditor` - editor-context; счёт фич `UsageFeatures.ofMessage` у двери окна, `setUsageStats`,
`usageStatsPreview`, `usageChanged` - usage-stats.

**`ClaudeCli.kt`**: всё написанное человеком - в stdin (аргументы запуска в CLAUDE.md, prompt-improver);
`run`/`onStarted` и отмена - search; `--tools ""` у разовых запусков - task-list.

**`ClaudeLaunch.kt`** (подгружает task-list): `PANEL_BRIEFING`, `oneLine` - аргументы запуска в CLAUDE.md;
`AFTER_SCENARIO_HEAD` - scenarios; `CHECKPOINTS_VARIABLE` - rewind; `FORK_AT_FLAG`, `forkAt` - fork-tabs.

**`ClaudePreferences.kt`** (подгружает models): `gaugeVivid` - calm-colors; `language` - i18n;
`improveInstructions` - prompt-improver; стартовая модель новой вкладки переехала в `StartingChoice.kt` -
models; `hiddenIndicators` - indicators; `theme`, `textSize` - appearance; `restoreTabs` - restore-tabs;
`shareEditor` - editor-context.

**`RemoteCommands.kt`** (подгружает remote-access): почему телефону разрешено или запрещено конкретное
сообщение, сказано в заметке фичи, которой оно принадлежит.
