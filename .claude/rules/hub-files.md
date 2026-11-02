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
- `queueEdits`, `takeBackQueued`, `case 'queuedTaken'`, `before` в `intoTheQueue` - queue-edit
- `pickTab`, `focusToken` (фокус в `startSession`, `resume`, `closeSession`) - composer-field
- `onQuote` у `SelectionMenu` и `addToDraft` (вставка снаружи встаёт в каретку) - composer-field
- `spellcheck`, `setSpellcheck`, `case 'spellcheck'`, атрибут на корне документа - composer-field
- `shareEditor`, `editorContext`, `editorOnce`, `editorShown`, `openEditorMenu`, `pickEditor`, `withEditor` в `submit`, `case 'editorContext'` - editor-context
- `menuConversation` (сообщение `sessionMenu` для меню правой кнопки), `status` в `runLocal`, `case 'sessionInfo'` - session-info
- `improveSources`, `restoreDraft`, `registerApply` - prompt-improver
- `feedPlaces`, `key={active}`, `forgetFeedFocus` - reading-place
- `hiddenTaskIds` - subagents
- `sendAnswers`, `dismissAsk` - permissions
- `latestTodo` (список задач из реплея не всплывает) - history
- выбор из истории, какую вкладку занять - history
- `branchFrom` / форк и шкала контекста форка - fork-tabs
- `fork(quote, point)`, `forkWhole`, `forkable`, разрез из выделения (`forkPointAfter`), `openOriginal` - fork-tabs
- `openRewind`, `confirmRewind`, `rewindOutcome`, `rewindInFork`, `rewinding`, `case 'rewindPreview'`/`'rewound'`, `uuid` в `submit` - rewind
- `startingModel`, `setCustomModels`, `stuckPick`, `onBorn` - models; `pickFastMode`, `fastShown`/`fastOffered`, `FAST_MODE` в меню - models (быстрый режим)
- `jumping`, `resetSearch`, эффект над `sessions` - search
- `watchedRuns`, `scenariosView`, `scenariosShown`, `runRecords`, `case 'scenarioLog'` - scenarios
- `runLocal`, `designAsked` - accounts
- `settingSources`, `settingSourcesFacts`, `openSettingSources` - setting-sources
- `openLink` - side-menu
- `mcpLoading` - idle-sleep
- экран обратной связи и его отладочный отчёт (`feedbackReport`) - feedback
- новогодние украшения - holiday
- экран без вкладок (`sessions.length === 0`, `Welcome`), `markPanelReady` на первый `auth` - welcome
- голосовая вставка в черновик - voice
- `hiddenIndicators`, `indicatorsSent`, `case 'indicators'`, `metersNode` - indicators
- `suggestion` у поля разговора, `editDeclines` и `suggestionDismissed` в `changeDraft` - prompt-suggestions
- `theme`, `setTheme`, `textSize`, `textSizeSent`, `case 'typography'`, `case 'theme'` - appearance
- `calls`/`setCalls`, свечение в `alert`, эффект с `callsStanding`, `activeCalling`, `case 'calledAway'` - tab-calls
- `draftsKnown`, `draftsSent`, `draftSaves`, `shellNamedTab`, `case 'drafts'`, `case 'activeTab'`, `restoreTabs` - restore-tabs
- `nameSession`, `case 'sessionTitle'`, `resumedTitle`/`searchHitTitleSource` при открытии из истории и поиска - tab-names
- `usageStats`, `answerUsageStats`, `UsageConsentCard` в `dockCards`, `stat` с `feature` в `openScreen`/`openMenu` - usage-stats
- `claudeConfig*` состояние, `openClaudeConfig`, `case 'claudeConfig'`, `config` в `runLocal` - claude-config
- хоткеи поверх панели, пока собирается иероглиф - composer-field
- `pressPanelKey`, `pressPanelKeyRef`, `closeSession`, `closingWorking`, `queueToken`, `panelKeys`, `stillWorking`, `case 'panelKey'`/`'panelKeys'` - panel-keys
- `reopenTab`, `reopenPanelTab`, `takeReopened`, `panelTabTitle`, `closedTabs`, `reopenable`, `closeTabHint`, `case 'closedTabs'`/`'tabReopened'`, досылка черновика в `closeSession`, `panelTabClosed` в `closePanelTab` - reopen-tabs
- `revertChanges`, `sendRevert`, `case 'changesReverted'` - changed-files
- `ImagePreview` рядом с `Tooltips`, `case 'imagePreview'`, `SaidImagesContext` вокруг `Feed`, `openPicture` и `OpenPictureContext`, `sessionId` у `Queue` - image-preview
- `missingFiles`, `case 'fileMissing'`, очистка в `openFile` - open-in-editor
- `sideThreads`, `askAside`, `forgetSide`, `case 'sideAnswer'`/`'sideProgress'`, Esc над карточкой вопроса сбоку, `SideQuestionCard` в `dockCards` - btw
- только в `mobile/App.tsx`: `PhoneRewind`, `refills`, `RewindSheet` - rewind; `forkFrom`/`forkWhole` (`kind: 'branch'`, `before`) - fork-tabs;
  `openMachineScreen`, `openRepository`, `Door`/`from`, `edit.home`/`edit.origin` -
  remote-access и scenarios; `vividOf` - calm-colors; `case 'effort'` в `mobile/feed.ts` - models

