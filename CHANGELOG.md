# Changelog

All notable changes to Amazing Claude Code. The section for the version being
built is what the Marketplace and the IDE's update dialog show, so every release
lists only its own changes. Entries up to 0.7.4 were reconstructed from the
plugin's git history: until then all releases shared one ever-growing block of
notes, and a few releases never updated it at all — those are described by their
commits.

## [Unreleased]

## [0.7.5] - 2026-08-17

- Fixed: the first message in a forked tab looked like it never went through. The panel closed the turn the moment the conversation's process came up — the spinner stopped and a "Worked 0.1s" line appeared under the message — while Claude was in fact only starting to think. Anything typed after that queued up behind the answer nobody was waiting for anymore. The startup itself is no longer mistaken for a finished turn.
- "Send Absolute Path to Amazing Claude Code" now puts a chip into the input, the same as dragging a file in from the file manager, instead of a raw path spelled out in full. It points at the file itself: no line numbers are appended, since the full path is asked for to reach the file from a conversation started elsewhere. Claude still receives the whole path, and hovering the chip shows it.
- The permission card now says who asked for the confirmation when it wasn't the permission mode: a safety check, an `ask` rule from the settings, a hook, or the Auto mode classifier. In Bypass and Auto, where prompts aren't expected at all, a card without that line read as the panel being pushy.
- "Always allow" is hidden when the rule would not actually take: Claude Code itself refuses to auto-approve some checks — dangerous deletions above all. The button used to write the rule and the very next identical call asked again.
- A fresh panel now opens in the permission mode set in Claude Code's own settings (`permissions.defaultMode`), the same one the terminal starts in, instead of always starting at Ask. Modes the CLI would refuse from that source are ignored just as it ignores them.
- The Bypass permissions description no longer promises that every check is skipped, and the Shift+Tab hint in the mode menu now matches the cycle the panel actually walks.
- Release notes are no longer one ever-growing block: every release now shows only its own changes, in the Marketplace and in the IDE's update dialog alike.

## [0.7.4] - 2026-08-17

- Fixed on Linux: the panel's clipboard was cut off from the rest of the IDE. Copying in an editor tab and pasting into the panel did nothing, and neither did the other direction — only cut and paste inside the input field worked, because that never leaves the panel. The embedded browser draws without a window of its own, and on Linux the system clipboard belongs to a window: not getting one, the browser quietly falls back to a private clipboard nobody else can see. Copying, cutting and pasting now go through the IDE's own clipboard instead — including the copy button on code blocks and images pasted into the input field. macOS and Windows are untouched: their clipboard works, and the panel stays on it.

## [0.7.3] - 2026-08-15

- Polish composer buttons, ask panel, and menu UI
- Stop the panel tearing frames during long streaming replies
- Stop showing the routine auto-mode refusal as a chat error
- Steady selector width, track wait time apart from thinking, echo answered questions

## [0.7.2] - 2026-08-15

- The CONTEXT row shown while a conversation is being compacted no longer draws a bar of ticks across the row — the label, the text, and the percentage are left.
- Fixed: the usage rings stayed empty for up to a minute after a project was opened. Asked about the subscription limits before it has heard them from the server, the CLI answers with an empty slot instead of numbers, and the panel treated that answer as broken: the rings waited for the next poll a minute later, and the same failure interrupted the parsing of whatever else was arriving at that moment — which is what made the IDE report the plugin as failing. The panel now takes the empty answer for what it is and asks again a few seconds later.

## [0.7.1] - 2026-08-14

- Fixed several rough edges in the Compact layout introduced last version: the Send/Queue buttons no longer drift to the right when the usage rings next to them are still empty (right after the plugin starts); Stop now sits after Queue instead of between Send and Queue; background agents show above the feed, the same place as in the default layout, instead of being squeezed into the header; and the header's menu icon now lines up with the branch name instead of sitting a pixel off.

## [0.7.0] - 2026-08-14

- Rework composer layout and header menu

## [0.6.10] - 2026-08-13

- Fixed: after a usage limit, a crash, or any other stop, an unfinished task list stayed on screen and could not be closed — even if you asked Claude to close it. A new message now hides the old list; if the work continues, a fresh list appears.
- Fixed: messages sent while `/compact` was running were swallowed and never executed after compaction finished. They now wait in the queue and run once compaction is done.

