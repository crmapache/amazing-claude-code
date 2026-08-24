# Changelog

All notable changes to Amazing Claude Code. The section for the version being
built is what the Marketplace and the IDE's update dialog show, so every release
lists only its own changes. Entries up to 0.7.4 were reconstructed from the
plugin's git history: until then all releases shared one ever-growing block of
notes, and a few releases never updated it at all — those are described by their
commits.

## [Unreleased]

## [0.7.23] - 2026-08-24

- Changed: the plugin's logo carries the ACC monogram now - the same three letters and the same rays the side bar button already has - in the cream of the old mark, on the plate the logo always had. What stood there before was traced along with the plate: a figure of thin lines and sparks that held together at the size it was drawn at and turned into a smudge at the size a plugin is actually seen at, twenty-four pixels in a list of installed ones. The phone client's icons are rendered from that same file, so they changed with it.
- Fixed: on a phone the arrow that opens a card stood below its own row instead of beside it, and turning it moved it somewhere else again. It was the typographic ▶, centred by the head as a whole - and a head on a touchscreen is a fingertip tall while its words sit at the top edge of it, so the glyph dropped into the empty half; the shape itself came from whatever face the phone had a triangle in, off the middle of its own box, which is what made the turn swing it out on an arc. The arrow is drawn now and keeps to the head's first line: its middle and the middle of the words are one line, at any height of the head, and it turns about its own centre - open or closed, it occupies exactly the same place.

## [0.7.22] - 2026-08-24

- Changed: everything the menu leads to - the history, MCP servers, plugins, sounds, remote access, the default mode, where the message field sits - is a screen of its own now, sliding over the menu rather than a popup opening beside it. What forced it was the explaining line under an option: what "Accept edits" or "Don't ask" actually permits takes a sentence to say, and a dropdown carrying those sentences ran past the edge of the panel. A screen keeps the menu underneath itself, so the way back out of one is a step rather than a fresh start.
- Fixed: the wheel crawled in the menu - a notch of it moved the list by a hair, close enough to broken that it read as broken. The IDE's browser reports a wheel in lines rather than pixels, and a line here is not the sixteen pixels one might assume; a notch now travels the distance a hand expects it to.
- Fixed: hovering anything that should explain itself - the chip of a background command, a control in the header - showed nothing at all. A native tooltip belongs to the browser's own window, and this page is drawn offscreen for the IDE, so the tooltip never reached a screen. The panel draws its own now, and a background command's chip names the command first: that is the question such a chip raises while it sits there.
- Fixed: the status line said Claude was thinking while it was in fact standing still, waiting for you. A permission request, a question with options and a shown plan hold a turn exactly as fast as one another, and all three now read as waiting rather than as work. A decision awaited inside one subagent still speaks through that agent's own tab, not through the main line - otherwise the line would go back to saying something untrue.
- Changed: the volume slider plays the sound when you let go of it, so how much quieter it has become is heard rather than guessed at.
- Changed: the panel and a paired phone word the dates of past conversations the same way - today by the clock, anything older by the date. Two lists of the same conversations disagreeing about that is the sort of small thing that makes an application feel assembled rather than made.
- Fixed: session tabs were named "new session", or by the first line of whatever you typed first - a whole sentence cut off mid-word. Claude Code names a session itself, but only when it runs as a terminal chat; run as a stream, which is how the panel runs it, it names nothing unless asked. The panel now asks, by your first message, and the tab gets what a name is meant to be: a few words about the subject, in the language the conversation is held in. The name is written into the conversation itself, so the history list and a paired phone show the same one, and it survives closing the panel. The instant guess from your first line is still there - as a stand-in for the second or two the real name takes. A conversation wiped with /clear is named again by whatever it starts on.
- Changed: the EFFORT menu now reads from the top down, strongest first: auto, then ultracode down to low. Reaching for that menu means reaching for more thinking, and what is reached for should not sit at the bottom of a list that opens at its top.
- Fixed: hovering the entries of the MODEL, EFFORT and MODE menus highlighted every other one, and sometimes two at once - one under the cursor and one left behind. The highlight was driven by the panel itself, and the mouse events it relied on are dropped now and then inside the IDE's browser. It is the browser's own highlight now: exactly one entry, always the one under the cursor. The chosen entry keeps its own mark when you pass over it.
- Changed: the menus' headings lost the captions that only repeated the heading - "/model" under MODEL, "reasoning budget" under EFFORT. MODE keeps "shift+tab", the one thing nothing else on screen says. A caption that no longer fits beside its heading now drops onto a line of its own instead of breaking the heading in half.