**`webview/src/protocol.ts`**:
- любое новое сообщение - remote-access: реши про него в `RemoteCommands`, иначе красный `RemoteCommandsTest`
- `rejected` - prompt-improver; `'withdrawn'` - permissions; `PaintedTerm`, `matchCase`, `wholeWords` - search
- `mcpList` с `ifRunning` - idle-sleep; `cursor` в `replayFinished`, `historyPage` - history
- `effort`, `fastMode`, `setFastMode`, `fast_mode_state`, `fast` у `ModelInfo`, `setCustomModels`, `customModels` - models; `setSendKey`, `spellcheck`, `setSpellcheck` - composer-field;
  `queue` - remote-access
- `models` у `usage`, `ModelUsageWindow`, `hiddenIndicators`, `setHiddenIndicators`, факт `indicators` - indicators
- `sessionMenu`, `sessionInfo` (запрос и ответ) - session-info
- `toolUseResult` у `AgentUserEvent`, `text` у `askAnswer` - permissions; `origin` у `AgentUserEvent` - history
- `settingSources` в `init`, `setSettingSources`, `askSettingSources`, `accountOutranked`, `api_error_status` - setting-sources
- `sideQuestion`, `sideQuestionCancel`, `sideAnswer`, `sideProgress` - btw
- `panelKey`, `panelKeys`, `openKeymap`, `PanelKeyCommand`, `PanelKeyName`, `PanelKeyStroke` - panel-keys
- `theme`, `setTheme`, `setTextSize`, размеры в `typography` - appearance
- `claudeConfig`, `askClaudeConfig`, `setClaudeConfig`, `ClaudeConfigSetting` - claude-config
- `activeTab`, `drafts`, `restoreTabs`, `saveDraft`, `tabShown`, `setRestoreTabs` - restore-tabs
- `ClosedTab`, `closedTabs`, `tabReopened`, `reopenTab`, `panelTabClosed`, `TabPlace` (одно описание, `tabs.ts` его переэкспортирует), `held` у `queue` - reopen-tabs
- `takeQueued`, `queuedTaken`, `before` у `queuePrompt` - queue-edit
- `PromptSuggestionEvent` (`prompt_suggestion`) - prompt-suggestions
- `previewImage`, `imagePreview`, `openPicture`, `PreviewPlace`, `tokens` у `QueuedMessage` - image-preview
- `tool_use_result`, `ToolUseResult` (дифф правки и `type: 'create'`), `FileEdit`, `RevertOutcome`, `revertChanges`,
  `changesReverted`, `FilesSettledEvent` - changed-files; `fileMissing` - open-in-editor
