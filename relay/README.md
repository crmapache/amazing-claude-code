# Amazing Claude Code GUI - relay

A tiny server that introduces an IDE to a phone and passes sealed envelopes between them.

It exists because a plugin cannot reach into your home network from the outside. The IDE dials out to
this server and holds the connection open; your phone dials out to the same server; frames go one way
and the other. That is the whole job.

> **Licensed Apache-2.0**, separately from the plugin around it, which is source-available under the
> Elastic License 2.0. The plugin's licence forbids offering the software to third parties as a hosted
> service, and a component whose entire purpose is to be hosted must not ship under it: asking people
> to run their own copy while forbidding them to would be a bad joke. The licence in this directory is
> the one that governs this directory - see `relay/LICENSE`.

## Where this lives

Inside the plugin's repository, as one package of a pnpm workspace (see `pnpm-workspace.yaml` at the
root) - but self-contained: it shares no code, no build and no dependency with the panel, and its
Dockerfile copies nothing from outside this folder. `pnpm install` at the root sets up both packages;
`pnpm -r build` and `pnpm -r test` cover both.

It sits here rather than in a repository of its own only because it has not been split out yet. When
it is, that is a move rather than an untangling - history and all:

```
# From the root of the plugin's repository.
git subtree split --prefix=relay -b relay-only
git push git@github.com:<owner>/acc-relay.git relay-only:main
```

Two things to do on the other side afterwards: drop `relay` from `pnpm-workspace.yaml` here, and
point the deploy at the new repository instead of the copy-the-sources dance below - a build from git
is what this section exists in place of.

## What it can and cannot see

**It can see:** two 16-byte addresses (opaque, random, not derived from anything about you), a
counter, how large each envelope is, when it went by, and the IP addresses both sides connect from.

**It cannot see:** anything inside an envelope. That means your source code, your file paths, the
output of commands, the text of your messages and the agent's answers, the names of your projects,
which permission you granted, or which agent belongs to which person.

That is a property of the code rather than a promise: there is no branch here that parses a body, and
no dependency that could. Routing reads two fixed offsets in a 42-byte header. From phase 3 of the
plugin's plan onwards the body is also encrypted end to end, and this server does not change for it —
it never knew the difference.

**It keeps nothing on disk.** No database, no volume, no `DATABASE_URL`. The whole state is a map of
live sockets and a short-lived buffer for a side that briefly dropped (two minutes by default). A
restart empties both; the two ends reconnect and catch up from the journal the IDE keeps. Nothing on
this server's disk can leak, because nothing is there.

**What honestly does leak:** the timings. Whoever runs the relay can see when an IDE was connected and
how much traffic went by — that is, roughly, your working hours and how busy they were. Addresses are
stable, so sessions can be linked over time. Running your own copy turns that list into "logs on your
own server", which is why the next section exists.

## Run your own

```
docker build -t acc-relay .
docker run -p 8080:8080 acc-relay
```

Or without Docker, with Node 22 or newer:

```
npm install
npm run build
npm start
```

Then point the plugin at it: **Remote access → relay address** in the panel's menu.

The address must be `wss://` in real use. `ws://` is accepted only for `localhost`, and not out of
strictness: browsers give a page `crypto.subtle` only in a secure context, so a relay served over
plain HTTP does not weaken the encryption — it removes it.

### How the public one is deployed

The relay that the plugin points at by default (`wss://relay.mzpizote.com`) runs on an ordinary
server under Coolify. Until this directory becomes a repository of its own (see "Where this lives")
there is no build from git to hook up: the sources are copied to the server, the image is built
there, and Coolify pulls it from a registry running on the same machine.

```
# 1. The phone's own files. They are built from the plugin's repository, not from this one, and this
#    server has nothing to serve without them.
cd ../webview && pnpm build:mobile
rm -rf ../relay/public && mkdir -p ../relay/public
cp -R dist-mobile/. ../relay/public/

# 2. The sources, as they are. COPYFILE_DISABLE keeps macOS from packing its own metadata beside
#    every file - those turn into "._name" files inside the image and are served as if they were the
#    client's.
cd ../relay
COPYFILE_DISABLE=1 tar czf /tmp/relay.tgz --exclude=node_modules --exclude=dist .
scp /tmp/relay.tgz root@<server>:/root/apps/

# 3. The image, built on the server and pushed to the registry running there.
ssh root@<server> 'cd /root/apps/acc-relay && rm -rf public dist && tar xzf ../relay.tgz && \
  docker build -t 127.0.0.1:5000/acc-relay:local . && docker push 127.0.0.1:5000/acc-relay:local'

# 4. The deploy itself, through Coolify's API.
python3 cool.py POST '/deploy?uuid=<uuid of acc-relay>&force=true'
```

