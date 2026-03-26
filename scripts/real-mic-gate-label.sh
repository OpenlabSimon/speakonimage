#!/bin/sh

set -eu

LABEL="real-mic-gate"
ACTION="${1:-}"
PR_NUMBER="${2:-}"

usage() {
  echo "Usage: sh scripts/real-mic-gate-label.sh <add|remove> [pr-number]" >&2
  echo "If pr-number is omitted, the script uses the current branch PR via \`gh pr view\`." >&2
}

if [ -z "$ACTION" ]; then
  usage
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required." >&2
  exit 1
fi

if [ -z "$PR_NUMBER" ]; then
  PR_NUMBER="$(gh pr view --json number --jq '.number')"
fi

case "$ACTION" in
  add)
    gh pr edit "$PR_NUMBER" --add-label "$LABEL"
    echo "Added $LABEL to PR #$PR_NUMBER"
    ;;
  remove)
    gh pr edit "$PR_NUMBER" --remove-label "$LABEL"
    echo "Removed $LABEL from PR #$PR_NUMBER"
    ;;
  *)
    usage
    exit 1
    ;;
esac