- `EditorRef`, `editorContext`, `shareEditor`, `setShareEditor`, `editor` у `prompt`/`queuePrompt`/`promptEcho` - editor-context
- `TitleSource` (`'user'`), `nameSession`, `titleSource` у `SearchHit` - tab-names
- `usageStats`, `usageStatsReport`, `setUsageStats`, `usageStatsPreview`, `stat` с `kind: 'feature'` - usage-stats
- `rewind`, `rewindPreview`, `rewindOutcome`, `rewound`, `RewindCode`, `RewindRefusal`, `uuid` у `prompt`/`promptEcho` - rewind;
  `before` у `newSession`, `ForkSeamEvent` (`fork_seam`) - fork-tabs; `auto` у `promptEcho`, `CarryOnReason`,
  `carryOnWait`, `cancelCarryOn` - accounts

**`webview/src/feed/build.ts`** (редьюсер ленты):
- `case 'sessionInfo'` (строка `/status`) - session-info
- `TodoWrite`/`TaskCreate`/`TaskUpdate`, `tasksCarried`, `pendingTasks` - task-list
- `stintElapsed`, `stintOver`, `workGoesOn`, `pendingAgents`, подпись под ответом в `case 'result'` - turn-lifecycle
- контекст из реплея в `case 'result'`, `historyPage`, `windowModel`, `resumed`, `SERVICE_BLOCK`,
  `addReplayedPrompt` - history
- `taskPrompt`, ветка `Workflow`, `applyTaskProgress`, `ASYNC_AGENT_LAUNCHED` - subagents
- `modelContextWindow`, `case 'context'`, `learnWindows`/`learnedWindow` (окно из `modelUsage` результата) - fork-tabs
- `noteStreamModel`, `ownSwap`/`ownSwapDue`, `stuckPick`, `noteFastReport`, `case 'fastModeApplied'` - models
- `revivedAsk`, `addReplayedAnswers`, отметка `answered` у вопроса в `applyToolResults` - permissions
- `isEditTool` - tool-cards; `realModel` - stats; `uuid` у `UserItem`/`TextItem` - search
- `case 'outranked'` и `OutrankedItem`, `overSampling` и метки `addError` - setting-sources
- в состояние кладутся признаки, а не слова - i18n
- `editorOfBlocks` в `addReplayedPrompt`, `editor` у действия `prompt` - editor-context
- `applyRewound`, `case 'rewound'`, `uuid`/`steering` у действия `prompt` - rewind
- `case 'fork_seam'` (шов форка, `CheckpointItem.source`) - fork-tabs
- `CARRY_ON` в `addReplayedPrompt`, `auto` у действия `prompt`, `case 'carryOnWait'` - accounts
- `noteChanges` в `case 'user'`, `closeChanges` в `result`, тихой остановке, смерти и подмене процесса, `prompt`,
  `addReplayedPrompt`, `applyReplayFinished`; `turnChanges` в `/clear` - changed-files
- `case 'changesReverted'` (итог отката файлов хода) - changed-files
- `case 'files_settled'` (сверка файлов хода с диском, `settleChanges`) - changed-files
- `queueHeld` в `case 'queue'` - reopen-tabs
- `case 'prompt_suggestion'`, `withoutSuggestion` и сброс `suggestion`/`suggestionDeclined` в `prompt`, `status`, `/clear`, откате и смерти процесса, `suggestionDismissed` - prompt-suggestions (правила в `feed/suggestion.ts`)

**`webview/src/feed/types.ts`** и **`webview/src/feed/panelState.ts`**:
- `DraftEdit` - prompt-improver; `ErrorItem.signIn` - expired-sign-in; `ErrorItem.sampling` - setting-sources;
  `ModelStuckItem` - models; `UserItem.auto` (подпись PANEL), `PanelState.carryOn` - accounts; `SessionInfoItem` - session-info;
  `PanelState.suggestion`, `suggestionDeclined`, действие `suggestionDismissed` - prompt-suggestions