## [0.6.9] - 2026-08-13

- A fourth composer layout — Compact — for tool windows docked short and wide, where the usual bottom layout's separate status line and full-size task list don't fit. The input stays at the bottom, but MODEL/EFFORT/MODE move into the composer itself, the context bar becomes a vertical strip instead of a horizontal one, the branch and its PR share the row with the task list, and the stream switcher collapses into chips in the header instead of its own row. The task list itself shows only the current task plus a count, with an arrow to expand the rest.
- A question repeated back in a sent message — a line ending in "?" — now shows dimmed, with a small gap above it, so the answer next to it reads apart from the question it's answering.
- Fixed: shell command output typed with `!` leaked its raw `<bash-input>`/`<bash-stdout>` markup into conversation titles, tab names, and the queued-message row instead of showing what was actually asked.
- Dragging a file from the project tree or the system file explorer now highlights the composer as a drop target, the same way a browser-native drag already did. Also fixes native drops from outside the IDE being silently rejected.

## [0.6.8] - 2026-08-13

- Fixed: the drag handle for the left/right input column highlighted and could be dragged, but the mouse cursor over it stayed a plain arrow instead of a resize cursor. Fixed: Ctrl+Z in the input triggered some other, chip-unaware undo instead of the input's own — only Cmd+Z was caught before, so Ctrl+Z fell through to whatever the embedded browser does with the underlying content by default.
- The input box can now sit to the left or right of the feed instead of always at the bottom — pick it from a new button in the header, next to History/MCP/Plugins/Sounds. In the left/right layout the input becomes a resizable column that fills the panel's full height, with a drag handle between it and the feed; the choice and the column's width are saved and survive a restart.
- Tab names now come from Claude Code itself — its own `ai-title` event — instead of being guessed from the first line of the first message, so a short opener like "Давай" or a pasted image placeholder no longer becomes the whole name. Until that arrives, the tab shows a live guess built from every meaningful line typed, not just the first. `/clear` now resets the tab's name along with the conversation, and each card in History shows the conversation's own id next to the date and message count.

## [0.6.7] - 2026-08-12

- Composer input can sit left or right, not just at the bottom

## [0.6.6] - 2026-08-12

- Meaningful tab names from the CLI, forgotten on /clear, and a visible conversation id

## [0.6.5] - 2026-08-11

- MCP servers are now shown the way the terminal shows them. The list is grouped by where each server comes from — this project, your own config, claude.ai connectors, built-ins and plugins — and every server says what state it is really in: connected, needs authentication, failed, connecting. A server that failed explains why, right under its name. A server that needs a sign-in now has an "Authenticate" button: the panel opens the sign-in page in your browser, Claude Code catches the answer, and the list updates itself. Reconnect now applies to a single server instead of restarting the whole conversation. All of this comes from Claude Code itself over the same channel the terminal's `/mcp` uses, instead of being read out of the text printed by `claude mcp list` — which is why the panel used to show "Pending approval (run claude to approve)" and offer no way to approve anything.
- An agent or a background command can now be stopped from the chip in the header: hover it and a cross appears. It asks first — the cross is small and an agent can be half an hour of work — and then stops that one task, leaving the conversation itself running.
- A question with options can now be closed without answering it: the cross in its header releases the turn, so you can reply in your own words in the message box instead. Claude is told the question was closed, so it doesn't sit waiting for a pick that will never come.
- Every code block in a reply now has its own copy button, and a short inline piece — a branch name, a flag, a path — is copied by clicking it. Copying the whole reply to get one command out of it meant cleaning the story around it afterwards.
- A pasted block in a sent message, when nothing follows it, now takes the full width and shows how many lines were pasted plus the first few of them, instead of seven words in a narrow chip.

## [0.6.4] - 2026-08-11

- Fixed: a conversation started by a slash command was listed in History under a raw tag — "<command-message>task</command-message>" instead of a name. Such a conversation is now named by the command itself, with its argument, and the shell's own service messages — the body of a called skill, a background-task notice, an image caption — no longer pass for something you typed.
- Fixed: a conversation opened from History showed the context bar full, whatever was really in it. The panel guessed the used context from the saved transcript, which doesn't record the model's window size, so on a 1M model the guess was divided by the usual 200k and always came out full. The panel now asks the conversation itself and shows the same number `/context` prints. Opening a past conversation also starts it right away, so it's ready to answer a few seconds earlier.
- The message count in History now counts what you said — your messages and the commands you ran. It used to count every service record in the transcript, tool results included: "375 messages" where you had written thirty.

