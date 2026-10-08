#!/bin/zsh
set -e
setopt NO_BG_NICE

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-dev}"
PARSER_PID=""

cleanup() {
  if [[ -n "${PARSER_PID}" ]]; then
    kill "${PARSER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

cd "${APP_DIR}"
mkdir -p .local-service

if ! curl -fsS "http://127.0.0.1:4318/health" >/dev/null 2>&1; then
  /usr/bin/python3 scripts/pdf-parser-server.py >>.local-service/pdf-parser.log 2>>.local-service/pdf-parser-error.log &
  PARSER_PID="$!"
  for attempt in {1..45}; do
    curl -fsS "http://127.0.0.1:4318/health" >/dev/null 2>&1 && break
    sleep 1
  done
fi

if ! curl -fsS "http://127.0.0.1:4318/health" >/dev/null 2>&1; then
  echo "The local PDF parser did not start. Check .local-service/pdf-parser-error.log"
  exit 1
fi

if [[ "${MODE}" == "start" ]]; then
  if [[ -f "${APP_DIR}/scripts/start-production.mjs" && -d "${APP_DIR}/vendor/vinext/dist" ]]; then
    HOST=127.0.0.1 PORT=3000 /opt/homebrew/bin/node "${APP_DIR}/scripts/start-production.mjs"
  else
    node_modules/.bin/vinext start --hostname 127.0.0.1 --port 3000
  fi
else
  node_modules/.bin/vinext dev --host 127.0.0.1 --port 3000
fi
