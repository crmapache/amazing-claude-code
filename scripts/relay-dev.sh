#!/usr/bin/env bash
# Put what is in this working tree onto the development relay - wss://relay-dev.mzpizote.com.
#
# It exists so that trying a change to the relay or to the phone's client never means deploying to the
# one strangers are paired with. The two are the same image built from the same sources; what differs
# is the address, the VAPID pair and who is pointed at it. Nothing here touches the public relay.
#
#   ./scripts/relay-dev.sh            # the phone's client is rebuilt, then the server
#   ./scripts/relay-dev.sh --no-web   # server only, when only relay/src has moved
#
# Afterwards, point the plugin at it once: panel menu -> Remote access -> relay address ->
# wss://relay-dev.mzpizote.com. The phone follows by itself - it dials whichever host served it the
# client - but it is a different origin, so it pairs separately from the public one.
set -euo pipefail

SERVER=root@40.160.85.25
APP_UUID=i08vmywo3dw38aa7pmkhrche
IMAGE=127.0.0.1:5000/acc-relay-dev:local
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$HERE"

if [ "${1:-}" != "--no-web" ]; then
  echo "==> building the phone's client"
  pnpm build:mobile
  rm -rf relay/public
  mkdir -p relay/public
  cp -R webview/dist-mobile/. relay/public/
fi

if [ ! -d relay/public ]; then
  echo "relay/public is missing - run without --no-web at least once." >&2
  exit 1
fi

echo "==> packing the sources"
# COPYFILE_DISABLE keeps macOS from packing its own metadata beside every file - those turn into
# "._name" files inside the image and are served as if they were the client's.
( cd relay && COPYFILE_DISABLE=1 tar czf /tmp/relay-dev.tgz --exclude=node_modules --exclude=dist . )
scp -q /tmp/relay-dev.tgz "$SERVER:/root/apps/"

echo "==> building the image on the server"
# rm -rf before unpacking is not tidiness: the archive lands on top of what is already there, so a
# file that has left the build would otherwise stay in the image for good.
ssh "$SERVER" "cd /root/apps/acc-relay-dev && rm -rf public dist && tar xzf ../relay-dev.tgz 2>/dev/null && \
  docker build -q -t $IMAGE . && docker push -q $IMAGE" >/dev/null

echo "==> deploying"
python3 "$HOME/Documents/railway-migration/scripts/cool.py" POST "/deploy?uuid=$APP_UUID&force=true" >/dev/null

for _ in $(seq 1 30); do
  sleep 6
  if [ "$(curl -sS -m 10 https://relay-dev.mzpizote.com/healthz || true)" = "ok" ]; then
    echo "==> up: $(curl -sS -m 10 https://relay-dev.mzpizote.com/ | grep -o 'assets/mobile-[A-Za-z0-9_-]*\.js' | head -1)"
    exit 0
  fi
done

echo "the relay did not answer /healthz in three minutes - look at the deploy log" >&2
exit 1
