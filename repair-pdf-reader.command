#!/bin/zsh
set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"

zsh "${APP_DIR}/install-background.command" --repair-pdf-reader
open "http://localhost:3000"

echo
echo "Personal CFO is ready. Retry the credit-card PDF upload."
read "?Press Return to close..."