## [0.7.21] - 2026-08-23

- Added: remote access - answering your agent from your phone. It is off when the plugin is installed and does nothing over the network until you turn it on, in the panel's menu → Remote access. Pairing is a QR code shown in the IDE and confirmed at the desk, with a fingerprint to compare on both screens; from then on the phone shows the same feed the panel does - the same cards, the same conversation - and can answer a permission request, accept or send back a plan, answer a question, stop a turn, send a message, or open a new conversation in any project this IDE has open or has recently had open. What travels goes through a relay server, encrypted end to end: it passes sealed envelopes between your machine and your phone and cannot read what is inside them. A paired phone deliberately cannot do a number of things the panel can - run shell commands, change permission modes, install plugins or MCP servers, open files or links on your machine - and any device can be revoked instantly, which works even if the phone is switched off. You can also point the plugin at a relay of your own. What travels and what a relay can see: https://relay.mzpizote.com/privacy
- Fixed: a conversation opened from the history showed the subagents in it as working right now, forever. A live run hears of an agent's end through a system event, and a saved conversation keeps no events at all - only messages. Such a card is now closed by the notification the CLI itself wrote into the talk, which is the one trace of that ending a transcript does keep.
- Fixed: a conversation opened from the history showed the CLI's own notifications about finished background work as if you had typed them - a wall of markup signed with your name and the time. Those notifications now go where they belong: the outcome of a background command or of a subagent is written into the card that launched it, so a past conversation shows how that work ended instead of a block of tags. Previously such a card was closed with "how this one ended is not part of the saved conversation" - which was not true, the answer was in the transcript all along.

## [0.7.19] - 2026-08-21

- Fixed: a message sent while a turn was still running could vanish without a trace - it stood in the feed, no answer ever came, and no work started. Claude Code takes such a message into its own input, and what happens next is up to it: it may start a new turn with it once the current one ends, or hand it to the turn already running, or drop it entirely - and a dropped message leaves nothing behind, not in the stream of events and not in the conversation itself. The panel now keeps track of what it sent while a turn was running, checks the conversation once that turn ends, and sends the message again if it never arrived. If even the second attempt disappears, the panel says so instead of leaving you to guess.
- Fixed: when Claude Code did start a turn of its own with a message you had added mid-turn, the panel stayed idle for the whole of it - no spinner, no timer - because the turn had not been started from the panel. Work that begins on its own is now reported like any other.

## [0.7.18] - 2026-08-20

- Fixed: the five-hour ring showed a share belonging to a window that had already reset - 99% used while the account was barely into a fresh one - and the number flipped between two values from one minute to the next. The panel asked whichever process was at hand and drew the answer as it came, and the two paths do not agree. A conversation learns its share from the server's replies to its own requests, so a process that is not working repeats the last share it saw for as long as it stays open: a tab left open overnight answered with yesterday's window all day. A one-off ping asks the server for a summary instead, and that summary trails a few minutes behind. A share is now shown only for the window it names: once the reset time has passed, the ring starts from zero and waits for real numbers, and within one window the panel keeps the highest share it has seen, so a lagging answer no longer drags the ring backwards. An answer about an expired window also sends the panel straight to the server, instead of trusting the process that gave it. The tooltip no longer claims "Resets in soon" for a window whose next reset nobody knows yet - it starts with the first turn.
- Changed: the usage rings refresh every thirty seconds now, and again the moment a turn ends. While a turn runs the question is free - it goes to the process that is already working, and that process knows the freshest share there is. With nothing running the panel asks the server, but no more than once a minute: that answer costs a separate short-lived process, and without conversations the share only moves if you are working in the terminal or in the browser. The daily token count keeps its own slower round - it is a scan of every project's transcripts.