- `ClosedReason`, `ToolMeta`, `CompactOutcome`, `DetailNote`, `PermItem.mode`, `LimitItem.window`,
  `MetaItem.stats` («Stopped by you» не переводится) - i18n; `movedAccount` - accounts
- `CompactItem.startedAt`, `stintStartedAt`, `pausedMs` - turn-lifecycle; `TodoItem.replayed` - history
- `AskItem.historic`/`answered`/`reopened`, `PlanItem.historic` - permissions
- `PanelState.tasks`, `pendingTasks`, `tasksCarried` - task-list; `pins` - pins
- `earlierPages`, `oldestEventUuid`, `reachedStart` - history; `ownSwapDue`, `stuckPick` - models
- `ChangesItem`, `FileChange`, `PanelState.turnChanges` - changed-files

**`webview/src/components/Feed.tsx`**: `carryOn`/`onCancelCarryOn` (строка плана) - accounts; `holdPressed` - paste; `case 'changes'`, `closedChanges`, `projectRoot` - changed-files; `pinsHeight` - pins; поправка прокрутки на
`earlierPages` - history; `paint`, `PAINT_INTERVAL_MS`, `goToRow`, фокус находки - search;
`onCopy` - clipboard и markdown (формулы уносятся исходником).

**`webview/src/components/Composer.tsx`**: `keyQueues` - queue-edit; чип `editor` и шаг `editorName` в
`droppable` - editor-context; `registerApply`, `fillField` - prompt-improver; хвост диктовки
`data-voice` - voice; `ContextMeter` - composer-field, calm-colors и indicators (`bar`/`figure`); проп
`indicators` и пустые контейнеры на рельсе и в compact - indicators; сворачивание вставки - paste;
`queueToken`, `queueKey`, `pressQueueKey`, `seenQueueToken` - panel-keys; проп `suggestion`, `shownSuggestion` (`shownGuess`) в
заглушке и Tab в `handleKeyDown` - prompt-suggestions.

**`webview/src/components/feed.module.css`**: `.userActions`, `.moreOpen` - message-reuse; `.taskLog` - subagents;
`.toolHead` и его распорка `::before` - tool-cards; `.pins`, `.pinOn`, `.textWithMenu`, `.textPinned` - pins;
`.chipPasteCopy` - paste; `.rowLit` - search; `.changes`, `.change*` - changed-files.

**Слои (z-index)**: лестница записана в `holiday.module.css`. Полка пинов 19, кнопка «вниз» 20, вуаль 21,
капсула поиска 22 - pins и search; чипы MODEL/EFFORT/MODE 41, окно поиска 44/45 - search; подтверждение
46/47 - accounts.

**`webview/src/tokens.css`**: `--acc-hit` и плотность `touch` - remote-access; `--acc-chip-*` - tool-cards;
шрифтовой стек CJK - i18n; ступени `--acc-gauge-*` - calm-colors; светлая тема, `--acc-scrim`/`--acc-drop`,
`color-scheme` - appearance; `--acc-group-deep`/`--acc-group-depth` - active-tab.

**`webview/src/catalog.ts`**: `panelCommands` (`/design-login`) - accounts; `/status` - session-info.

**`webview/src/harness/events.ts`**: `toolResult` со структурной половиной - changed-files.

**`webview/src/harness/player.ts`** (плеер играет роль IDE): `answerResume` и страницы истории - history;
`answerModel` (ответ обязан быть отложенным) и `setEffort` - models; переписывание - prompt-improver;
диктовка - voice; `savePastedFile`, `clipboardWrite`/`clipboardRead` - clipboard; `saveImage` - stats; `sessionInfo` - session-info;
фидбэк - feedback; поиск - search; вход в аккаунт - expired-sign-in и accounts; транскрипт агента - subagents;
`answerFork` (история и шов нового форка) - fork-tabs; `answerPanelKeys` (раскладка и перехват клавиш панели) -
panel-keys; `answerClosedTabs` (зеркало полосы и закрытые вкладки), `drafts` на `ready` - reopen-tabs; `answerPreview`,
`rowTokens` в `sayQueue` - image-preview.