## [0.6.3] - 2026-08-11

- Fixed: a shell command was shown as a subagent. Anything running longer than a few seconds took a chip labelled "agent:agent" in the switcher, and a command started in the background — a dev server, say — kept one for as long as the process lived, reading "1010m 08s" by the next morning. A background command now has a chip of its own that names it and counts how long it has been up; when it ends the chip goes away and its own card in the feed says how long it ran and how it ended, in red with the exit code if it failed. An ordinary long command doesn't appear up there at all.
- Fixed: one subagent took two chips in the switcher — the call that started it and the system event about it were counted as two different agents.
- Fixed: an agent that was stopped or failed looked exactly like one that finished its work. Its chip and its log now say what actually happened.
- Anything running longer than an hour is now timed in hours: "16h 50m" instead of "1010m 08s".

## [0.6.2] - 2026-08-11

- The paperclip and the slash next to the input now name themselves on hover, the way the icons in the header already did — and so does the play button in the sound settings, whose label never drew at all.

## [0.6.1] - 2026-08-11

- Fixed: the panel asked permission for almost everything and the mode you picked barely mattered — "Don't ask", "Auto" and "Bypass" still prompted, "Always allow" changed nothing, and even `ls` or `git status` needed a click. The panel no longer second-guesses Claude Code: it asks exactly where the terminal would, honours the selected mode, and respects the permission rules you already have. "Always allow" now takes hold at once, survives a restart, and applies in the terminal too.
- Fixed: conversations started in the terminal were missing from History when the project path contained a space or an underscore — and on Windows the list was empty every time.

## [0.6.0] - 2026-08-10

- A command typed with `!` in front now runs in your own shell, the way it does in the Claude Code terminal: `!git status`, `!pnpm test`. The panel runs it itself, in the project directory, and shows the output as a card in the feed — no agent turn spent on it and no permission to approve. Claude sees the command and its output attached to your next message.
- A multi-line paste now collapses into a chip showing the start of the text, so a pasted log no longer pushes everything else out of the input. The chip expands back into plain text with one click, and hovering it shows the whole thing.
- Arrow keys no longer step over an attachment chip: the caret stops on it and highlights it, Backspace removes it, and the same arrow again moves past. The highlight looks the same on chips of every colour.
- Options in a question and buttons in a permission request are numbered, and the number keys pick them — as long as the input is empty, so typing a message still types digits. Enter moves to the next question and sends the answers once everything is answered.
- The context bar now fills as the turn runs instead of only updating when it ends — until now it stood at zero through the longest request of all, the first one.
- Answers to a question are now shown in the feed as question-and-answer pairs instead of a bare list of answers.
- Fixed: a link Claude put in a heading (or in bold) was not clickable — it rendered as plain bold text.
- Fixed: the gap between two attachment chips was half as wide again as a normal word space, so neighbouring chips read as torn apart.

## [0.5.0] - 2026-08-10

- The panel now calls you out loud when it needs you: a turn that finished, a tool call waiting for approval, a question, a plan waiting to be accepted, a subscription limit that stopped the run, and trouble — an error, a process that died on its own, a session that got signed out. The "♪" button in the header lists all six with a checkbox, a volume slider and a play button each.
- A sound only plays when you aren't already looking at what it's about. Anything from a background tab always rings; from the open tab it rings only when looking at it isn't possible — the panel is collapsed, hidden behind another tool window, or the IDE window itself is not the one you're in. A conversation replayed from history stays quiet.
- A subscription limit that stops the run is now shown in the feed, with the time it resets — until now the panel said nothing at all about it.
- Fixed: the panel crashed with "t.filter is not a function" on /compact — the summary arrives as plain text rather than the usual message blocks.
- Fixed: when Claude Code switched the model on its own mid-run (its safeguards do that), the panel kept naming the old one. The model that is really running is now shown and ticked in the picker, even when the catalog doesn't list it.
- Fixed: the dashes in the context-compaction bar looked uneven — the filled part drew its own row of dashes on top of the one underneath.

