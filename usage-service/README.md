# The usage service

A small server with two jobs: keep the anonymous daily counts the plugin sends when a person has allowed
it, and show them to the author on a page behind a password.

It is the third server in this repository and the only one that keeps anything. The relay holds nothing
on disk by design, and the feedback service forgets a message the moment it has forwarded it. Both
promises are written into their READMEs, and a database does not belong beside either of them, so this is
a service of its own.

Licensed Elastic-2.0, like the plugin and the feedback service, and for the same reason: nobody else has
a use for a service that counts one particular plugin.

## What it holds

One SQLite file with three tables, all keyed by a random identifier the plugin makes up when a person
presses Allow:

- `installs`: the day the identifier was first seen, and the versions and settings it reported last;
- `days`: the fixed counts of one identifier's day (minutes, messages, answers, edits and so on) and the
  lengths of that day's stretches of work;
- `counts`: the named counts of a day: tools, model families, built-in commands, the panel's features.

No IP address is stored anywhere. The address is used in memory for the hourly ceiling and is forgotten
when the hour turns; the log shows its first six characters. What the plugin sends and what it never
sends is described in `PRIVACY.md` at the root of the repository, and `src/report.ts` holds a report to
that shape even when the plugin did not write it: every name has to look like an identifier and every
value has to be a small whole number, or it is dropped.

A day is written over rather than added to. The plugin sends a day's running totals a few times while it
lasts and once more after it ends, and two IDEs on one machine may both send it. Each figure only grows
within a day, so the larger of two reports is kept figure by figure, and a repeated report cannot count
anything twice.

## Endpoints

| | |
|---|---|
| `POST /v1/usage` | A report, as JSON. `204` when kept |
| `DELETE /v1/usage/<id>` | Everything under an identifier, deleted. The plugin asks for this when somebody switches the statistics off |
| `GET /admin` | The dashboard. Sends a stranger to the password |
| `GET /admin/login`, `POST /admin/login` | The password |
| `POST /admin/logout` | |
| `GET /healthz` | `ok` |
| `GET /v1/info` | Version, and whether the dashboard is configured |

The report, as the plugin builds it (see `UsageReport.kt`):

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

Answers to a report: `204` kept, `400` not JSON or nothing in it worth keeping, `403` the shared secret
does not match, `413` too big, `429` too many from one address this hour.

## The dashboard

Server-rendered HTML with the charts drawn as SVG, and no script on the page at all: the
Content-Security-Policy allows none. It shows, for 7, 30, 90 or 365 days:

- active machines per day, over 7 and 30 days, and new machines per day;
- how long people use the panel: active minutes per day, sittings per day and how long a sitting lasts;
- retention by weekly cohort;
- which features are used, as the share of active machines that used each at least once;
- models, tools and built-in commands;
- versions, IDEs, operating systems and languages, and how the settings are set.

The wording of each feature lives in `src/features.ts`. The ids come from the plugin's
`UsageFeatures.kt`, and `features.test.ts` reads that file and fails when an id has no wording here.

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

After a deploy, `curl https://usage.mzpizote.com/v1/info` should say `"admin": true`.

The database is in the server's hourly backup beside the Postgres dumps. The host has no sqlite3, and a
file copied from outside while it is being written may not open, so the backup asks the service for a
snapshot (`node dist/backup.js /data/backup.sqlite`, which is `VACUUM INTO`) and copies that out. To
restore, stop the container and put a snapshot into the volume as `/data/usage.sqlite`.
