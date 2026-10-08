#!/bin/zsh
set -e

LABEL="com.personal-cfo.dashboard-dashboard"
USER_ID="$(id -u)"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME_DIR="${HOME}/Library/Application Support/Personal CFO Runtime"

# Publish the latest verified build before restarting the background service.
# Browser-stored finance data is unaffected by replacing these application files.
/opt/homebrew/bin/node "${APP_DIR}/scripts/publish-local.mjs"

PARSER_PID="$(lsof -tiTCP:4318 -sTCP:LISTEN 2>/dev/null | head -1 || true)"
if [[ -n "${PARSER_PID}" ]]; then
  kill "${PARSER_PID}" 2>/dev/null || true
fi
launchctl kickstart -k "gui/${USER_ID}/${LABEL}"

for attempt in {1..15}; do
  if curl -fsS "http://127.0.0.1:3000/" >/dev/null 2>&1; then
    open "http://localhost:3000"
    exit 0
  fi
  sleep 1
done

echo "Personal CFO did not become ready. Run install-background.command to repair the background service."
read "?Press Return to close..."