## [0.4.0] - 2026-08-09

- The model list now comes from Claude Code itself instead of a list baked into the panel: the models your account can actually use, with the ones your plan or your organisation blocks marked as unavailable. A model the agent refuses no longer stays in the settings, and the panel keeps showing the one that is really running.
- The panel now finds the CLI where it actually is — npm, bun, volta, scoop, and the Windows variants of the file name. When it still can't, the screen lists every place it looked and what your own shell answers, and lets you point at the file by hand.
- Questions from the agent are answerable now: pick an option or type your own answer, and the run continues from the exact point where it asked.
- Plans and answers are rendered as real markdown — headings, nested bullets, inline code — instead of a flattened list of steps.
- Context compaction has its own card with a progress bar, so a long silent pause is no longer unexplained. The context window is shown as it fills, straight from the CLI.
- Tabs can be reordered by dragging, and a conversation moves together with its forks.
- An error inside the panel now shows a crash screen with a reload button instead of going black. Conversations live in the CLI and survive the reload.
- A note typed while a plan is waiting goes to the agent as the reason to keep planning — with any images attached to it — and lands in the tab you typed it in.
- Fixed: the panel could hang on "loading" forever while looking for the CLI if the login shell was slow to answer.
- Fixed: an interrupted context compaction left the tab without a status line for the rest of the session, and reloading the panel dropped every event that arrived during the reload.
- Fixed: answering a plan or a question after the conversation restarted silently lost what you wrote; it is sent as an ordinary message now.
- Fixed: reopening a past conversation turned the first message into a decision on a plan from that old conversation.
- Fixed: a background tab waiting for you on a plan or a question kept showing "working" instead of asking for attention.
- Fixed: dragging a tab and releasing it outside the tab strip swallowed the next click, and the manual CLI path field opened empty and could wipe a saved path.

## [0.3.3] - 2026-08-07

- Stop using the internal ToolWindowManagerListener overload

## [0.3.2] - 2026-08-05

- Let the agent ask permission through the control channel, track its own task list, and preload the side panels

## [0.3.1] - 2026-08-03

- Stop truncating git branch names and dropping their prefix
- Render links in agent replies as clickable links
- Refresh git branch on its own fast cycle, decoupled from PR polling
- Stop toggling border-color for composer focus ring
- Add a context meter bar to the composer input
- Stop composer's argument hint from sticking past the argument
- Clean up copying agent replies and heading spacing
- Stop plan mode from asking permission on its own plan draft

## [0.3.0] - 2026-08-01

- Fixed: a tight console line spacing setting made selected text overlap between wrapped lines. The panel now enforces a minimum line height regardless of the console font setting.
- Fixed: attachment and quote chips (in the input and once sent) sat slightly below the surrounding text instead of centered on it, and their icons didn't line up with each other from one chip to the next.
- The selection popover over the agent's reply now offers Quote and Fork from here — Copy was dropped, the browser's own copy shortcut already covers a selection.
- The input's placeholder text is shorter — just "Ask, or describe a change…".
- The attach and slash-command buttons are icon-only now, no more "attach" / "command" labels next to them.
- A message sent while the agent is working now reaches it right away, the way it does in the terminal: the agent picks it up at its next step instead of only after the run ends. Queue and Send are separate buttons now — Queue holds the message until the current run finishes, Send (and Enter) delivers it now. Both are disabled while the input is empty, and Queue is also disabled when nothing is running.
- Fixed: the first Shift+Enter in the input looked like it did nothing — only the next press broke the line, and whatever you typed in between landed before the break instead of on the new line. Pasted text ending in a line break did the same.
- The input now uses the same console font, size and line spacing as the feed, so a message looks exactly the same while you type it and after you send it.
- Fixed: the panel was drawn at a quarter of its size, and changing the console font size moved it the wrong way. The zoom that scales the panel to the IDE font was being converted twice.

## [0.2.6] - 2026-08-01

