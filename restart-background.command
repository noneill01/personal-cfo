#!/bin/zsh
set -e

LABEL="com.personal-cfo.dashboard-dashboard"
USER_ID="$(id -u)"

if ! launchctl print "gui/${USER_ID}/${LABEL}" >/dev/null 2>&1; then
  echo "The background service is not installed yet."
  echo "Run install-background.command first."
  read "?Press Return to close..."
  exit 1
fi

launchctl kickstart -k "gui/${USER_ID}/${LABEL}"
echo "Personal CFO restarted."
open "http://localhost:3000"
read "?Press Return to close..."
