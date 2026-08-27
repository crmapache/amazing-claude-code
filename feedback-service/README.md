# The feedback service

A small server with one job: take what somebody wrote on the panel's feedback screen and put it in the
author's Telegram, with their files and their debug report attached.

It is the second server in this repository and the opposite of the first in every way that matters.
The relay next door is meant to be run by anybody and can see nothing of what passes through it; this
one reads what it is given and forwards it to one specific chat. That is why it is a service of its own
rather than another route on the relay: every self-hosted copy of that server would otherwise carry a
dead endpoint pointing at a stranger's bot.

Licensed Elastic-2.0, like the plugin, and for the mirror image of the relay's reason - there is
nothing here for anybody else to run.

## What it holds

Nothing. No database, no volume, no record of what was said. A message is read into memory, forwarded
and dropped, and the only state in the process is a count of how many arrived this hour.

The log says what happened, a hint of an address, sizes and times. Never a body - not even in an error
path, which is exactly where "attach the message for diagnosis" gets written.

## Endpoints

| | |
|---|---|
| `POST /v1/feedback` | The one that does the work. `multipart/form-data`; see below |
| `GET /healthz` | `ok`, for whatever is watching |
| `GET /v1/info` | Version, limits, and whether a Telegram is configured at all |

The body of a feedback request, as the plugin sends it (see `FeedbackSender.kt`):

| Field | | |
|---|---|---|
| `kind` | text | `bug`, `idea` or `hello` |
| `text` | text | What the person wrote. Refused if empty |
| `email` | text | May be empty - an answer is offered, not required |
| `environment` | text | Versions on one line, for the message's first lines |
| `report` | file | The debug report, when the person left it switched on |
| `file` | file | An attachment. May repeat |

Answers: `204` when it went, `400` when there is nothing written in it or the body is not multipart,
`403` when the shared secret does not match, `413` when it is too big, `429` when too many have come
this hour, `502` when Telegram would not take it.

`429` and `502` are both worth being precise about. A `502` does **not** count against the sender's
share of the hour: they will press the button again, and refusing the second attempt because the first
never arrived is the one answer this service must not give.

## Configuration

| Variable | Default | What it is |
|---|---|---|
| `PORT` | `8080` | |
| `TELEGRAM_BOT_TOKEN` | — | Without it the service runs and refuses to forward |
| `TELEGRAM_CHAT_ID` | — | Same |
| `FEEDBACK_KEY` | — | The shared secret the plugin sends. Empty means every caller is answered |
| `FEEDBACK_MAX_BODY_BYTES` | 24 MB | A little over what the plugin allows: the difference is the report and multipart's own overhead |
| `FEEDBACK_MAX_FILES` | `10` | |
| `FEEDBACK_PER_IP_PER_HOUR` | `6` | |
| `FEEDBACK_PER_HOUR` | `120` | The Telegram quota's guard |
| `FEEDBACK_MAX_CONCURRENT` | `3` | Bodies read at once. Each may be the whole ceiling in memory |
| `FEEDBACK_TRUSTED_PROXIES` | `0` | How many hops in front of this service are ours. **Set it to `1` behind a reverse proxy** |
| `FEEDBACK_LOG_LEVEL` | `info` | `silent` for nothing at all |

About `FEEDBACK_TRUSTED_PROXIES`: with the default of `0` the `x-forwarded-for` header is ignored and the
sender is whoever the socket says. That is the only safe default - the header is written by whoever is
calling, and a per-address ceiling that believes it can be walked straight past by changing the header on
every request. Behind one reverse proxy (which is how the public instance runs) set it to `1`: then the
address counted by is the last entry of the chain, the one our own proxy added. Leave it at `0` there and
every request looks like it came from the proxy, so the per-address ceiling becomes the overall one.

About `FEEDBACK_KEY`: it sits inside a plugin published on a marketplace, so anybody who wants it has
it. It is not authentication and is not meant to be. What it does is keep the endpoint from answering
every scanner that walks the internet trying `POST`s at every host - which is the traffic this service
would otherwise spend its Telegram quota on.

## Run it

```
pnpm build && node dist/index.js
```

Against a plugin, without touching the published address:

```
# the service, on this machine
cd feedback-service && pnpm build && \
  PORT=8081 TELEGRAM_BOT_TOKEN=… TELEGRAM_CHAT_ID=… node dist/index.js

# the sandbox IDE, pointed at it
./gradlew runIde -PopenProject=sandbox-project -PfeedbackUrl=http://localhost:8081
```

## What to set up in Telegram

1. Write to [@BotFather](https://t.me/BotFather), `/newbot`, and follow it. What comes back is
   `TELEGRAM_BOT_TOKEN`.
2. Press `/start` in the new bot's chat. A bot cannot write to somebody who has never written to it,
   and without this every message would fail with `403` from Telegram's side.
3. `TELEGRAM_CHAT_ID` is the id of that chat - your own user id for a private one. If the bot is
   already talking to you, `https://api.telegram.org/bot<token>/getUpdates` names it.

## How the public one is deployed

It runs beside the relay, on the same server under Coolify, at `feedback.mzpizote.com`. As with the
relay there is no build from git to hook up: the sources are copied to the server, the image is built
there, and Coolify pulls it from a registry running on the same machine.

```
# 1. The sources, as they are. COPYFILE_DISABLE keeps macOS from packing its own metadata beside every
#    file - those turn into "._name" files inside the image.
cd feedback-service
COPYFILE_DISABLE=1 tar czf /tmp/feedback.tgz --exclude=node_modules --exclude=dist .
scp /tmp/feedback.tgz root@<server>:/root/apps/

# 2. The image, built on the server and pushed to the registry running there.
ssh root@<server> 'mkdir -p /root/apps/acc-feedback && cd /root/apps/acc-feedback && rm -rf dist && \
  tar xzf ../feedback.tgz && docker build -t 127.0.0.1:5000/acc-feedback:local . && \
  docker push 127.0.0.1:5000/acc-feedback:local'

# 3. The deploy itself, through Coolify's API.
python3 cool.py POST '/deploy?uuid=<uuid of acc-feedback>&force=true'
```

Two things are worth checking after a deploy:

- `curl https://feedback.mzpizote.com/v1/info` should say `"telegram": true`. It says `false` when the
  token or the chat id did not make it into the service's variables, and in that state every report is
  answered with a `502` and lost;
- the service may sleep. It holds nothing, so being scaled to zero costs one cold start on the first
  report of the day and nothing else.