## [0.7.17] - 2026-08-19

- Changed: a file dragged with the mouse out of the Commit tool window is no longer accepted by the panel, and the panel no longer lights up for it. That window hands over its own object full of changes rather than plain files, and the only way to read paths out of it is an API the platform keeps closed to plugins - which is what the Marketplace turns a release down for. Every other way in is untouched: the project tree, editor tabs, your file manager, the attach button, and naming a file as you type.

## [0.7.16] - 2026-08-19

- Fixed: a technical warning from Claude Code itself - about how an MCP server's stored credentials are kept, for instance - turned up in the feed as a red error, in a conversation that was running perfectly well. Anything the CLI said outside its stream of events counted as a failure of the conversation, and the CLI uses that channel for ordinary warnings from its own libraries too: notes about something you never broke and cannot fix. Such lines now go to the IDE log instead. They still reach the feed in the one case where they explain something - if the process dies on its own, its last words are shown as the reason the conversation ended.

## [0.7.15] - 2026-08-19

- Fixed: subagents started by a skill - the ten of them a `/code-review` fans out, for instance - disappeared from the header the moment the turn that launched them said so, even though every one of them was still working. The panel had nothing left to show that anything was going on: no chips, no "Waiting for 10 subagents" under the feed, and the run looked like it had simply stopped answering. A turn cannot end while it waits for a subagent, so anything still working when a turn ends by itself now stays in the header, with its timer running, until its own result arrives. A turn stopped by hand is a different matter and still closes off the work it was standing on.
- Fixed: a conversation opened from History greeted you with a question card floating over the input field - options and all - for a question that had been asked, and usually answered, days ago. The answer was already there in the feed as your own next message; the card was a leftover of the replay, and it held the panel until dismissed. Questions and plans that come back with a replayed conversation are now read as part of its history: they no longer ask for a decision, and the run no longer reports itself as waiting for you.
- Changed: a conversation picked in History now opens in the tab you picked it from, instead of quietly adding one more tab next to it. Tabs are yours to open, close and arrange, and a look into a past conversation used to cost you tidying up afterwards. The conversation the tab was showing is not lost - it stays in the same History it was opened from. A tab that is still working asks first, because taking it over ends the run inside it.

## [0.7.14] - 2026-08-18

- Changed: the line under the feed went back to always saying "Claude is thinking" while a turn runs, instead of naming the current call or file ("Running ...", "Reading ..."). That call already has its own card in the feed right above the line, so the two were saying the same thing twice.
- Fixed: a tool call collapsed into a plain "N tools" count sat one pixel shorter than the same row showing a named call, so the card's height ticked by a pixel on every collapse and dragged the "Claude is thinking" line under it along with it. Both now hold the same height.
- Fixed: the thinking card had its own border and background, and sat noticeably further right than the tool call it was grouped with, so the two looked like they belonged to different parts of the interface. It now matches the tool call's plain look and indent exactly.

## [0.7.13] - 2026-08-18

- Fixed: the "Claude is thinking" line under the feed sat noticeably further right than every card above it, so it read as misaligned rather than part of the same feed. It now lines up with the rest.

## [0.7.12] - 2026-08-18

