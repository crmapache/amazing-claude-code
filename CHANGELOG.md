# Changelog

All notable changes to Amazing Claude Code. The section for the version being
built is what the Marketplace and the IDE's update dialog show, so every release
lists only its own changes. Entries up to 0.7.4 were reconstructed from the
plugin's git history: until then all releases shared one ever-growing block of
notes, and a few releases never updated it at all — those are described by their
commits.

## [Unreleased]

## [0.8.0] - 2026-08-26

- Fixed: signing into another account could leave the previous one's percentages on the limit rings. Everything known about the limits is deliberately forgotten at the moment of the switch - but a question sent a moment before it was not, and its answer, arriving a second later, put the old figures quietly back where they had just been wiped. There they stayed until the window reset. An answer now belongs to the account it was asked on behalf of, and one about an account you have left is dropped.
- Fixed: a switch to another account was not always noticed, and a check that merely failed to answer in time was taken for one. An account is now told apart by more than the address on it - one address can stand behind a personal account and behind a workspace that invited it, and the rings belong to one of the two. A question the CLI did not answer in time counts as no news rather than as "signed out", which used to wipe the figures and send the panel out for fresh ones over a hiccup.
- Fixed: with the panel open, the whole of the "just signed in" start ran again every five minutes, per open project: the limits asked for past their own throttle, and every conversation on disk read again to count the day's tokens. The round that watches for an account switched in a terminal asks the same question as the sign-in itself, and the answer "signed in" was taken as news every time. It is news only when it changes.
- Fixed: the strip of tabs could not be reached from the keyboard at all - not the conversations, not the statistics tab beside them. Every tab now takes focus in turn and opens with Enter or Space, the strip says what it is to a screen reader, and the crosses have names instead of being read out as "×".
- Fixed: the hints on the model, effort and mode buttons, and on the branch's pull request, never unfolded. They were left to the browser's own kind of hint, which inside the IDE shows nothing at all - so the one place with something to read stayed silent: a MODEL button wearing its accent could not say why it wore it. All four now use the panel's own hints, as do the ones in the feed itself - stopping an agent or a command, copying a block - and the accented one says which model the agent moved the conversation off, and that it was not you who moved it.
- Fixed: a message queued from a phone disappeared - neither sent nor waiting anywhere - and the conversation simply stopped after the turn it was queued into. The queue was a piece of the open screen's memory, and a phone's screen is not a place to keep anything: the browser throws a page out while it sits in a pocket, leaving the thread and coming back was enough on its own, and the send that did happen was dropped without a word if the line was down at that second. Putting the phone away is, of course, exactly what one queues a message in order to do. The queue now lives beside the conversation, in the IDE that will send it: it fires the moment the turn ends, whether or not anyone is looking, and survives a reload, a walk out of the chat and a night in a pocket.
- Changed: the panel and a phone now show one queue rather than one each. What was queued from the sofa stands in the panel's list at the desk, and either of them can take a message out of it or drag the order about; the panel's own queue also outlives a reload of the panel now, which it never did.
- Fixed: a question with options stopped a conversation dead on a phone. The line above the feed said "Waiting for you", and there was nothing anywhere to answer with: a question is not drawn in the feed - the panel pins it over the input field instead, and a phone has no such panel - while the one way through to the screen where decisions are taken went by permission requests alone. So the strip never appeared, and the only way on was to walk to the desk. It now appears for a question and for a plan as well, says which of the three is waiting, and the rule behind it is the same one the status line goes by, so the two cannot disagree again.
- Fixed: the decision screen on a phone offered "Approve & run" over the last plan the conversation had ever shown, whether or not anybody was being asked about it - and a plan shown once masked every question that came after it. It now shows what is actually holding the turn: the permission first, then the plan, then the question.
- Changed: a question on a phone is shown in full - the question itself, and under each option the line that says what choosing it means. Only the labels were shown before, which meant opening the conversation to find out what the choice was between - the very trip that screen exists to save. A call that asks several questions is answered one at a time, with a count of how far along it is, and the answer travels when the last one has been picked.
- Fixed: a plan approved or a question answered at the desk left a phone still saying that something was waiting for you, and the other way round. Both were told about it all along and neither was listening.
- Fixed: changing the model at the desk put "MODEL Fable 5 → Opus 5 1M, switched by Claude Code, not by you" into the conversation on the phone. The phone listens to the same journal the panel does, but the message announcing a model chosen by hand was among the ones it skipped, so it went on counting from the model the stream had named before the change and read the first answer signed with the new one as a swap the agent had made on its own. The one card in the feed that exists to say "nobody chose this" was saying it about a choice made a minute earlier. The phone now hears the change, and the card is kept for what it is for.
- Added: on a phone you can now read back past what was handed over. A phone is given the end of a conversation rather than the whole of it, and everything above that simply was not there - a chat opened from the sofa began wherever the handover happened to start. A line at the top of the feed now fetches the page before it out of the conversation on disk, and again, as far back as you care to go.
- Added: a Statistics tab - a tab of its own in the strip, opened from the menu's new "Statistics" row. It shows this project against every project the panel has seen, for the last week, the last month or all time: hours in the panel a day, days at work with the streak, what came out of it (turns, sessions, files, forks), a calendar of working days as far back as the panel is wide, which tools the agent reached for, where the hours went by project, the lines added and taken away, and the sessions, models and forks behind it all. Time is counted by the minute from three signs at once - a turn running, a message or a decision, a hand on the keyboard - so nothing is counted twice. The figures live in one book for the whole machine (the directory every JetBrains product shares), so WebStorm and IntelliJ count into the same one; the book names no paths, only project names.
- Added: fifty-one achievements, five tiers each, on a screen behind the statistics tab - the habit (streaks, weekends, early mornings), the hours, the code that landed, the tools, and the way around the panel (forks, history, the phone, the ceiling, the heart). One of them is earned by staying away: "Home for the holidays" counts the days between Christmas Eve and New Year's Day the panel stayed shut, once each day is over, and keeps counting winter after winter. Every one is measured by a figure that only grows, so a tier once earned stays earned, and the moment it was crossed is written down whether or not the panel was open. "Rollback" counts the edits turned down at the permission door - the panel has no other way of taking a diff back. The four earned most lately stand on the tab itself, and the one nearest its next line is named beside them.
- Changed: the Statistics tab is dragged about the strip like any other tab. It used to sit at the end whatever you did with it: the rearrangement walked the conversations alone, and that tab is not one of them, so a press and a pull moved nothing at all. It now takes part as a group of its own - carry it anywhere in the row, drag conversations past it, and it keeps the place you left it in when a neighbour closes beside it. Where it stands is this window's own business: the conversations' order, which every client of the project shares, hears nothing about it.

