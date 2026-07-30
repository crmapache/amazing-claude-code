#!/bin/sh
#
# Запуск тестовой IDE с плагином.
#
# Это отдельная копия WebStorm со своими настройками: рабочее окно она не трогает,
# закрыть её можно в любой момент. Предыдущий запуск гасим сами — иначе каждый
# перезапуск плодил бы ещё одно окно поверх старого.

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SANDBOX_PROJECT="$PROJECT_DIR/sandbox-project"
LOG="$PROJECT_DIR/build/sandbox.log"

pkill -f "idea.required.plugins.id=io.github.crmapache.amazingclaudecode" 2>/dev/null || true

mkdir -p "$(dirname "$LOG")"
cd "$PROJECT_DIR"

notify() {
  osascript -e "display notification \"$1\" with title \"Amazing Claude Code\"" 2>/dev/null || true
}

notify "Building the plugin…"

# Сборка и запуск в одном процессе: пока IDE открыта, иконка в доке активна,
# а закрытие окна завершает и её.
if ! ./gradlew runIde -PopenProject="$SANDBOX_PROJECT" >"$LOG" 2>&1; then
  notify "Sandbox failed to start — see build/sandbox.log"
  exit 1
fi
