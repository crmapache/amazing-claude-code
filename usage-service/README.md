# The usage service

A small server with two jobs: keep the anonymous daily counts the plugins send when a person has allowed
it, and show them to the author on a page behind a password.

Two plugins report here: Amazing Claude Code GUI (`acc`, this repository) and its fork for OpenAI Codex,
Amazing Codex GUI (`acx`, a repository of its own). One service, one database and one address,
`usage.mzpizote.com`, with the figures of each plugin kept apart: every row says whose it is, and the
dashboard shows one plugin at a time.

It is the third server in this repository and the only one that keeps anything. The relay holds nothing
on disk by design, and the feedback service forgets a message the moment it has forwarded it. Both
promises are written into their READMEs, and a database does not belong beside either of them, so this is
a service of its own.

Licensed Elastic-2.0, like the plugin and the feedback service, and for the same reason: nobody else has
a use for a service that counts two particular plugins.

## What it holds

One SQLite file with three tables, all keyed by a random identifier the plugin makes up when a person
presses Allow:

- `installs`: the plugin the identifier belongs to, the day it was first seen, and the versions and
  settings it reported last;
- `days`: the fixed counts of one identifier's day (minutes, messages, answers, edits and so on) and the
  lengths of that day's stretches of work;
- `counts`: the named counts of a day: tools, models, built-in commands, the panel's features.

Each table has a `product` column, `acc` or `acx`, so the dashboard reads one plugin's figures without a
join. An identifier belongs to one plugin: each plugin makes its own, and the first report under one
decides whose it is. A report from the other plugin under the same identifier is refused with `409`
rather than mixed in.

The column came with the second plugin. On start the service adds it to a file from before then, with
`acc` in every existing row (there was no other plugin), together with three indexes. It only adds:
nothing is rebuilt or copied, a second start finds nothing to do, and it all runs in one transaction. The
same step adds the column of a count added to `DAY_FIELDS` (see `Store.addMissingColumns`).

No IP address is stored anywhere. The address is used in memory for the hourly ceiling and is forgotten
when the hour turns; the log shows its first six characters. What the plugin sends and what it never
sends is described in `PRIVACY.md` at the root of the repository, and `src/report.ts` holds a report to
that shape even when the plugin did not write it: every name has to look like an identifier and every
value has to be a small whole number, or it is dropped.

The names are also held to the lists of the plugin that sent them (`src/products.ts`, `src/features.ts`),
the same folding the plugin does before sending, done again in case a plugin forgets:

| | ACC | ACX |
|---|---|---|
| Features, screens, settings changed | its `UsageFeatures.kt`; anything else is dropped | the same, by the fork's lists |
| Built-in commands | Claude Code's, as in `UsageReport.BUILT_IN_COMMANDS` | `compact`, `clear`, `new`, `init`, `review`, `btw`, `side`, `rename`, `config`, `model`, `effort`, `resume`, `fork`, `login`, `logout` |
| A command of one's own | `custom` | `custom`, prompts (`/prompts:...`) and skills included |
| Models | a family: `Opus`, `Sonnet`, `Haiku`, `Fable`, `Mythos`, else `Other` | an id of Codex's catalogue (`gpt-5.6-sol`, `o3`, `codex-mini-latest`): lower case, starting `gpt-`, `o<digit>` or `codex-`, at most 40 characters, else `Other` |
| Tools | the CLI's names; every `mcp__...` tool is `MCP` | the same names, which the fork gives Codex's tools |
| `env.cli` | Claude Code's version | Codex CLI's version, `0.152.0`, without `codex-cli` |
| Settings the report states | the keys of `UsageFacts.settings` | the same keys, with Codex's accounts |

A name the service does not know is dropped (or folded) until the service knows it, the same as a count
missing from `DAY_FIELDS`. So a plugin release that names a new feature, command or setting goes out after
the service that knows it is deployed, not before.

A day is written over rather than added to. The plugin sends a day's running totals a few times while it
lasts and once more after it ends, and two IDEs on one machine may both send it. Each figure only grows
within a day, so the larger of two reports is kept figure by figure, and a repeated report cannot count
anything twice.

## Endpoints

| | |
|---|---|
| `POST /v1/usage` | A report, as JSON. `204` when kept |
| `DELETE /v1/usage/<id>[?product=acx]` | Everything one plugin keeps under an identifier, deleted. The plugin asks for this when somebody switches the statistics off |
| `GET /admin` | The dashboard. Sends a stranger to the password |
| `GET /admin/login`, `POST /admin/login` | The password |
| `POST /admin/logout` | |
| `GET /healthz` | `ok` |
| `GET /v1/info` | Version, whether the dashboard is configured, and the plugins it counts (`"products": ["acc", "acx"]`) |