## [0.7.28] - 2026-08-26

- Changed: on a phone each of the two limit rings carries its percentage beside it, exactly as the panel's own rings do. A ring says "filling up" at a glance, but "how much" is what one looks down at that row for, and the figure used to be a tap away in the limits sheet - a tap to read three characters. It stands in the ring's own pace colour, in digits of one width so an update cannot jerk the branch along the row. The two rings that have nothing to say keep no figure: one burning because the work is being billed past the plan is stuck at a hundred, and a window nothing is known about yet keeps its empty track rather than an honest-looking "0%". Behind the tap stays what a phone has no hover to show - which limit this is, and how long until it resets.
- Changed: the heart at the end of the model/effort/mode row is a little wider than it is tall. As a square its frame sat too close to the heart's own outline for the two to read as separate things.

## [0.7.27] - 2026-08-26

- Fixed: the panel put up a red "your 5-hour limit is used up" while the agent carried on working without a pause, so the one alarm that should be trusted read as noise. A used-up limit is not the same as a halt, and Claude Code knows three ways it is not: with extra usage the requests go through and are billed on top of the plan, during the grace period the step under way is allowed to finish, and a signal whose window has already reset describes a window that no longer exists. The panel read none of that and called every one of them a breakage. Now each is what it is. Work being paid for past the plan says so, quietly, and stays out of the way. A genuine stop is not an error either - nothing is broken and there is nothing to fix - so it reads as waiting and says until when, with the time counting down, and takes itself off the moment the window resets. The sound and the phone's notification are kept for that last case alone.
- Added: while the work is being billed past the plan, the ring for the window that ran out burns - closed, painted its own colour, without a figure beside it (that figure is stuck at a hundred and says nothing any more), with sparks coming off it and drifting up. Its tooltip says which window is used up and how much of the month's extra usage has gone. The ring that burns is the one being paid past: an exhausted week no longer reports itself on the five-hour ring, which at that moment is perfectly fine. A phone shows the same thing, on its own rings and in the sheet behind them.
- Fixed: on a phone the counter beside "Claude is thinking" opened a turn at a negative number and counted its way up to zero. Everything a phone knows about when things happened is stamped by the machine with the IDE, and answering "how long has this run" against the phone's own clock subtracts one machine's time from another's - two clocks agree only by luck. The phone now keeps an estimate of the difference, refreshed by every list of conversations it receives, and asks that instead of itself.
- Changed: a phone's home screen. The plugin's mark stands in its header, so a client opened from a bare address says whose it is. A conversation's state is a coloured dot at the start of its row rather than a word at the end of it - the same mark and the same colours the panel's tabs carry, in the same order: a dead process first, then what is waiting for a person, then work in progress, then work already done, and unlit for a conversation that has never done anything. Whether anything on the list needs answering is now answered by colour, before a single title is read. Both ways out of a project's card - back into a past conversation, or forward into a new one - sit together at its foot, the new one as a square with a plus; on a project the IDE does not have open it keeps its words and the whole width, since there the tap opens the project too. The corners across the client are a step rounder than the panel's rather than three steps, because a screen of capsules has no edges left to tell one surface from another.
- Fixed: a slash command that arrived in the field ready-made - pasted from the clipboard, or sent with Enter straight after its own name - stayed plain text where a typed one became a chip. The agent read the same command either way, but in the feed the same thing looked like two different things depending on how it had been written. A pasted command also cost an extra Cmd+Z that changed nothing on the screen, because one edit had reported itself twice.

