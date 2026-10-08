#!/bin/zsh
set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME_DIR="${HOME}/Library/Application Support/Personal CFO Runtime"
LABEL="com.personal-cfo.dashboard-dashboard"
LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
PLIST_PATH="${LAUNCH_AGENTS_DIR}/${LABEL}.plist"
LOG_DIR="${RUNTIME_DIR}/.local-service"
NODE_PATH="$(command -v node || true)"
USER_ID="$(id -u)"

# Fast repair path used when the local PDF reader's macOS helper needs to be
# restored. It deliberately leaves the dashboard build and browser data alone.
if [[ "${1:-}" == "--repair-pdf-reader" ]]; then
  mkdir -p "${RUNTIME_DIR}/scripts"
  /bin/cp "${APP_DIR}/scripts/run-local.command" "${RUNTIME_DIR}/scripts/run-local.command"
  /bin/cp "${APP_DIR}/scripts/pdf-parser-server.py" "${RUNTIME_DIR}/scripts/pdf-parser-server.py"
  /bin/cp "${APP_DIR}/scripts/pdf_text.swift" "${RUNTIME_DIR}/scripts/pdf_text.swift"
  if [[ -d "${APP_DIR}/scripts/vendor" ]]; then
    /usr/bin/ditto --noextattr --noqtn "${APP_DIR}/scripts/vendor" "${RUNTIME_DIR}/scripts/vendor"
  fi
  /bin/chmod +x "${RUNTIME_DIR}/scripts/run-local.command"
  PARSER_PID="$(lsof -tiTCP:4318 -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  if [[ -n "${PARSER_PID}" ]]; then
    kill "${PARSER_PID}" 2>/dev/null || true
  fi
  launchctl kickstart -k "gui/${USER_ID}/${LABEL}"
  for attempt in {1..30}; do
    if curl -fsS "http://127.0.0.1:4318/health" >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:3000/" >/dev/null 2>&1; then
      echo "Personal CFO and its private PDF reader have been repaired and restarted."
      exit 0
    fi
    sleep 1
  done
  echo "The PDF reader files were repaired, but the dashboard or reader did not become ready."
  exit 1
fi

if [[ -z "${NODE_PATH}" ]]; then
  echo "Node.js was not found. Install it first, then run this installer again."
  read "?Press Return to close..."
  exit 1
fi

mkdir -p "${LAUNCH_AGENTS_DIR}" "${LOG_DIR}"

echo "Preparing the production version of Personal CFO..."
cd "${APP_DIR}"
if [[ ! -f "${APP_DIR}/node_modules/vinext/dist/cli.js" ]]; then
  echo "The app dependencies are missing. Run pnpm install once, then run this installer again."
  read "?Press Return to close..."
  exit 1
fi
"${NODE_PATH}" "${APP_DIR}/scripts/generate-app-version.mjs"
"${NODE_PATH}" "${APP_DIR}/node_modules/vinext/dist/cli.js" build

# LaunchAgents cannot reliably read applications stored in Documents on
# privacy-protected versions of macOS. Keep the editable project in place and
# install a private, copy-on-write runtime under Library/Application Support.
echo "Preparing the private background runtime..."
mkdir -p "${RUNTIME_DIR}" "${RUNTIME_DIR}/scripts" "${RUNTIME_DIR}/vendor/vinext/dist" "${LOG_DIR}"
"${NODE_PATH}" "${APP_DIR}/scripts/publish-local.mjs"
/usr/bin/ditto --noextattr --noqtn "${APP_DIR}/node_modules/vinext/dist" "${RUNTIME_DIR}/vendor/vinext/dist"
/bin/cp "${APP_DIR}/node_modules/vinext/package.json" "${RUNTIME_DIR}/vendor/vinext/package.json"
/bin/cp "${APP_DIR}/scripts/run-local.command" "${RUNTIME_DIR}/scripts/run-local.command"
/bin/cp "${APP_DIR}/scripts/pdf-parser-server.py" "${RUNTIME_DIR}/scripts/pdf-parser-server.py"
/bin/cp "${APP_DIR}/scripts/pdf_text.swift" "${RUNTIME_DIR}/scripts/pdf_text.swift"
/bin/cp "${APP_DIR}/scripts/start-production.mjs" "${RUNTIME_DIR}/scripts/start-production.mjs"
if [[ -d "${APP_DIR}/scripts/vendor" ]]; then
  /usr/bin/ditto --noextattr --noqtn "${APP_DIR}/scripts/vendor" "${RUNTIME_DIR}/scripts/vendor"
fi
/bin/chmod +x "${RUNTIME_DIR}/scripts/run-local.command"

EXISTING_PID="$(lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null | head -1 || true)"
if [[ -n "${EXISTING_PID}" ]]; then
  EXISTING_CWD="$(lsof -a -p "${EXISTING_PID}" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
  if [[ "${EXISTING_CWD}" == "${APP_DIR}" || "${EXISTING_CWD}" == "${RUNTIME_DIR}" ]]; then
    echo "Stopping the existing local copy..."
    kill "${EXISTING_PID}" 2>/dev/null || true
    sleep 1
  else
    echo "Port 3000 is being used by another application."
    echo "Close that application and run this installer again."
    read "?Press Return to close..."
    exit 1
  fi
fi

cat > "${PLIST_PATH}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>${RUNTIME_DIR}/scripts/run-local.command</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${RUNTIME_DIR}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/finance-dashboard.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/finance-dashboard-error.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/${USER_ID}/${LABEL}" 2>/dev/null || true
BOOTSTRAPPED=""
for attempt in {1..5}; do
  if launchctl bootstrap "gui/${USER_ID}" "${PLIST_PATH}"; then
    BOOTSTRAPPED="yes"
    break
  fi
  sleep 1
done

# Some macOS releases occasionally reject `bootstrap` for a valid user
# LaunchAgent with a generic I/O error. The legacy per-user loader remains a
# safe compatibility fallback and still starts at login; it is not a system- or
# root-level installation.
if [[ -z "${BOOTSTRAPPED}" ]]; then
  echo "Trying the macOS compatibility loader..."
  if launchctl load -w "${PLIST_PATH}"; then
    BOOTSTRAPPED="yes"
  fi
fi
if [[ -z "${BOOTSTRAPPED}" ]]; then
  echo "The background service could not be registered."
  echo "Your dashboard files and browser data are safe; this only affects automatic startup."
  echo "Try signing out and back in, then run this installer once more."
  exit 1
fi
launchctl kickstart -k "gui/${USER_ID}/${LABEL}"

echo "Waiting for the dashboard..."
for attempt in {1..15}; do
  if curl -fsS "http://127.0.0.1:3000/" >/dev/null 2>&1; then
    echo
    echo "Personal CFO is running in the background."
    # Browser storage is scoped to the hostname as well as the port. The
    # dashboard's established private record lives at localhost, so always
    # open that canonical address even though the service binds to loopback.
    echo "Open: http://localhost:3000"
    open "http://localhost:3000"
    read "?Press Return to close this installer..."
    exit 0
  fi
  sleep 1
done

echo
echo "The background service was installed but did not become ready."
echo "Check: ${LOG_DIR}/finance-dashboard-error.log"
read "?Press Return to close..."
exit 1