The report, as ACC builds it (see `UsageReport.kt`); the fork's is the same shape with `"product": "acx"`
beside `"schema"` and its own names inside (see the table above):

```json
{
  "schema": 1,
  "install": "Rk3pD9xQ2mV7tL1aZ8bN4c",
  "env": { "plugin": "0.14.0", "ide": "WS", "ideVersion": "2026.2", "os": "mac", "arch": "arm64", "cli": "2.3.1", "lang": "en" },
  "settings": { "remote": false, "layout": "bottom", "accounts": 1 },
  "days": [
    {
      "day": "2026-09-30",
      "minutes": 94, "prompts": 21, "turns": 20, "conversations": 3,
      "sittings": [48, 12, 34],
      "tools": { "Read": 61, "Edit": 34, "MCP": 3 },
      "models": { "Opus": 20 },
      "slash": { "compact": 1 },
      "features": { "screen:history": 1, "improve_prompt": 2 }
    }
  ]
}
```

The day's other counts are listed in `DAY_FIELDS` in `src/report.ts`. A count added there gets its
column on the next start (see `Store.addMissingColumns`).

### Which plugin is talking

- **A report** names its plugin in `product`: `"acc"` or `"acx"`. Without the field it is ACC's, which is
  how every ACC version published before the fork sends it, so ACC needs no change. The Codex fork always
  sends `"product": "acx"`.
- **A deletion** has no body, so the plugin goes in the address: `DELETE /v1/usage/<id>?product=acx` from
  the fork, and the plain `DELETE /v1/usage/<id>` from ACC, as now. It deletes only that plugin's rows:
  ACC's request cannot touch the fork's figures under any identifier, nor the other way round. Answered
  `204` whether there was anything to delete or not.
- Any other value, an empty one or a `null` included, is refused with `400` (`not a plugin this service
  counts`): the product is not a figure that can be dropped but the address the figures are filed under,
  and a guess would file them on the wrong tab.

Both plugins send the same `x-acc-key` header with the key from `USAGE_KEY`.

Answers to a report: `204` kept, `400` not JSON, a plugin this service does not count, or nothing in it
worth keeping, `403` the shared secret does not match, `409` the identifier belongs to the other plugin,
`413` too big, `429` too many from one address this hour. To a deletion: `204` done, `400` not an
identifier or a plugin this service does not count, `403` the shared secret does not match.

## The dashboard

Server-rendered HTML and no script on the page at all: the Content-Security-Policy allows none. A chart's
labels, dots and hover readouts are HTML placed in percent of the plot, and only its lines are an SVG
stretched over it, so the text keeps its size on a card of any width (`src/charts.ts`). The readouts work
on hover through CSS alone, and every chart has its figures as a table folded under it. The page is light
whatever the browser prefers.

A row of tabs at the top, **Claude Code** and **Codex**, picks the plugin; Claude Code is the default.
Without a script a tab is just a link: the plugin and the range are in the address
(`/admin?product=acx&days=90`), so a link opens the same tab again, and switching tabs keeps the range. An
address naming a plugin the page does not have opens Claude Code's tab. Every figure on a tab is that
plugin's alone, and so is the wording: the agent's version is "Claude Code version" or "Codex CLI
version", the accounts are Claude or Codex accounts, and so on (`WORDING` in `src/page.ts`, the lists in
`src/features.ts` and `src/products.ts`).

Each tab shows, for 7, 30, 90 or 365 days:

- the headline figures, each set against the same figure one window earlier (the day before, the 7 or
  30 days before, the range before) and with its trend over the range;
- active machines per day and distinct over the 7 and 30 days up to each day, and each day's active
  machines split into new and returning;
- how long people use the panel: active minutes per day, sittings per day and how long a sitting lasts;
- retention by weekly cohort;
- which features are used, as the share of active machines that used each at least once;
- remote access: switched on, paired, and actually used from a phone;
- models, tools and built-in commands;
- versions, IDEs, operating systems and languages, and how the settings are set.

A range that reaches back past the plugin's first report starts at that report, and the page says so
("Counting since"): the days before it were not quiet, nobody was counting yet. For the same reason a
figure is set against an earlier window only when that window was counted whole. Today is still under
way, so its stretch of a line is dashed, its column paler, and its readout says "so far".