## [0.7.26] - 2026-08-25

- Fixed: the commands your MCP servers add - the long "/mcp__server__prompt" ones - were missing from the field's hint until you had sent a message, so a panel just opened answered one typed from memory with "Unknown command" and only started suggesting it from the second try. Commands that live in files the panel finds by itself, but an MCP server's ones exist in no file at all: the agent asks every connected server for them when its process comes up, and that process only comes up with your first message. The panel now remembers the list the agent named last time and offers it from the moment it opens, correcting it against the real one as soon as a conversation starts. A phone gets the same list, where those commands could not be offered at all before. The first ever conversation in a project is still the exception - there is nothing remembered yet to offer.
- Changed: the heart at the end of the model/effort/mode row is a proper square now, the size of the paperclip and the slash beside the message field, with a slightly larger heart in it. At the selectors' height it read as a squat little rectangle rather than as a button.

## [0.7.25] - 2026-08-25

- Fixed: a tab opened with "+" stayed called "new session" for the whole conversation, however much was said in it. The panel handed the shell that stand-in as if it were a name, and a tab that already carries a name is never renamed afterwards - neither by the guess made from your first message nor by the real name the model picks a second later. Only the tab the panel starts with was spared, since nobody ever named that one. A tab now opens with no name at all, which is what the phone has always done, and gets one from its first message like any other.
- Fixed: starting a tab with a skill or a command - "/code-review", "/deploy" - left it unnamed even so. The rule about which message is worth naming a conversation by threw away every command that carried no arguments, on the grounds that it was housekeeping like /clear or /compact. Now only the genuine housekeeping is skipped - clearing, compacting, signing in and out, the settings - and a command that is the work itself names the tab it runs in. Housekeeping is skipped whatever arguments it carries, too: a conversation should not be named after the instructions given to /compact.
- Fixed: the outcome of /code-review arrived in the feed as a wall of raw JSON in which neither the number of findings nor a single file could be seen without scrolling through the whole thing. That command is carried out by Claude Code itself rather than by the model, and in the terminal a screen of its own catches its output and draws it; the panel had nothing to catch it with. Findings now come as a card: how many at the top, then a row per finding with the file, the line and what kind of thing it is, the claim itself in one sentence under it, and the evidence behind a click. What the review said around the findings stays in the feed as the answer it was. The phone shows the same card - it draws the same feed.
- Fixed: a past conversation opened from the history lost the output of every command Claude Code ran by itself: /code-review, /cost and their like stood in the conversation with nothing after them, as though they had never run. Live, that output arrives as an ordinary answer, but the transcript on disk files it away as an internal entry the feed did not draw. It is drawn now, so the findings of a review read the same whether the conversation is the one in front of you or one you came back to.

## [0.7.24] - 2026-08-25