`rm -rf public dist` before unpacking is not tidiness: the archive is unpacked over what is already
there, so a file that has left the build would otherwise stay in the image for good.

**The one thing that will catch you out:** `public/` is a build artefact, so it is ignored by git -
and an upload that honours ignore files at and below the directory it uploads would drop it. That is
why the rule lives in the repository's root `.gitignore` rather than in `relay/.gitignore`. Keep it
that way, or the phone will be served nothing and the fault will look like the plugin's.

Two things are worth checking after a deploy:

- the service must not sleep - it holds long-lived sockets, so anything that scales it to zero will
  break reconnection in a way that looks like a bug in the plugin;
- the client it serves is the one that was just built: `curl https://<relay>/ | grep assets/` names
  the bundle, and a phone with the app installed may need a reload before its service worker lets go
  of the previous one.

A phone dials whichever host served it the client rather than the address written down when it was
paired (see relayAddress in the mobile client), so moving the relay to another home does not ask
everybody to pair again - it asks them to reload.

Horizontal scaling is out of scope. Two replicas would need a shared bus between them, and this
server's whole value is that it is small enough to read in one sitting.

## Configuration

| Variable | Default | What it is |
|---|---|---|
| `PORT` | `8080` | Set by the host on most platforms |
| `RELAY_MAX_FRAME_BYTES` | `262144` | The largest envelope that will be passed on |
| `RELAY_MAILBOX_TTL_SECONDS` | `120` | How long a frame waits for a side that dropped |
| `RELAY_MAILBOX_MAX_FRAMES` | `200` | Per address; past it the buffer is replaced by a "resynchronise" note |
| `RELAY_MAILBOX_MAX_BYTES` | `4194304` | The same, by weight |
| `RELAY_RATE_FRAMES_PER_MINUTE` | `6000` | A ceiling against a stuck loop, not a quota |
| `RELAY_MAX_CONNECTIONS_PER_IP` | `32` | Sockets from one caller. Counted only when this server can see who called - behind a proxy that does not say, every caller looks like the proxy |
| `RELAY_MAX_CONNECTIONS` | `2000` | Sockets in total. The ceiling that holds whoever is in front of this server |
| `RELAY_ALLOWED_ORIGINS` | — | Browser origins that may open a socket, comma separated. Empty means "the one this server serves the client from"; the plugin sends no origin and is never turned away |
| `RELAY_SUBSCRIBE_MAX_BYTES` | `8192` | The biggest a push subscription may be |
| `RELAY_MAX_SUBSCRIPTIONS` | `10000` | How many are held at once |
| `RELAY_PUSH_HOSTS` | — | Extra push service hosts, comma separated. The known browsers' are built in |
| `RELAY_STATIC_DIR` | `./public` | Where the phone's own files are. Empty turns serving them off |
| `RELAY_LOG_LEVEL` | `info` | `silent` says nothing at all |
| `VAPID_PUBLIC_KEY` | — | Push notifications. Absent means the relay works but cannot ring anybody |
| `VAPID_PRIVATE_KEY` | — | Keep private: with it somebody can send notifications that look like yours |
| `VAPID_SUBJECT` | `mailto:relay@example.com` | How a push service can reach whoever runs this |

### Notifications

Make the pair once, with `node dist/keys.js`, and put it in the environment above. The pair identifies
this relay to Apple's and Google's push services; it says nothing about the people using it, and it is
**not** what encrypts a notification's text - the IDE does that with a key this server never sees, and
the phone's service worker opens it. What passes through here, and what Apple and Google see, is a
blob none of the three can read.

## Logging

One rule, and it is not negotiable: **the body of a frame is never logged.** Not on an error path
either — that is exactly where "attach the bytes so we can see what broke" gets written. What a log
line may contain is what happened, the first four bytes of an address, a size and a time.

IP addresses are used for the per-IP connection limit and are held in memory for that alone - never
written to a log line, including the one that refuses a caller for being over it.

## Endpoints

| | | |
|---|---|---|
| `GET` | `/healthz` | liveness |
| `GET` | `/v1/info` | version, wire range, limits — read by the plugin before it connects |
| `WS` | `/v1/agent?id=…` | the IDE. One live connection per address; a new one displaces the old with code 4009 |
| `WS` | `/v1/device?id=…` | a phone. Several are allowed |
| `GET` | `/v1/push/key` | the public half of the VAPID pair, so a client can subscribe |
| `POST` | `/v1/push/subscribe` | a device says where its notifications should be sent |
| `GET` | `/*` | the phone's own files, falling back to the shell |

There is deliberately **no endpoint for pairing**. Pairing is just traffic: the phone learns an
address from the QR code and sends a frame to it, and this server routes it like any other. So there
is no code here about pairing at all — and nothing about it to get wrong or to leak.
