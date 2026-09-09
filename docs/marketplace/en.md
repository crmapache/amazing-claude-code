# Amazing Claude Code GUI

**Claude Code as a chat panel in your JetBrains IDE.** Cards instead of terminal scrollback,
files you point at instead of paths you type, and your code right next to it.

It drives the Claude Code CLI already on your machine, so your account, models, slash commands,
permission rules, MCP servers and skills all come with it. No proxy, no account of ours.

🌐 **English** | [简体中文](zh.md) | [Русский](ru.md) | [Українська](uk.md) | [Español](es.md) | [Português (Brasil)](pt.md) | [Deutsch](de.md) | [Français](fr.md) | [日本語](ja.md) | [한국어](ko.md)

## Why this one

- **A round of work, written once and run for you.** Scenarios: a few cards, each a Claude
  session of its own - implement, review, fix, run the tests - in stages that can go round more
  than once, with a main thread walking them and judging what each one found. Run one by button,
  three at once against three tickets, or on a clock at nine every weekday with its questions
  answered in advance. Describe the round in a sentence and Claude reads the project and writes
  the form.
- **The whole panel from your phone, not just a "yes" button.** Answer a permission or a plan,
  open a project that is closed, read yesterday's chat, fork, change the model and the effort,
  switch the account, sign in to a connector, dictate, watch a scenario run and unblock it. Off by
  default, paired by QR code, end-to-end encrypted through a relay that cannot read a word,
  revoked in one tap.
- **Several Claude accounts, switched in one click.** Work and personal on one machine without
  signing out of either. Every row shows what is left of that account's five-hour window and its
  week, and Select moves every open chat onto it.
- **Search across every conversation of the project.** Prefixes, typos, word stems, phrases in
  quotes; this chat or all of them, with a jump straight to the message in its chat. When words
  are not enough, describe what you are looking for and Claude reads the conversations for you.
- **Everything it does is on screen.** Every tool call with its duration, every edit as an open
  diff, subagents and whole fleets of workflow agents with each agent's own transcript a click
  away, the task list ticking off, and what the turn cost. An overloaded or rate-limited API is a
  card with the reason and the countdown, not silence.
- **Nothing answers for you, and nothing is lost.** A permission, a plan or a question waits as
  long as it takes - no timeout, no auto-continue. Conversations keep going with the panel
  collapsed or the project switched, and messages written during a turn wait in a queue the IDE
  keeps.
- **Android Studio included**, along with every JetBrains IDE from 2026.1 on.

## Getting started

1. Have Claude Code installed and working in a terminal - the panel drives that CLI.
2. Open the panel from the tool window button on the side bar. If you are not signed in, one
   button does it in the IDE's own terminal.
3. Write your message. Drag files or folders into the field, type `@` for a project file, `/` for
   a command, `!` to run something in your shell.
4. Right-click a selection in the editor and choose "Send to Amazing Claude Code GUI" to send a
   precise file-and-line reference instead of pasted text.
5. Model, effort and permission mode are the three buttons under the field, and each belongs to
   the tab you are looking at.

## Also in the panel

- **Point at files, do not type them.** Drag one in, type `@` to pick it, paste a screenshot or
  a long log - each lands as a chip you cannot mistype.
- **Send code with its address.** Select lines, "Send to Amazing Claude Code GUI", and the agent
  reads the real file around them instead of a snippet with no context.
- **Paths open files.** A path anywhere in the conversation - the head of a card, an answer, an
  error, your own message - opens the file in the editor at the line it names; an edit opens on
  the edit itself.
- **Grab any part of an answer.** Quote it into your next message, fork the conversation from
  that exact point, pin up to three messages above the chat, or take a sent message back into the
  field to fix and resend.
- **Model, effort and mode change mid-conversation**, per tab, without restarting anything. What
  a new chat starts with is yours to set, and a model of your own server can be added by hand.
- **MCP servers, plugins and marketplaces** on screens of their own: which server is up, which
  wants a sign-in, which fell over and why.
- **History** of this project's past conversations, terminal ones included, opened from the end
  and paged back on demand.
- **A queue** for messages written while a turn is running, reorderable by drag.
- **`!` runs a command in your own shell**, and the output travels with your next message,
  costing no turn and no permission prompt.
- **Improve prompt** - the sparkle rewrites your draft in a run of its own, costing your
  conversation no context, and one button puts your words back.
- **Voice input** with a Deepgram key of your own: hold a hotkey, even from the editor.
- **Sound alerts** for the seven moments worth one, and only when you are not already looking.
- **Statistics** of hours, habits and achievements, shareable as a picture.
- **Ten languages**, following your IDE by default.
- **Your unsaved buffers** are written before a turn, and files the agent changed are re-read at
  once.
- **A side panel, not an editor tab**, on any edge of the window; numbers pick an option,
  Shift+Tab cycles the mode, Escape stops the turn.

## Privacy and transparency

- **Everything runs on your machine.** No proxy, no server of ours in the middle. Your Claude
  sign-in belongs to the CLI - the plugin never reads it or hunts for API keys on your disk.
- **No telemetry, no analytics, no account.** With remote access off, the only thing that ever
  leaves is a feedback report you write and send yourself - and one button shows its exact text
  first.
- **Your permission rules stay yours.** The CLI decides what to ask about, with your settings,
  rules and hooks. The plugin adds no hook of its own and never starts a session in a laxer mode
  than the one on screen.
- **Source available** on GitHub under the Elastic License 2.0, and the
  [privacy policy](https://relay.mzpizote.com/privacy) lists everything that can leave the
  machine.

## Requirements

Claude Code installed and signed in, and any JetBrains IDE from 2026.1 on, Android Studio
included. Android Studio has no embedded browser of its own, so the IDE offers to install
JetBrains' browser plugin alongside this one.

## Links

- [Source code](https://github.com/crmapache/amazing-claude-code)
- [Report a bug or ask for a feature](https://github.com/crmapache/amazing-claude-code/issues),
  or use the form in the panel
- [Privacy policy](https://relay.mzpizote.com/privacy)
