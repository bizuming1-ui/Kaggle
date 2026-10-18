#!/usr/bin/env bash
# Rebuild the sandbox dev runtime (everything outside /home/user is ephemeral)
# and start the supervised mock stack as a detached daemon.
#
#   bash tools/dev_env.sh          # runtime + daemon stack
#   bash tools/dev_env.sh runtime  # runtime only
#   bash tools/dev_env.sh stack    # (re)start the supervised stack only
#
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY=/tmp/venv/bin/python
GO=/tmp/venv/lib/python3.11/site-packages/go/bin/go
NODE_MODULES=/tmp/domtest/node_modules

runtime() {
  if ! [ -x "$PY" ]; then
    echo "[dev_env] creating /tmp/venv …"
    python3 -m venv /tmp/venv
    /tmp/venv/bin/pip install -q --upgrade pip
  fi
  echo "[dev_env] python deps …"
  "$PY" -m pip install -q fastapi uvicorn python-multipart requests numpy scipy soundfile \
      "librosa>=0.10.2,<1.0" tree-sitter tree-sitter-go tree-sitter-rust go-bin ipython
  "$PY" -c "import fastapi, numpy, librosa, requests; print('[dev_env] python deps ok')"
  if [ ! -d "$NODE_MODULES" ]; then
    echo "[dev_env] jsdom …"
    mkdir -p /tmp/domtest && (cd /tmp/domtest && npm init -y >/dev/null 2>&1; npm install jsdom@24 >/dev/null 2>&1)
  fi
  [ -d "$NODE_MODULES" ] && echo "[dev_env] jsdom ok"
  if [ -x "$GO" ] && [ ! -x "$ROOT/go/gateway/gateway" ]; then
    echo "[dev_env] building go gateway …"
    (cd "$ROOT/go/gateway" && GOTOOLCHAIN=local GOCACHE=/tmp/gocache GOPATH=/tmp/gopath "$GO" build -o gateway .)
  fi
  [ -x "$ROOT/go/gateway/gateway" ] && echo "[dev_env] gateway binary ok"
}

stack() {
  mkdir -p /tmp/qtts_state/logs /tmp/qtts_state/profiles
  pkill -f "py/superviso[r].py" 2>/dev/null; sleep 1
  cd "$ROOT" || exit 1
  setsid nohup env QTTS_MOCK=1 QTTS_ROOT="$ROOT" QTTS_STATE=/tmp/qtts_state \
      QTTS_BIND=0.0.0.0 PYTHONUNBUFFERED=1 "$PY" py/supervisor.py \
      >> /tmp/qtts_state/logs/supervisor.out 2>&1 < /dev/null &
  echo "[dev_env] supervised stack starting (daemon, pid $!)"
  for _ in $(seq 1 30); do
    curl -s --max-time 1 http://127.0.0.1:7860/api/health >/dev/null 2>&1 && { echo "[dev_env] gateway ready on :7860"; return 0; }
    sleep 1
  done
  echo "[dev_env] WARNING: gateway not ready after 30s — see /tmp/qtts_state/logs/"
  return 1
}

case "${1:-all}" in
  runtime) runtime ;;
  stack) stack ;;
  *) runtime; stack ;;
esac
