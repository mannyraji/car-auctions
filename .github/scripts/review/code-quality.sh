#!/usr/bin/env bash
# code-quality.sh — Run TypeScript type-check + ESLint on changed files.
#
# Outputs: code-quality-findings.json
# Always exits 0 (findings are data, not failure).

set -uo pipefail

: "${PR_NUMBER:?PR_NUMBER environment variable is required}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${OUTPUT_DIR:-.}/code-quality-findings.json"

# Get changed TS/JS files
changed_files=$("$SCRIPT_DIR/get-changed-files.sh" --filter-ext ts,js,mjs)

if [[ -z "$changed_files" ]]; then
  echo "No TypeScript/JavaScript files changed — skipping code quality checks." >&2
  echo '[]' > "$OUTPUT_FILE"
  exit 0
fi

findings='[]'

# --- TypeScript type-check ---
# Detect affected workspaces from changed file paths
declare -A workspaces
while IFS= read -r file; do
  if [[ "$file" == packages/* ]]; then
    ws=$(echo "$file" | cut -d'/' -f1-2)
    if [[ -f "$ws/tsconfig.json" ]]; then
      workspaces["$ws"]=1
    fi
  fi
done <<< "$changed_files"

for ws in "${!workspaces[@]}"; do
  echo "Type-checking $ws ..." >&2
  tsc_output=$(npx tsc --noEmit -p "$ws/tsconfig.json" 2>&1 || true)

  # Parse TSC output: file(line,col): error TS1234: message
  while IFS= read -r line; do
    if [[ "$line" =~ ^(.+)\(([0-9]+),[0-9]+\):\ error\ (TS[0-9]+):\ (.+)$ ]]; then
      file="${BASH_REMATCH[1]}"
      lineno="${BASH_REMATCH[2]}"
      code="${BASH_REMATCH[3]}"
      msg="${BASH_REMATCH[4]}"
      findings=$(echo "$findings" | jq -c \
        --arg f "$file" --arg l "$lineno" --arg s "high" \
        --arg m "$code: $msg" --arg src "tsc" \
        '. + [{"file":$f,"line":($l|tonumber),"severity":$s,"message":$m,"source":$src}]')
    fi
  done <<< "$tsc_output"
done

# --- ESLint ---
echo "Running ESLint on changed files ..." >&2
eslint_files=""
while IFS= read -r file; do
  if [[ -f "$file" ]]; then
    eslint_files+=" $file"
  fi
done <<< "$changed_files"

if [[ -n "$eslint_files" ]]; then
  # shellcheck disable=SC2086
  eslint_output=$(npx eslint --format json $eslint_files 2>/dev/null || true)

  if [[ -n "$eslint_output" ]]; then
    # Parse ESLint JSON output
    parsed=$(echo "$eslint_output" | jq -c '
      [.[] | .filePath as $fp | .messages[] |
        {
          file: $fp,
          line: .line,
          severity: (if .severity == 2 then "high" elif .severity == 1 then "medium" else "low" end),
          message: (.ruleId // "parse-error") + ": " + .message,
          source: "eslint"
        }
      ]' 2>/dev/null || echo '[]')
    findings=$(echo "$findings $parsed" | jq -s '.[0] + .[1]')
  fi
fi

echo "$findings" | jq '.' > "$OUTPUT_FILE"
count=$(echo "$findings" | jq 'length')
echo "Code quality check complete: $count finding(s) written to $OUTPUT_FILE" >&2
exit 0