- Added: the message field on a phone now carries what the panel keeps around its own. The five-hour and the weekly window stand as rings above it, the branch you are on with its pull request beside them, and how full this conversation's context is on the field's own top edge. A tap on either ring opens what the desk keeps in a tooltip - how much is spent, when the window resets, and the even pace to check the week against - because a touchscreen has no hover to put a tooltip under. The pull request opens in the phone's own browser rather than on the machine with the IDE.
- Added: slash commands on a phone. A "/" in the field opens the same list the panel offers, narrowing as you type, and it knows the commands and skills your project keeps on disk, not only the built-in ones; there is a button for it beside the field too. The four the panel runs itself - resume, fork, login and logout - are deliberately absent: they are not commands any agent knows, and two of them would open a terminal on your machine, which a phone may not ask for.
- Added: naming a project's files from a phone. An "@" in the field opens the project's files, read from the caret rather than from the start of the message, so a file can be named in the middle of a sentence as in a terminal. Each row shows the name above its folder, which is what tells two files of the same name apart on a narrow screen. What you pick is written into the message exactly the way the panel writes it, so the agent reads the same thing whichever screen sent it.
- Added: attaching a photo from a phone. The paperclip opens whatever that phone offers - the photo library, the camera, a file from a cloud folder - and the picture is made small enough to travel before it goes. That last part is not a nicety: a modern phone's photo is several megabytes, and what carries a message between your phone and the IDE throws away anything oversized whole rather than shortening it, so an untouched snapshot would not have arrived at all and nothing would have said why. Photos only, and that is a limit of the line rather than a preference - bytes are the only attachment it carries, and a file on a phone has no path the agent on your machine could read.
- Changed: the message field on a phone is the full width of the screen now, with the buttons in a row beneath it instead of pressed against its side.
- Fixed: while the agent was working, a phone offered only "Queue" - a message could wait its turn but could not reach the turn in progress. Send now stands beside it, together with Stop, so all three answers to a busy agent are on the screen at once: say it now, say it next, or end the turn.
- Changed: the tooltip on the weekly ring counts what is left of a long window in days rather than in hours. "1d 16h" is read at a glance; "40h 12m" is a number that has to be divided first.
- Added: a heart at the far end of the row the model, the effort and the mode stand in, and behind it the two ways to say thanks - a star on the plugin's repository on GitHub, or a rating on its Marketplace page. Both open in your own browser and neither touches your accounts from inside the panel: GitHub has no address that stars a repository merely by being opened, starring is a write to the account, and asking for permission to write to your repositories in exchange for one star is a bad bargain. So the button opens the page honestly and the star is pressed where it lives. The heart is in every layout - beside the selectors in the default one and in compact, in the row of buttons at the end of the side rail under left and right.
- Fixed: the model selector could start naming a model nobody had chosen, with not a word said about it. Claude Code moves a conversation to another model by itself when the chosen one's safeguards flag a message - an audit of your own code for security holes reads as "cyber" to them - and that swap holds for the rest of the session. The panel followed it honestly, since it names the model genuinely at work, but said nothing about it; the agent, meanwhile, cannot see that event at all and knows only what its system prompt tells it, so asked about the swap it will insist it never switched anything. Now the swap leaves a card in the feed - which model, which one now, and why in the CLI's own words, with its link to the article about those safeguards - while the MODEL button wears an accent for as long as the conversation is not on your choice and says in its tooltip whose doing it was. The captions name a generation as well ("Opus 4.8" rather than a bare "Opus"), so a model swapped in cannot pass for the one you picked.
- Fixed: choosing "Opus (1M context)" - or "Default" - held for a few seconds and then the button dropped to a bare "Opus", a model that stands in no menu, as though the panel had reset the choice by itself. Nothing was reset: the same model reaches the panel under three different names - the choice ("opus[1m]"), what the catalogue expands it into ("claude-opus-5[1m]") and the signature under an answer ("claude-opus-5", sometimes with a build date on the end) - and the panel compared those names as plain text, so the first answer to arrive looked like a move to a different model. What tells models apart is the family and the generation; the window mark and the build date are now read for what they are, and the caption stays on the model you chose for as long as the conversation is genuinely on it.
- Fixed: on a phone, an answer being printed made the conversation impossible to read: a finger moving up was dragged back to the bottom within a fraction of a second, and the text shuddered the whole time it arrived. There were two scrollers stacked one inside the other - the screen's own and the feed's - and the screen kept itself pinned to the bottom by jumping there on every chunk of text, whatever the person was doing. Scrolling now belongs to the feed alone, the same one the panel uses: it holds the bottom until you scroll up, lets go the moment you do, and offers a button back down with a count of what arrived meanwhile. The reveal wave the text appears with has also lost its per-word blur on a phone - a filter on every word is the one part of that animation a phone pays for, and it paid in stutter.
- Removed: the "accept" and "reject" buttons beside every piece of an edit. They looked like a decision and were not one: the first wrote a tick into the panel's own memory, the second wiped it, and neither reached the agent, the IDE or the file. Nor could they - a card like that appears after the edit has already been written to disk, so there was nothing left to accept or turn down. The diff itself stays, in full. Turning an edit down before it happens is a thing the panel genuinely does, and it lives where it belongs: a call that stops and waits for your permission.

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

[Unreleased]: https://github.com/crmapache/amazing-claude-code/compare/0.7.29...HEAD
[0.8.0]: https://github.com/crmapache/amazing-claude-code/compare/0.7.28...0.8.0
[0.7.28]: https://github.com/crmapache/amazing-claude-code/compare/0.7.27...0.7.28
[0.7.27]: https://github.com/crmapache/amazing-claude-code/compare/0.7.26...0.7.27
[0.7.26]: https://github.com/crmapache/amazing-claude-code/compare/0.7.25...0.7.26
[0.7.25]: https://github.com/crmapache/amazing-claude-code/compare/0.7.24...0.7.25
[0.7.24]: https://github.com/crmapache/amazing-claude-code/compare/0.7.23...0.7.24
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