- Fixed: the line under the feed changed faster than anyone could read it, flicking between the current call and "Claude is thinking" several times a second, so all you saw was twitching. It now holds whatever it says for two seconds before moving on. What happens during those two seconds is not queued up and replayed afterwards: when the wait is over the line names what is happening right now, and everything that ran past in between is already a card in the feed above it.
- Changed: thinking is now one card per stretch of work instead of one card per thought. The model thinks between almost every pair of calls, and each thought took a card of its own, cutting the feed into slices of thought, call, thought, call, with nothing readable left. The card shows the latest thought, counts how many are behind it, and opens to all of them in full. The calls in between are back to being one group as well, because a thought no longer wedges itself between them.
- Fixed: the thinking line showed raw formatting - asterisks around words, hashes in front of them - because the model thinks in the same markup it writes answers in, and a single clipped line has nothing to make bold. The markup is now stripped for that line; the numbering of a list survives it, since that is part of what was said.
- Fixed: past an hour, elapsed time dropped its seconds and stood at "1h 02m" for a whole minute at a time, which reads as a run that has frozen. It now says "1h 02m 05s".
- Fixed: the small labels in front of calls and thoughts sat a pixel below the text next to them.

## [0.7.11] - 2026-08-18

- Added: the line under the feed now says what Claude is doing at this moment - "Reading build.ts", "Searching for retryLabel", "Running the type checker" - instead of one "Claude is working" that stood in for every kind of work there is. Everything needed for that answer was already in the stream: which tool was called, on what, and the sentence the model itself writes about why it is making the call. The terminal shows a line like this too, but it composes its own with a separate request to the model, and that line never reaches the panel - so the panel now says it from what it already knows. It replaces itself as the work moves on instead of piling up: this is a caption for the current moment, and anything worth keeping is already a card in the feed above it. Calls made all at once are counted rather than listed ("Reading 3 files"), a subagent is named by what it introduced itself as, and in the pauses between calls - where the run really is only thinking - the line says which item of its own task list it is thinking about.
- Added: the panel now tells you when a request to Anthropic failed and is waiting to be retried, instead of standing perfectly still. Claude Code retries an overloaded or failing API on its own, waiting longer before each attempt - up to ten of them, which together can run into minutes - and none of that used to reach the panel: nothing arrived in the feed, while "Claude is thinking" kept counting up, so a conversation that was merely waiting on someone else's servers looked frozen or broken. A card in the feed now names the refusal the way the terminal names it - "API overloaded", "Rate limited" - counts the attempts and ticks down to the next one, and the line under the feed says the same in a sentence, with how long the wait has lasted so far. When the request finally goes through, the card stays behind as a record of where those minutes went; a hiccup shorter than five seconds leaves no trace, because it isn't one. If the retries run out, the card says that too, instead of vanishing and leaving only the error to explain itself.
- Fixed: a conversation opened from History showed only one side of itself - Claude's answers and tool calls, with your own messages missing entirely, so the whole thing read as if nobody had asked for any of it. In a live conversation the panel puts your message into the feed itself, at the moment you send it; a replayed one has no such moment, and the saved record was never read for them. Slash commands come back as commands (`/deploy 0.7.11`), and each message carries the time it was actually said rather than the time the tab was opened. The CLI's own bookkeeping - skill instructions, image captions, the note it leaves when a request is interrupted - stays out of the feed, since none of it was said by you.
- Fixed: a conversation opened from History could show subagents as if they were running right now - a chip in the header with a ticking timer and a "stop" cross, and "Waiting for N subagents" under the feed - even though a tab just opened from history runs nothing at all. A background agent reports how it ended through a separate system event, while the saved conversation keeps only the messages, so that report could never reach a replayed card: it stayed "running" for as long as the tab was open, and its timer counted from the moment the tab was opened rather than from the agent's own start. The panel now closes off whatever the replay leaves unfinished, the moment the replay has played out, and marks those cards with what is actually known - that how they ended is not part of the saved conversation.
- Fixed: an error from Claude Code could appear twice in a row - once as an ordinary answer, once as the red bar right below it, word for word. The CLI reports a failed request through both channels at once, and the panel only knew how to skip the second one when the red bar happened to arrive first. The red bar now wins in either order: it names the thing an error, and it can be dismissed. Links inside it are live too, so the "check https://status.claude.com" an API error usually ends with is one click away instead of something to retype by hand.
- Fixed: a file dragged from the Commit tool window into the panel was refused - no highlight under the cursor, nothing added to the input field - while the very same file dragged from the Project tree arrived as a chip the way it always had. The list of changes is the one file tree in the IDE that hands over something other than files when you drag from it: it passes its own changes, because inside that window they are dragged between changelists rather than out of it. The panel asked the platform to read the drag as a list of files, got nothing, and concluded there was nothing to accept. It now reads that shape too - modified files by where they are on disk now, plus untracked and ignored ones, which the same object carries separately. A file that the change deletes has nowhere to point, and is left out rather than turned into a chip that leads nowhere.
- Fixed: the IDE could show an internal plugin error about class initialization ("Class initialization must not depend on services"), usually right after startup, with the plugin named in the title even though the failing code is the IDE's own. Bringing up the embedded browser makes it read the IDE's proxy settings from inside a static initializer, which the platform forbids - and the complaint goes to whoever brings the browser up first in that IDE process. A panel restored from the previous session opens early enough to be that first one. The settings are now read up front, the ordinary way, so there is nothing left for the initializer to set up and nothing to complain about.

