#!/usr/bin/env bash
# Injects current date and git branch into the agent's system context at SessionStart.
# Output: JSON with a systemMessage for the agent to anchor time-relative reasoning.

set -euo pipefail

CURRENT_DATE=$(date '+%Y-%m-%d %H:%M:%S %Z')
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
GIT_REPO=$(git remote get-url origin 2>/dev/null | sed 's|.*github.com[:/]\(.*\)\.git|\1|' | sed 's|.*github.com[:/]||' || echo "unknown")

CURRENT_DATE="$CURRENT_DATE" GIT_BRANCH="$GIT_BRANCH" GIT_REPO="$GIT_REPO" node -e '
const { CURRENT_DATE, GIT_BRANCH, GIT_REPO } = process.env;
const systemMessage = `SESSION CONTEXT (injected at start):\n- Current date/time: ${CURRENT_DATE}\n- Git branch: ${GIT_BRANCH}\n- Repository: ${GIT_REPO}\n\nUse this to anchor any time-relative reasoning (e.g. '\''today'\'', '\''this week'\'', '\''recently'\'') and to correctly reference the active branch in commit messages, PR titles, and branch-specific operations.`;
process.stdout.write(`${JSON.stringify({ systemMessage }, null, 2)}\n`);
'
