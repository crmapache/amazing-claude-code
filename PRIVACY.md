# Privacy

_Last updated: 23 August 2026_

Amazing Claude Code is a panel for Claude Code inside JetBrains IDEs. With one exception, described
below, it sends nothing anywhere: the agent runs on your machine, the conversation stays on your
machine, and the plugin has no analytics, no telemetry and no account of any kind.

The exception is **remote access**, which lets you answer your agent from your phone. It is off when
the plugin is installed and stays off until you turn it on. This page is about what happens when you
do.

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

## Your choices

- Remote access is off by default; the plugin does nothing over the network until you turn it on.
- You can revoke any paired device at any time, from the panel: menu → Remote access.
- You can reset this IDE's identity entirely, which drops every pairing at once.
- You can run your own relay.

## Contact

Questions or requests about this: open an issue in the plugin's repository, or write to the address on
the plugin's page in the JetBrains Marketplace.
