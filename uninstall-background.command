#!/bin/zsh
set -e

LABEL="com.personal-cfo.dashboard-dashboard"
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
USER_ID="$(id -u)"

launchctl bootout "gui/${USER_ID}/${LABEL}" 2>/dev/null || true
if [[ -f "${PLIST_PATH}" ]]; then
  mv "${PLIST_PATH}" "${HOME}/.Trash/${LABEL}.plist"
fi

echo "The Personal CFO background service has been removed."
echo "Your app files and browser data have not been deleted."
read "?Press Return to close..."
