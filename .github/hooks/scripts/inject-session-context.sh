#!/usr/bin/env bash
# Injects current date and git branch into the agent's system context at SessionStart.
# Output: JSON with a systemMessage for the agent to anchor time-relative reasoning.

set -euo pipefail

CURRENT_DATE=$(date '+%Y-%m-%d %H:%M:%S %Z')
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
GIT_REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
GIT_REPO="unknown"

if [[ "$GIT_REMOTE_URL" =~ ^git@github\.com:(.+)$ ]]; then
  GIT_REPO="${BASH_REMATCH[1]}"
elif [[ "$GIT_REMOTE_URL" =~ ^ssh://git@github\.com/(.+)$ ]]; then
  GIT_REPO="${BASH_REMATCH[1]}"
elif [[ "$GIT_REMOTE_URL" =~ ^https?://([^/@[:space:]]+@)?github\.com/(.+)$ ]]; then
  GIT_REPO="${BASH_REMATCH[2]}"
fi

if [[ "$GIT_REPO" != "unknown" ]]; then
  GIT_REPO="${GIT_REPO%/}"
  GIT_REPO="${GIT_REPO%.git}"
  [[ -n "$GIT_REPO" ]] || GIT_REPO="unknown"
fi
CURRENT_DATE="$CURRENT_DATE" GIT_BRANCH="$GIT_BRANCH" GIT_REPO="$GIT_REPO" node << 'EOF'
const { CURRENT_DATE, GIT_BRANCH, GIT_REPO } = process.env;
const systemMessage = [
  'SESSION CONTEXT (injected at start):',
  `- Current date/time: ${CURRENT_DATE}`,
  `- Git branch: ${GIT_BRANCH}`,
  `- Repository: ${GIT_REPO}`,
  '',
  "Use this to anchor any time-relative reasoning (e.g. 'today', 'this week', 'recently')",
  'and to correctly reference the active branch in commit messages, PR titles, and branch-specific operations.',
].join('\n');
process.stdout.write(`${JSON.stringify({ systemMessage }, null, 2)}\n`);
EOF
