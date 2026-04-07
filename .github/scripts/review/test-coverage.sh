#!/usr/bin/env bash
# test-coverage.sh — Run tests for affected workspaces and report results.
#
# Outputs: test-findings.json
# Always exits 0.

set -uo pipefail

: "${PR_NUMBER:?PR_NUMBER environment variable is required}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${OUTPUT_DIR:-.}/test-findings.json"

findings='[]'

# Get all changed files
changed_files=$("$SCRIPT_DIR/get-changed-files.sh" --filter-ext ts,js)

if [[ -z "$changed_files" ]]; then
  echo "No TypeScript/JavaScript files changed — skipping test checks." >&2
  echo '[]' > "$OUTPUT_FILE"
  exit 0
fi

# Detect affected workspaces
declare -A workspaces
while IFS= read -r file; do
  if [[ "$file" == packages/* ]]; then
    ws=$(echo "$file" | cut -d'/' -f1-2)
    if [[ -f "$ws/package.json" ]]; then
      workspaces["$ws"]=1
    fi
  fi
done <<< "$changed_files"

if [[ ${#workspaces[@]} -eq 0 ]]; then
  echo "No testable workspaces affected — skipping." >&2
  echo '[]' > "$OUTPUT_FILE"
  exit 0
fi

# Run vitest for each affected workspace
for ws in "${!workspaces[@]}"; do
  echo "Running tests for $ws ..." >&2

  # Check if workspace has vitest config or test script
  has_vitest=false
  if [[ -f "$ws/vitest.config.ts" ]] || [[ -f "$ws/vitest.config.js" ]]; then
    has_vitest=true
  elif grep -q '"test"' "$ws/package.json" 2>/dev/null; then
    has_vitest=true
  fi

  if [[ "$has_vitest" != "true" ]]; then
    echo "  No test config found in $ws — skipping." >&2
    continue
  fi

  # Run vitest with JSON reporter
  test_output=$(cd "$ws" && npx vitest run --reporter=json 2>&1 || true)

  # Try to parse JSON output (vitest outputs JSON to stdout when --reporter=json)
  json_part=$(echo "$test_output" | sed -n '/^{/,/^}/p' | head -500)

  if [[ -n "$json_part" ]]; then
    # Extract failed tests
    failed=$(echo "$json_part" | jq -c '
      [.testResults // [] | .[] |
        .assertionResults // [] | .[] |
        select(.status == "failed") |
        {
          file: .ancestorTitles[0],
          line: 0,
          severity: "critical",
          message: "Test failed: " + .fullName + " — " + (.failureMessages[0] // "unknown error" | split("\n")[0]),
          source: "vitest"
        }
      ]' 2>/dev/null || echo '[]')

    if [[ "$failed" != "[]" ]]; then
      findings=$(echo "$findings $failed" | jq -s '.[0] + .[1]')
    fi

    # Extract summary
    num_failed=$(echo "$json_part" | jq '.numFailedTests // 0' 2>/dev/null || echo 0)
    num_passed=$(echo "$json_part" | jq '.numPassedTests // 0' 2>/dev/null || echo 0)
    echo "  Results: $num_passed passed, $num_failed failed" >&2
  else
    # Could not parse JSON — check if vitest errored
    if echo "$test_output" | grep -qi "FAIL\|error\|ERR_"; then
      findings=$(echo "$findings" | jq -c \
        --arg f "$ws" --arg s "critical" \
        --arg m "Test suite failed to run. Check test configuration." --arg src "vitest" \
        '. + [{"file":$f,"line":0,"severity":$s,"message":$m,"source":$src}]')
    fi
  fi
done

# --- Check for new source files without corresponding test files ---
echo "Checking for untested new files ..." >&2
while IFS= read -r file; do
  # Only check new source files (not tests, not types, not configs)
  if echo "$file" | grep -qE '\.(test|spec)\.(ts|js)$'; then
    continue
  fi
  if echo "$file" | grep -qE '(types/index|\.d\.ts|config|fixtures)'; then
    continue
  fi
  if [[ "$file" == packages/*/src/* ]]; then
    # Derive expected test file path
    base=$(basename "$file" | sed 's/\.ts$/.test.ts/' | sed 's/\.js$/.test.js/')
    ws=$(echo "$file" | cut -d'/' -f1-2)
    test_dir="$ws/tests"

    # Check if any test file references this module
    module_name=$(basename "$file" | sed 's/\.[^.]*$//')
    has_test=false

    if [[ -f "$test_dir/$base" ]]; then
      has_test=true
    elif grep -rlq "$module_name" "$test_dir/" 2>/dev/null; then
      has_test=true
    fi

    if [[ "$has_test" != "true" ]]; then
      findings=$(echo "$findings" | jq -c \
        --arg f "$file" --arg s "medium" \
        --arg m "New/modified source file has no corresponding test" --arg src "coverage-gap" \
        '. + [{"file":$f,"line":0,"severity":$s,"message":$m,"source":$src}]')
    fi
  fi
done <<< "$changed_files"

echo "$findings" | jq '.' > "$OUTPUT_FILE"
count=$(echo "$findings" | jq 'length')
echo "Test coverage check complete: $count finding(s) written to $OUTPUT_FILE" >&2
exit 0
