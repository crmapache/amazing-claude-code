#!/bin/sh
#
# Starts the sandbox IDE with the plugin.
#
# This is a separate copy of WebStorm with settings of its own: it does not touch the working window and
# can be closed at any moment. The previous run is taken down by us - otherwise every restart would breed
# one more window on top of the old one.

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SANDBOX_PROJECT="$PROJECT_DIR/sandbox-project"
LOG="$PROJECT_DIR/build/sandbox.log"

MARKER="idea.required.plugins.id=io.github.crmapache.amazingclaudecode"

# The previous run goes down, and we wait for it to actually be gone.
#
# Asking politely and starting the next build a second later is what corrupts the sandbox's indexes:
# the editor is asked to stop in the middle of writing them, the next run opens what it half-wrote, and
# the IDE reports "Storage corrupted" from somewhere with no connection to this plugin at all. Ten
# seconds is far more than a shutdown takes; past that it is stuck, and only then is it killed outright.
pkill -f "$MARKER" 2>/dev/null || true

waited=0
while pgrep -f "$MARKER" >/dev/null 2>&1; do
  if [ "$waited" -ge 10 ]; then
    pkill -9 -f "$MARKER" 2>/dev/null || true
    sleep 1
    break
  fi

  sleep 1
  waited=$((waited + 1))
done

mkdir -p "$(dirname "$LOG")"
cd "$PROJECT_DIR"

notify() {
  osascript -e "display notification \"$1\" with title \"Amazing Claude Code GUI\"" 2>/dev/null || true
}

notify "Building the plugin…"

# Building and running in one process: while the IDE is open its dock icon is active, and closing the
# window ends it too.
if ! ./gradlew runIde -PopenProject="$SANDBOX_PROJECT" >"$LOG" 2>&1; then
  notify "Sandbox failed to start — see build/sandbox.log"
  exit 1
fi