**`ClaudeSessionHub.kt`** (сам по себе подгружает remote-access):
- `prompt`: сохранение буферов - editor-sync; `sendStatus`, очередь, команда в идущий ход - turn-lifecycle
- `previewImage`, `openPicture`, `pictureAt`, `transcriptsOf`, `QueueRows.tokens` в `queueMessage` - image-preview
- `takeQueued`, `before` у `queuePrompt`, `enqueue` - queue-edit; `editorSeen`, `echoWith`, `context` в
  `deliverPrompt` - editor-context
- `changeModel`, `emitLive` для усилия, `changeFastMode` - models
- `refreshInit` (свежий `init` подключившемуся) - remote-access; `lastContextMessage` в `attach` - fork-tabs
- `INIT_MARKER` - fork-tabs и history; `RESULT_MARKER`, `everyHub`, `accounts`, `accountsChangedElsewhere` - accounts
- `carryOn`, `sayNext` и `PassGate` за `runQueued` (один проход на вкладку), `auto` у `deliverPrompt`, `noteLimitRefusal`, `afterQuietSwap`,
  `carryOnChanged`, `carryOnWhatIsDue`, `cancelCarryOn`, `RESTART` в `onProcessDropping` - accounts (работа, остановленная не человеком)
- `settingSources` у `conversations`, `sendAccountOutranked` - setting-sources
- `resumeConversation`, сообщение `conversation` в `attach`/`resetJournal` - history
- `PROJECT_ORDER`, `broadcastProject` - remote-access и calm-colors; `indicators` в нём - indicators;
  `refreshCommandHints` - slash-hints
- `stats` - stats; круг сна простаивающих - idle-sleep; прогрев `ClaudeHome` - claude-home
- `restoreTabs`, `rememberTabs`, `replayTranscript`, `lostTranscript`, `showTab`, `asleepUntilSeen` - restore-tabs
- `closedTabs`, `keepClosed`, `reopenTab`, `bringBackClosed`, `notePanelTabClosed`, `sendClosedTabs`, `tabSnapshot`, `byPerson` у `closeSession`, придержанная очередь (`freeToSay`, `queued.release` в `deliverPrompt`, ветка в `enqueue`), `closedJournals` и `wiped` в `attach` - reopen-tabs
- `nameSession`, `titleWanted`/`ownTitle` у `conversations` - tab-names
- `rewind`, `previewRewind`, `cutBack`, `rewinding` (очередь и пуш ждут отката), `uuid` в `deliverPrompt` - rewind
- `revertChanges` (откат файлов хода по его диффам) - changed-files
- `undiffed` в `onAgentLine` (дифф большой правки, который CLI не прислал) - changed-files
- `undiffed.settle` на `result` в подписчике строк (`files_settled` - что ход на деле сделал с файлами) - changed-files
- `footprint`: `begin` в `deliverPrompt`, `end` на `result` (вместе со сверкой), `noteLine` в `onAgentLine`, `turnOver`/`drop`,
  подписка `VFS_CHANGES` (записи самой IDE) - changed-files
- `replayFork`, `forkOpenings` (ожидание в `deliverPrompt`), `unbornFork`, `bringBackFork`, форк в `restoreTabs` - fork-tabs

**`ClaudeSession.kt`** (подгружает turn-lifecycle): `mute`, `heard` - reopen-tabs; `rename`, `nameAfterPerson`, `namedAs`, `ownTitle` - tab-names; `setEffort`, `effort` - models; `awaitingPermission` -
permissions; окружение в `start` - task-list; `rememberConversation` - аргументы запуска в CLAUDE.md;
`isBusy` - idle-sleep; `forkOrigin` - accounts и fork-tabs; `suggestionsWanted` - prompt-suggestions; `context` в `userMessage` (заметка редактора отдельным блоком) -
editor-context; `rewind`, `previewRewind`, `cut`, `uuid` в `userMessage` - rewind; `forkLaunch`, `origin`, «родился ли» в `start` - fork-tabs.