- The panel now takes its fonts from the IDE: the feed is drawn with the console font, at its size and line spacing, so it reads like the terminal next to it, and the whole panel follows when you change them. The manual font-size control is gone.
- Streamed answers arrive at an even pace instead of in bursts, and new words fade in as a left-to-right wave.
- Fixed: multi-line messages collapsed onto a single line once sent, even though the line breaks were kept everywhere else.
- Approving a plan now switches permissions to Bypass, so the agent can carry out the plan without asking for anything until you change the mode yourself.
- Fixed: a fast burst of tool calls made the group header flicker between the current tool's name and a bare count.
- Image references (`[Image #N]`) are now numbered across the whole conversation instead of restarting at 1 on every message.
- Fixed: dragging a queued message to reorder it silently did nothing.
- Fixed: selecting a past conversation from history that contained a plain-text message (no attachments) froze the entire panel instead of loading it.

## [0.2.0] - 2026-07-31

- Subagents now get their own view: a switcher next to the input moves between the main conversation and each running agent, with its full log, and the questions and permission requests an agent raises stay attached to it.
- Task list, plan, question, and permission panels are pinned above the input instead of scrolling away with the feed.
- New colour scheme — a cooler, quieter palette that sits closer to the IDE.
- Fixed: permission requests never reached the panel, so a tool call waiting for approval hung silently until it timed out.
- Fixed: choosing "Ask permissions" had no effect — the session fell back to whatever permission mode the local Claude Code config specified.
- Fixed: slash commands whose description spans several lines showed a stray character instead of the description.

## [0.1.0] - 2026-07-30

- First public release.

[Unreleased]: https://github.com/crmapache/amazing-claude-code/compare/0.7.5...HEAD
[0.7.5]: https://github.com/crmapache/amazing-claude-code/compare/0.7.4...0.7.5
[0.7.4]: https://github.com/crmapache/amazing-claude-code/compare/0.7.3...0.7.4
[0.7.3]: https://github.com/crmapache/amazing-claude-code/compare/0.7.2...0.7.3
[0.7.2]: https://github.com/crmapache/amazing-claude-code/compare/0.7.1...0.7.2
[0.7.1]: https://github.com/crmapache/amazing-claude-code/compare/0.7.0...0.7.1
[0.7.0]: https://github.com/crmapache/amazing-claude-code/compare/0.6.10...0.7.0
[0.6.10]: https://github.com/crmapache/amazing-claude-code/compare/0.6.9...0.6.10
[0.6.9]: https://github.com/crmapache/amazing-claude-code/compare/0.6.8...0.6.9
[0.6.8]: https://github.com/crmapache/amazing-claude-code/compare/0.6.7...0.6.8
[0.6.7]: https://github.com/crmapache/amazing-claude-code/compare/0.6.6...0.6.7
[0.6.6]: https://github.com/crmapache/amazing-claude-code/compare/0.6.5...0.6.6
[0.6.5]: https://github.com/crmapache/amazing-claude-code/compare/0.6.4...0.6.5
[0.6.4]: https://github.com/crmapache/amazing-claude-code/compare/0.6.3...0.6.4
[0.6.3]: https://github.com/crmapache/amazing-claude-code/compare/0.6.2...0.6.3
[0.6.2]: https://github.com/crmapache/amazing-claude-code/compare/0.6.1...0.6.2
[0.6.1]: https://github.com/crmapache/amazing-claude-code/compare/0.6.0...0.6.1
[0.6.0]: https://github.com/crmapache/amazing-claude-code/compare/0.5.0...0.6.0
[0.5.0]: https://github.com/crmapache/amazing-claude-code/compare/0.4.0...0.5.0
[0.4.0]: https://github.com/crmapache/amazing-claude-code/compare/0.3.3...0.4.0
[0.3.3]: https://github.com/crmapache/amazing-claude-code/compare/0.3.2...0.3.3
[0.3.2]: https://github.com/crmapache/amazing-claude-code/compare/0.3.1...0.3.2
[0.3.1]: https://github.com/crmapache/amazing-claude-code/compare/0.3.0...0.3.1
[0.3.0]: https://github.com/crmapache/amazing-claude-code/compare/0.2.6...0.3.0
[0.2.6]: https://github.com/crmapache/amazing-claude-code/compare/0.2.0...0.2.6
[0.2.0]: https://github.com/crmapache/amazing-claude-code/compare/0.1.0...0.2.0
[0.1.0]: https://github.com/crmapache/amazing-claude-code/commits/0.1.0