## [0.7.10] - 2026-08-18

- Updating the plugin now asks for a restart of the IDE up front, instead of warning afterwards that the plugin "didn't unload fully, this may cause functionality issues". The warning was telling the truth: the panel hands its interface to the embedded browser through a handler registered with the browser engine for the whole life of the IDE, and nothing can take that registration back. Swapped in place, the plugin left the old handler behind - so a freshly updated plugin would have gone on serving the previous version's interface on top of its new code. Conversations and their running processes don't survive such a swap either way, so a restart loses nothing and the misleading warning is gone.

## [0.7.9] - 2026-08-17

- Fixed: an unknown slash command left "Claude is thinking" and its timer running forever. A command the CLI refuses outright - a typo, or one belonging to an MCP server that didn't come up this time - is answered without ever reaching the model, so its finish carries no turns at all; the panel mistook that for the startup of a conversation, which it deliberately ignores, and nothing was left to close the turn out.
- Fixed: switching the effort level while a reply was still being generated swallowed the rest of that reply, its finish included, and again left the panel thinking forever. The panel sends that switch as an ordinary message and hides the answer to it until the next finish - which belonged to the turn already running. The switch now waits for the current turn to end; it only ever applied to the next turn anyway.
- Fixed: a long burst of events could vanish on its way into the panel, silently, taking the end of the turn with it. Everything is handed to the interface in one string, and too long a string never arrives - no error, nothing in the log. Turns with many parallel subagents, where every event carries a whole report, hit that limit easily: the feed stopped mid-turn and the spinner ran on. Long bursts are now delivered in pieces.
- The end of a turn now also reaches the panel by a second, independent route, straight from the IDE. However the finish event is lost or misread, work stops looking like it's still going.
- Fixed: stopping a turn left whatever was running at that moment - a command, a file search, a subagent - showing as "running" forever, each with its own ticking timer, right under a turn already marked "Stopped by you". Those cards are now closed off along with the turn, and marked with why. Background agents are untouched: they legitimately outlive the turn that launched them.
- Fixed: when a conversation's process couldn't be started or couldn't be written to, the panel showed the error and went on showing work in progress next to it.

## [0.7.8] - 2026-08-17