**`ClaudeSessions.kt`** (подгружает accounts и idle-sleep): `goesOn` у `close` (процесс закрытой вкладки молчит) - reopen-tabs; `rename`, `ownTitle` - tab-names; `branchFrom` - fork-tabs; `adoptModel` - history;
`newSession`, `onBorn`, `setPermissionMode` - models; `renewAfterSignIn` - expired-sign-in;
`releasedRole` и рамка в `prompt` - scenarios; `branchFrom(before)`, `originOf`, `restoreFork`, `forkOrigin` в `moveTo` - fork-tabs; `rewind`, `previewRewind` - rewind.

**`ProjectCatalog.kt`**: `sendCalmColors` - calm-colors; `runShellCommand` - editor-sync; `sendCustomModels` -
models; `pasteCollapse` в `sendInit` - paste; `authenticateMcp`, `sayProject` - remote-access;
`installedPlugins`, `refreshCommandHints` - slash-hints; список `files` - open-in-editor; страницы нерождённого
форка в `sendHistoryPage` - fork-tabs; `sendIndicators` и
`hiddenIndicators` в `sendInit` - indicators.

**`SessionCommands.kt`**: разбор команд от клиентов; `revertChanges` - changed-files; `remember = local` у `setModel`/`setEffort` с телефона -
remote-access; остальное - по заметке фичи, которой принадлежит команда.

**`toolwindow/ClaudePanel.kt`**: сообщения аккаунтов и `designLogin` у двери окна - accounts; `setCustomModels` -
models; `openFile` - open-in-editor; фидбэк и лог незнакомого сообщения (только тип и длина) - feedback;
`setHiddenIndicators` - indicators; `setTheme`, `setTextSize`, `sendTheme`, `appearanceChanged` - appearance;
`saveDraft`, `tabShown`, `setRestoreTabs`, `sendDrafts` - restore-tabs; `reopenTab`, `panelTabClosed` - reopen-tabs; `watchEditor`, `sendEditorContext`,
`setShareEditor` - editor-context; `sessionMenu`, `sendSessionInfo`, `onSessionIdCopied` - session-info; `setSpellcheck`, `spellcheckChanged` - composer-field; счёт фич `UsageFeatures.ofMessage` у двери окна, `setUsageStats`,
`usageStatsPreview`, `usageChanged` - usage-stats; `PanelKeys.install`, `pressPanelKey`, `sendPanelKeys`,
`watchKeymap`, `openKeymap` - panel-keys.

**`ClaudeCli.kt`**: всё написанное человеком - в stdin (аргументы запуска в CLAUDE.md, prompt-improver);
`run`/`onStarted` и отмена - search; `--tools ""` у разовых запусков - task-list; `noSignIn` (запуск без
чьего-либо входа) - accounts.

**`ClaudeLaunch.kt`** (подгружает task-list и prompt-suggestions): `PANEL_BRIEFING`, `oneLine` - аргументы запуска в CLAUDE.md;
`AFTER_SCENARIO_HEAD` - scenarios; `CHECKPOINTS_VARIABLE` - rewind; `FORK_AT_FLAG`, `forkAt` - fork-tabs.

**`ClaudePreferences.kt`** (подгружает models): `gaugeVivid` - calm-colors; `language` - i18n;
`improveInstructions` - prompt-improver; стартовая модель новой вкладки переехала в `StartingChoice.kt` -
models; `hiddenIndicators` - indicators; `theme`, `textSize` - appearance; `restoreTabs` - restore-tabs;
`shareEditor` - editor-context; `spellcheck` - composer-field.

**`RemoteCommands.kt`** (подгружает remote-access): почему телефону разрешено или запрещено конкретное
сообщение, сказано в заметке фичи, которой оно принадлежит.
