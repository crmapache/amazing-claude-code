# Amazing Claude Code GUI

**Claude Code as a chat panel in your JetBrains IDE.** Cards instead of terminal scrollback,
files you point at instead of paths you type, and your code right next to it.

It drives the Claude Code CLI already on your machine, so your account, models, slash commands,
permission rules, MCP servers and skills all come with it. No proxy, no account of ours.

🌐 **English** | [简体中文](zh.md) | [Русский](ru.md) | [Español](es.md) | [Português (Brasil)](pt.md) | [Deutsch](de.md) | [Français](fr.md) | [日本語](ja.md) | [한국어](ko.md)

## Why this one

- **Point at files, do not type them.** Drag one in, type `@` to pick it, paste a screenshot -
  each lands as a chip you cannot mistype.
- **Send code with its address.** Select lines, "Send to Amazing Claude Code GUI", and the agent
  reads the real file around them instead of a snippet with no context.
- **Grab any part of an answer.** Quote it into your next message, or fork the conversation from
  that exact point - the original stays as it was.
- **See what it is doing.** Tool calls with their duration, diffs with counts, the todo list
  ticking off, plans, subagents, whole fleets of agents in one workflow call, and what the turn
  cost.
- **No unexplained silence.** An overloaded or rate-limited API becomes a card with the reason,
  the attempt and the countdown.
- **Nothing answers for you.** A permission request, a plan or a question waits as long as it
  takes - no timeout, no auto-continue.
- **A side panel, not an editor tab**, on any edge of the window.
- **Conversations outlive the panel.** Collapse it, switch projects, come back - the agent kept
  working, and queued messages are still queued.
- **Model, effort and mode change mid-conversation**, per tab, without restarting anything.
- **Answer it from your phone.** Off by default, paired by QR code, end-to-end encrypted,
  revocable in one tap.
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

- **History** of this project's past conversations, terminal ones included.
- **A queue** for messages written while a turn is running, reorderable by drag.
- **Improve prompt** - the sparkle rewrites your draft in a run of its own, costing your
  conversation no context, and one button puts your words back.
- **Voice input** with a Deepgram key of your own: hold a hotkey, even from the editor.
- **Sound alerts** for the seven moments worth one, and only when you are not already looking.
- **Statistics** of hours, habits and achievements, shareable as a picture.
- **Nine languages**, following your IDE by default.
- **Your unsaved buffers** are written before a turn, and files the agent changed are re-read at
  once.

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
