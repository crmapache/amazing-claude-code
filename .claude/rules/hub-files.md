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
- `reuseMessage` - message-reuse
- `improveSources`, `restoreDraft`, `registerApply` - prompt-improver
- `feedPlaces`, `key={active}`, `forgetFeedFocus` - reading-place
- `hiddenTaskIds` - subagents
- `sendAnswers`, `dismissAsk` - permissions
- `latestTodo` (список задач из реплея не всплывает) - history
- выбор из истории, какую вкладку занять - history
- `branchFrom` / форк и шкала контекста форка - fork-tabs
- `startingModel`, `setCustomModels`, `stuckPick`, `onBorn` - models
- `jumping`, `resetSearch`, эффект над `sessions` - search
- `watchedRuns`, `scenariosView`, `scenariosShown`, `runRecords`, `case 'scenarioLog'` - scenarios
- `runLocal`, `designAsked` - accounts
- `settingSources`, `settingSourcesFacts`, `openSettingSources` - setting-sources
- `openLink` - side-menu
- `mcpLoading` - idle-sleep
- состояние формы обратной связи - feedback
- новогодние украшения - holiday
- голосовая вставка в черновик - voice
- `hiddenIndicators`, `indicatorsSent`, `case 'indicators'`, `metersNode` - indicators
- `theme`, `setTheme`, `textSize`, `textSizeSent`, `case 'typography'`, `case 'theme'` - appearance
- `draftsKnown`, `draftsSent`, `draftSaves`, `shellNamedTab`, `case 'drafts'`, `case 'activeTab'`, `restoreTabs` - restore-tabs
- хоткеи поверх панели, пока собирается иероглиф - composer-field
- только в `mobile/App.tsx`: `openMachineScreen`, `openRepository`, `Door`/`from`, `edit.home`/`edit.origin` -
  remote-access и scenarios; `vividOf` - calm-colors; `case 'effort'` в `mobile/feed.ts` - models

**`webview/src/protocol.ts`**:
- любое новое сообщение - remote-access: реши про него в `RemoteCommands`, иначе красный `RemoteCommandsTest`
- `rejected` - prompt-improver; `'withdrawn'` - permissions; `PaintedTerm`, `matchCase`, `wholeWords` - search
- `mcpList` с `ifRunning` - idle-sleep; `cursor` в `replayFinished`, `historyPage` - history
- `effort`, `setCustomModels`, `customModels` - models; `setSendKey` - composer-field; `queue` - remote-access
- `models` у `usage`, `ModelUsageWindow`, `hiddenIndicators`, `setHiddenIndicators`, факт `indicators` - indicators
- `toolUseResult` у `AgentUserEvent`, `text` у `askAnswer` - permissions; `origin` у `AgentUserEvent` - history
- `settingSources` в `init`, `setSettingSources`, `askSettingSources`, `accountOutranked`, `api_error_status` - setting-sources
- `theme`, `setTheme`, `setTextSize`, размеры в `typography` - appearance
- `activeTab`, `drafts`, `restoreTabs`, `saveDraft`, `tabShown`, `setRestoreTabs` - restore-tabs

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

**`webview/src/components/Composer.tsx`**: `registerApply`, `fillField` - prompt-improver; хвост диктовки
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
`color-scheme` - appearance.

**`webview/src/catalog.ts`**: `panelCommands` (`/design-login`) - accounts.

**`webview/src/harness/player.ts`** (плеер играет роль IDE): `answerResume` и страницы истории - history;
`answerModel` (ответ обязан быть отложенным) и `setEffort` - models; переписывание - prompt-improver;
диктовка - voice; `savePastedFile`, `clipboardWrite`/`clipboardRead` - clipboard; `saveImage` - stats;
фидбэк - feedback; поиск - search; вход в аккаунт - expired-sign-in и accounts; транскрипт агента - subagents.

**`ClaudeSessionHub.kt`** (сам по себе подгружает remote-access):
- `prompt`: сохранение буферов - editor-sync; `sendStatus`, очередь, команда в идущий ход - turn-lifecycle
- `changeModel`, `emitLive` для усилия - models
- `INIT_MARKER` - fork-tabs и history; `RESULT_MARKER`, `everyHub`, `accounts`, `accountsChangedElsewhere` - accounts
- `settingSources` у `conversations`, `sendAccountOutranked` - setting-sources
- `resumeConversation`, сообщение `conversation` в `attach`/`resetJournal` - history
- `PROJECT_ORDER`, `broadcastProject` - remote-access и calm-colors; `indicators` в нём - indicators;
  `refreshCommandHints` - slash-hints
- `stats` - stats; круг сна простаивающих - idle-sleep; прогрев `ClaudeHome` - claude-home
- `restoreTabs`, `rememberTabs`, `replayTranscript`, `lostTranscript`, `showTab`, `asleepUntilSeen` - restore-tabs

**`ClaudeSession.kt`** (подгружает turn-lifecycle): `setEffort`, `effort` - models; `awaitingPermission` -
permissions; окружение в `start` - task-list; `rememberConversation` - аргументы запуска в CLAUDE.md;
`isBusy` - idle-sleep; `forkFrom` - accounts.

**`ClaudeSessions.kt`** (подгружает accounts и idle-sleep): `branchFrom` - fork-tabs; `adoptModel` - history;
`newSession`, `onBorn`, `setPermissionMode` - models; `renewAfterSignIn` - expired-sign-in;
`releasedRole` и рамка в `prompt` - scenarios.

**`ProjectCatalog.kt`**: `sendCalmColors` - calm-colors; `runShellCommand` - editor-sync; `sendCustomModels` -
models; `pasteCollapse` в `sendInit` - paste; `authenticateMcp`, `sayProject` - remote-access;
`installedPlugins`, `refreshCommandHints` - slash-hints; список `files` - open-in-editor; `sendIndicators` и
`hiddenIndicators` в `sendInit` - indicators.

**`SessionCommands.kt`**: разбор команд от клиентов; `remember = local` у `setModel`/`setEffort` с телефона -
remote-access; остальное - по заметке фичи, которой принадлежит команда.

**`toolwindow/ClaudePanel.kt`**: сообщения аккаунтов и `designLogin` у двери окна - accounts; `setCustomModels` -
models; `openFile` - open-in-editor; фидбэк и лог незнакомого сообщения (только тип и длина) - feedback;
`setHiddenIndicators` - indicators; `setTheme`, `setTextSize`, `sendTheme`, `appearanceChanged` - appearance;
`saveDraft`, `tabShown`, `setRestoreTabs`, `sendDrafts` - restore-tabs.

**`ClaudeCli.kt`**: всё написанное человеком - в stdin (аргументы запуска в CLAUDE.md, prompt-improver);
`run`/`onStarted` и отмена - search; `--tools ""` у разовых запусков - task-list.

**`ClaudeLaunch.kt`** (подгружает task-list): `PANEL_BRIEFING`, `oneLine` - аргументы запуска в CLAUDE.md;
`AFTER_SCENARIO_HEAD` - scenarios.

**`ClaudePreferences.kt`** (подгружает models): `gaugeVivid` - calm-colors; `language` - i18n;
`improveInstructions` - prompt-improver; `startingModel`/`startingEffort` для писателя сценариев -
scenario-author; `hiddenIndicators` - indicators; `theme`, `textSize` - appearance; `restoreTabs` - restore-tabs.

**`RemoteCommands.kt`** (подгружает remote-access): почему телефону разрешено или запрещено конкретное
сообщение, сказано в заметке фичи, которой оно принадлежит.
