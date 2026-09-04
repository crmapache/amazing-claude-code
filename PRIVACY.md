# Privacy

_Last updated: 29 August 2026_

Amazing Claude Code GUI is a panel for Claude Code inside JetBrains IDEs. With three exceptions, all
described below, it sends nothing anywhere: the agent runs on your machine, the conversation stays on
your machine, and the plugin has no analytics, no telemetry and no account of any kind.

The first exception is **remote access**, which lets you answer your agent from your phone. It is off
when the plugin is installed and stays off until you turn it on. Most of this page is about what
happens when you do.

The second is **feedback** - the form behind the speech bubble beside the heart. Nothing travels from
it unless you write something and press Send; see "Feedback" at the end of this page.

The third is **voice input** - dictation with a Deepgram key of your own. It is off until you turn it
on and add a key, and it records only while you hold the hotkey or the microphone button is lit; see
"Voice input" below.

## What travels, and where

When remote access is on, your conversations travel to the devices you have paired - your phone -
through a **relay**: a small server whose only job is to pass messages between two machines that
cannot reach each other directly.

What travels is the conversation itself. That means everything the agent reads and writes: **your
source code**, file paths, the output of commands it runs, your messages and its answers.

The relay is at `wss://relay.mzpizote.com`, run by the plugin's author on a server rented from OVH
and located in the United States (Virginia). Its source is public, and you can point the plugin at a
relay of your own instead - see "Running your own relay" below.

## What the relay can and cannot see

**It cannot read any of your content.** Everything inside an envelope is encrypted between your IDE
and your phone, and the relay holds no key to it. This is a property of how it is built rather than a
promise about how it behaves: the routing code reads two fixed offsets of a 42-byte header, and there
is no code on that server that parses a body, nor any dependency that could.

**What it does see:**

| | |
|---|---|
| Two random 16-byte addresses | One for your IDE, one for your phone. They are random and derived from nothing about you - but they are stable, so the relay could link your sessions over time |
| The size of each message | Not the content, but roughly how much is moving |
| The time of each message | Which means, in practice, **your working hours** - when your IDE is connected and how busy it is |
| Your IP address | Both your machine's and your phone's, as any server sees |
| How many devices you have paired | And which of them talk to which IDE |

It does **not** see: the contents of any message, your file names or their contents, the commands your
agent runs, the names of your projects, your Claude account, or your email address.

**It stores nothing on disk.** No database, no volume. Its whole state is a map of open connections
and a short buffer (two minutes) for a device that briefly dropped off the network. Restarting the
relay empties both; the two ends reconnect and catch up from the record your IDE keeps locally.

## What your phone can do

A paired phone can: read the conversation, send messages, answer permission requests, approve or send
back plans, answer questions, stop a turn, and open a new conversation.

A paired phone **cannot**: run shell commands, install or manage plugins or MCP servers, change the
permission mode, change the path to the Claude Code executable, read or write your machine's
clipboard, open files or links on your machine, or revoke or pair devices.

This is enforced on your machine rather than in the phone's interface: a message the plugin does not
explicitly permit is refused, including kinds of message that do not exist yet.

One specific case is worth naming. Approving a plan from your phone puts that conversation into
"accept edits" rather than the full "no questions" mode the same button uses at your desk: file edits
proceed, while shell commands and network access still ask - and those questions can be answered from
the phone.

## Pairing and revoking

Pairing happens by scanning a QR code shown in the IDE. The code's secret lives in the part of the
address after the `#`, which browsers never send to a server - so it cannot reach the relay's logs
even in principle. The code is valid for three minutes and works once, and the IDE asks you to confirm
the pairing, showing a fingerprint you can compare with the one on your phone.

Revoking a device is immediate and local: the IDE forgets its key, and from that moment the device's
messages cannot be opened. Nothing has to reach the phone, so **it works even if the phone is switched
off or lost.**

## Notifications

If you turn notifications on, the relay stores, for each device: a push endpoint (a URL provided by
Apple or Google that identifies your device to them), the keys the browser uses for push encryption,
and timestamps. The **text of a notification is encrypted by your IDE** and decrypted on your phone -
the relay passes it through without being able to read it.

Apple or Google will see that a notification was delivered to your device from this relay, its
(encrypted) size and the time.

## Retention

- Messages: held only while the other side is briefly offline, at most **two minutes**, in memory.
- Push subscriptions: until you turn notifications off or revoke the device.
- Server logs: what happened, the first four bytes of an address, sizes and times. Kept **7 days**.
  Message contents are never logged - not even in error paths.

## Running your own relay

The relay's source is published separately under Apache-2.0, and the plugin lets you point at any
address. If you do, everything on this page becomes "logs on your own server" instead.

See the relay's README for how to deploy it - by Docker, by Node, or on any host that can run a
small Node service.

## Feedback

The panel has a form for telling the plugin's author something - a bug, an idea, or nothing in
particular. It sends only when you press Send, and it sends only these things:

- **What you wrote**, and which of the three kinds you picked.
- **Your email address, if you filled it in.** It is optional, it is kept on your machine so you need
  not type it twice, and it is used to answer you and for nothing else. Nothing is ever sent to it by
  the plugin itself.
- **The files you attached**, if you attached any.
- **A debug report**, if you left that switch on. It is offered with a bug report only - on an idea or
  a hello the switch is off and cannot be turned on, because there is nothing for the report to describe.

The debug report is the part worth being exact about. It contains: the plugin's version, your IDE and
its build, your operating system and processor architecture, the version of Claude Code, an outline of
what the current conversation did, anything that failed, and a few counts of what the plugin did on its
own - how many messages a conversation was opened with, for instance, or that a batch of them did not
reach the panel.