- Fixed: sending `/clear` while a reply was still being generated could leave "Claude is thinking" and its timer running forever. The turn's own end never arrives once the conversation it belonged to is gone, and `/clear` itself wasn't closing that turn out the way a normal finish does.
- Fixed: launching a background agent closed its card and cleared its "still working" status right away, even though the agent kept running for a while after. The CLI's immediate "launched in background" acknowledgment was mistaken for the agent's actual result — the card now waits for the real completion notification instead.
- Fixed: `/clear` sent while the context was being compacted could leave the main status line blank for the rest of that tab, silently, for every turn after. The flag behind that blank line never got cleared by `/clear` the way a normal end of compaction clears it.
- Fixed: commands run through `!` in the input field couldn't see shell aliases from `.zshrc`/`.bashrc`, even though the very same command worked in a real terminal. The shell was started as login-only, which doesn't read the file where most people's aliases live; it's now started the same way an interactive terminal session would be.

## [0.7.7] - 2026-08-17

- Fixed: the IDE could show an internal plugin error ("Already disposed"), most visible right after startup. A conversation's process reports it finished on its own background thread, and that report could still land after the panel it belonged to was already torn down (project closing, panel rebuilt) - the panel tried to schedule a screen update through an object that no longer existed. Such late reports are now dropped instead of crashing.

## [0.7.6] - 2026-08-17

- Fixed: a background agent's own tab (opened from its chip above the feed) went quiet as soon as its log had a first line, with nothing left to say whether it was still running — the "Working…" placeholder covered only the moment before that. The tab now carries the same ticking timer its chip already showed.
- Fixed: the main feed's status line went blank whenever any parallel background agent compacted its own context, not only when the main conversation did. The flag behind that line was shared by the whole session instead of belonging to whoever was actually compacting, so one agent's housekeeping silenced everyone else's status.
- Fixed: when a turn launched a background agent and finished right away without waiting for it, the status line disappeared along with the turn, and nothing below the composer said an agent was still working — the chip's dot color was the only trace, easy to miss without already knowing what it meant. A quiet "Waiting for subagent" line now covers that gap until the agent reports back.

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

[Unreleased]: https://github.com/crmapache/amazing-claude-code/compare/0.7.23...HEAD
[0.7.23]: https://github.com/crmapache/amazing-claude-code/compare/0.7.22...0.7.23
[0.7.22]: https://github.com/crmapache/amazing-claude-code/compare/0.7.21...0.7.22
[0.7.21]: https://github.com/crmapache/amazing-claude-code/compare/0.7.19...0.7.21
[0.7.19]: https://github.com/crmapache/amazing-claude-code/compare/0.7.18...0.7.19
[0.7.18]: https://github.com/crmapache/amazing-claude-code/compare/0.7.17...0.7.18
[0.7.17]: https://github.com/crmapache/amazing-claude-code/compare/0.7.16...0.7.17
[0.7.16]: https://github.com/crmapache/amazing-claude-code/compare/0.7.15...0.7.16
[0.7.15]: https://github.com/crmapache/amazing-claude-code/compare/0.7.14...0.7.15
[0.7.14]: https://github.com/crmapache/amazing-claude-code/compare/0.7.13...0.7.14
[0.7.13]: https://github.com/crmapache/amazing-claude-code/compare/0.7.12...0.7.13
[0.7.12]: https://github.com/crmapache/amazing-claude-code/compare/0.7.11...0.7.12
[0.7.11]: https://github.com/crmapache/amazing-claude-code/compare/0.7.10...0.7.11
[0.7.10]: https://github.com/crmapache/amazing-claude-code/compare/0.7.9...0.7.10
[0.7.9]: https://github.com/crmapache/amazing-claude-code/compare/0.7.8...0.7.9
[0.7.8]: https://github.com/crmapache/amazing-claude-code/compare/0.7.7...0.7.8
[0.7.7]: https://github.com/crmapache/amazing-claude-code/compare/0.7.6...0.7.7
[0.7.6]: https://github.com/crmapache/amazing-claude-code/compare/0.7.5...0.7.6
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
