#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION="${1:-seiri-bot}"
LOG_DIR="${LOG_DIR:-"$ROOT_DIR/logs"}"
LOG_FILE="${LOG_FILE:-"$LOG_DIR/${SESSION}.log"}"
BOT_CMD="${BOT_CMD:-"npm run build:bot && npm start"}"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux not found. Please install tmux first."
  exit 1
fi

mkdir -p "$LOG_DIR"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux kill-session -t "$SESSION"
fi

tmux new-session -d -s "$SESSION" "cd \"$ROOT_DIR\" && /usr/bin/env bash -lc \"$BOT_CMD\" >> \"$LOG_FILE\" 2>&1"

echo "Started tmux session: $SESSION"
echo "Log file: $LOG_FILE"