The outline is a list of shapes rather than contents - "a Read call, 118 bytes in, 4 kilobytes back, at
this many seconds". It does **not** contain your messages, the agent's answers, the contents of any
file, the commands it ran, the paths on your disk, the names of your files, your project's name, or
your Claude account. File names appear only as twelve characters of a hash, so that the same file reads
as the same file without saying which one it is.

You can read the whole report before sending it: the form has "See exactly what gets attached", and
what it shows is the entire string that travels. There is no fuller version kept back for the wire.

It goes to `feedback.mzpizote.com`, a small service run by the plugin's author on the same server as
the relay, which forwards it to the author's Telegram and keeps nothing itself. Its logs record that a
message arrived, roughly how big it was and when - never what was in it. Once forwarded, the message
lives in that Telegram chat for as long as the author keeps it.

## Voice input

Voice input is off when the plugin is installed. Turning it on needs a Deepgram key of your own -
there is no service of ours in the middle, and no account with us to have one.

**Your key** is kept in your operating system's keychain through the IDE's password safe, never in a
settings file. The panel itself is never given it: the settings screen is shown the last four
characters, which is enough to tell one key from another and no use to anyone reading them off your
screen.

**While a dictation runs**, the audio from your microphone is streamed to `api.deepgram.com` over an
encrypted connection, and the words come back as text. That is the only thing that leaves your machine,
and it happens only between the moment a dictation starts and the moment it ends - the microphone is
opened when you start one and released when it finishes, so no other application is locked out of it in
the meantime and nothing is listening while you are not dictating.

**Nothing is recorded.** The audio is not written to disk, not kept in memory past the moment it is
sent, and not logged; the words come back into the input field and are yours from then on. The plugin's
own debug report never contains any of it - what a dictation writes there is that one happened, in
which language, at what sample rate.

What Deepgram does with the audio is between you and Deepgram: they are the processor here, under
whatever terms your account with them says. The plugin sends the audio, the chosen language and nothing
else - no file names, no project name, no part of your conversation.

**Dictating from your phone** works the same way, with one difference: the phone records with its own
microphone and streams to Deepgram itself, so the audio never crosses the relay. The key stays in the
keychain on your machine; what the phone is given is a token that expires after a minute and can do
nothing but transcribe - it cannot read the account, and it is worthless by the time a phone left
somewhere is opened. Your IDE refuses to issue one at all unless voice input is switched on there and a
key has been added. Everything else about voice input is unreachable from a phone: no message opens the
microphone on your work machine.

**The hotkeys** are read from the IDE's own event queue, and only while an IDE window has the keyboard.
The plugin installs no system-wide hook and asks for no accessibility permission: a key pressed in
another application is never seen by it.

## Several Claude accounts

You can add more than one Claude account and switch between them without signing out of any of them.
Doing so adds nothing to what leaves your machine.

**The plugin stores no credential of its own.** There is no vault, nothing sealed, and nothing in the
settings file: each account is an ordinary `claude auth login`, and Claude Code itself keeps, refreshes
and reads its credential the way it always has - in your login keychain on macOS, in a file with
owner-only permissions on Windows and Linux. What the plugin keeps beside it is a label: the name you
gave the account, the address, the organisation, the plan, and the name of the folder Claude Code was
pointed at. That list lives in one plain file in your home directory (`~/.amazing-claude-code/`), beside
the folders it names, so that every JetBrains IDE on the machine reads the same one. It holds no
credential and never has - only the labels above.

**`~/.claude` stays one folder.** Switching accounts moves the credential and nothing else, so your
skills, hooks, MCP servers, settings, personal commands and the whole conversation history are the same
whichever account is in force. What does travel with an account is the sign-ins kept in that same
credential store: the MCP servers, so a newly added account authenticates them once, and the Claude
Design authorization behind `/design-login`. The panel can start that one for you - it opens the IDE's
terminal, pointed at the credential store of the account in force - and the sign-in itself happens in
Claude Code and your browser, as it does in any terminal. Nothing about it is stored by the plugin.

**Nothing about accounts is sent anywhere.** The list is not on the wire, and it is not in a feedback
report: the debug buffer records shapes only - that an account was added, that the current one changed,
that it changed in another IDE, that a turn was stopped so a conversation could move, that a Claude
Design sign-in was opened, that the machine cannot keep two sign-ins apart - never an address, an
organisation, a folder or a credential. Today's token count remains a figure for the whole machine rather than per account, because
it is counted by reading a folder of transcripts that carries no account marker.

**Your phone is not told about accounts and cannot touch them.** It cannot list them, add one, switch,
rename or forget one, nor start the Claude Design sign-in; adding an account opens a terminal and a
browser sign-in on your machine, and
choosing one decides whose subscription pays for the work. The only thing about accounts that reaches a
paired phone is an opaque identifier saying that two conversations belong to different accounts.

## Your choices

- Remote access is off by default; the plugin does nothing over the network until you turn it on.
- Feedback is sent only when you press Send, and only what the form lists - with the debug report shown
  to you in full beforehand, and switchable off.
- You can revoke any paired device at any time, from the panel: menu → Remote access.
- You can reset this IDE's identity entirely, which drops every pairing at once.
- You can run your own relay.
- Voice input is off by default, needs a key of your own, and records only while you are dictating.
  Removing the key ("Forget this key") takes it out of the keychain.

## Contact

Questions or requests about this: open an issue in the plugin's repository, or write to the address on
the plugin's page in the JetBrains Marketplace.