The wording of each feature lives in `src/features.ts`, one list per plugin. The ids come from each
plugin's `UsageFeatures.kt`; the built-in commands, model families and the settings a report states from
its `UsageReport.kt` and `UsageFacts.kt`. The tests read those files and fail when a list there and a list
here part ways:

- `features.test.ts` and `products.test.ts` against ACC's files in this repository;
- `codexFork.test.ts` against the fork's, expected beside this repository at `../amazing-codex` (or where
  `AMAZING_CODEX_DIR` points). Without the fork, or before it has a file, the check is skipped with a note
  naming the file it waits for. With the file there, it fails on any difference and names the ids that
  differ and the side they are missing on. While the fork's statistics are still the copy of ACC's being
  ported to Codex, these checks fail by design: the service already holds the Codex lists, and the failure
  is the list of what is left to port.

The password is `ADMIN_PASSWORD`. A session is a cookie signed with a key derived from it, so a restart
signs nobody out, and changing the password signs everybody out. Ten wrong passwords from one address in
a quarter of an hour and that address waits.

## Configuration

| Variable | Default | What it is |
|---|---|---|
| `PORT` | `8080` | |
| `USAGE_DATABASE` | `data/usage.sqlite` | The image sets `/data/usage.sqlite`; mount a volume at `/data` |
| `USAGE_KEY` | - | The shared secret the plugin sends. Empty means every caller is answered |
| `ADMIN_PASSWORD` | - | Without it there is no dashboard |
| `USAGE_TRUSTED_PROXIES` | `0` | How many hops in front of this service are ours. **Set it to `1` behind a reverse proxy** |
| `USAGE_PER_IP_PER_HOUR` | `120` | Reports one address may send in an hour. An office behind one address is many machines |
| `USAGE_MAX_BODY_BYTES` | 128 KB | |
| `USAGE_RETENTION_DAYS` | `730` | Days older than this are deleted, once at start and daily after |
| `USAGE_SECURE_COOKIE` | `true` | `false` for a run on localhost over plain HTTP, where a Secure cookie is never sent back |
| `USAGE_LOG_LEVEL` | `info` | `silent` for nothing at all |

About `USAGE_KEY`: it is compiled into a plugin anybody can download, so it is not authentication. It
keeps the endpoint from answering every scanner that tries a `POST` on every host.

## Run it

Node 24 or later: the database is Node's own `node:sqlite`, so there is nothing to compile.

```
pnpm dev:usage          # from the root: builds and serves on :8082 with a plain-HTTP cookie
```

With `USAGE_KEY` and `ADMIN_PASSWORD` set in the environment, `http://localhost:8082/admin` is the
dashboard. The sandbox IDE (`./gradlew runIde`) sends its reports to `http://localhost:8082` by default
and never to the published service; `-PusageUrl` and `-PusageKey` point it elsewhere.

## How the public one is deployed

It runs beside the relay and the feedback service, on the same server under Coolify, at
`usage.mzpizote.com`, with a persistent volume at `/data` for the database. As with the other two, the
sources are copied to the server, the image is built there, and Coolify pulls it from the registry
running on the same machine.

```
cd usage-service
COPYFILE_DISABLE=1 tar czf /tmp/usage.tgz --exclude=node_modules --exclude=dist --exclude=data .
scp /tmp/usage.tgz root@<server>:/root/apps/

ssh root@<server> 'mkdir -p /root/apps/acc-usage && cd /root/apps/acc-usage && rm -rf dist src && \
  tar xzf ../usage.tgz && docker build -t 127.0.0.1:5000/acc-usage:local . && \
  docker push 127.0.0.1:5000/acc-usage:local'

python3 cool.py POST '/deploy?uuid=<uuid of acc-usage>&force=true'
```

After a deploy, `curl https://usage.mzpizote.com/v1/info` should say `"admin": true` and list
`"products": ["acc", "acx"]`. The first start of 0.2.0 adds the product column to the live database (see
"What it holds"); a snapshot taken just before the deploy is the way back.

The database is in the server's hourly backup beside the Postgres dumps. The host has no sqlite3, and a
file copied from outside while it is being written may not open, so the backup asks the service for a
snapshot (`node dist/backup.js /data/backup.sqlite`, which is `VACUUM INTO`) and copies that out. To
restore, stop the container and put a snapshot into the volume as `/data/usage.sqlite`.
