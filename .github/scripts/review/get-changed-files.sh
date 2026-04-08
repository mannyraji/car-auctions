#!/usr/bin/env bash
# get-changed-files.sh — List files changed in a PR, optionally filtered by extension.
#
# Usage:
#   PR_NUMBER=42 bash get-changed-files.sh [--filter-ext ts,js,json]
#
# Outputs newline-separated file paths to stdout.

set -euo pipefail

: "${PR_NUMBER:?PR_NUMBER environment variable is required}"

FILTER_EXT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --filter-ext)
      FILTER_EXT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Get changed files from the PR diff
changed_files=$(gh pr diff "$PR_NUMBER" --name-only 2>&1)
diff_exit=$?
if [[ $diff_exit -ne 0 ]]; then
  echo "WARNING: gh pr diff failed (exit $diff_exit): $changed_files" >&2
  changed_files=""
fi

if [[ -z "$changed_files" ]]; then
  echo "No changed files found for PR #${PR_NUMBER}" >&2
  exit 0
fi

if [[ -n "$FILTER_EXT" ]]; then
  # Build grep pattern from comma-separated extensions: ts,js → \.(ts|js)$
  IFS=',' read -ra exts <<< "$FILTER_EXT"
  pattern="\\.($(IFS='|'; echo "${exts[*]}"))$"
  echo "$changed_files" | grep -E "$pattern" || true
else
  echo "$changed_files"
fi
