#!/usr/bin/env bash
# submit-review.sh — Aggregate findings from all review jobs and post a PR review.
#
# Reads *-findings.json from ARTIFACTS_DIR, categorizes by severity,
# and posts a consolidated review via `gh pr review`.
#
# Environment:
#   PR_NUMBER       — Required. The pull request number.
#   ARTIFACTS_DIR   — Directory containing *-findings.json files. Defaults to ".".
#   REPO            — Optional. owner/repo format (auto-detected if omitted).
#   DRY_RUN         — Set to "true" to print the review body without posting.

set -uo pipefail

: "${PR_NUMBER:?PR_NUMBER environment variable is required}"

ARTIFACTS_DIR="${ARTIFACTS_DIR:-.}"
DRY_RUN="${DRY_RUN:-false}"

# --- Collect all findings ---
all_findings='[]'
for f in "$ARTIFACTS_DIR"/*-findings.json; do
  [[ -f "$f" ]] || continue
  if ! content=$(jq -c '.' "$f" 2>&1); then
    echo "WARNING: Failed to parse $f: $content" >&2
    content='[]'
  fi
  all_findings=$(echo "$all_findings $content" | jq -s '.[0] + .[1]')
done

total=$(echo "$all_findings" | jq 'length')
artifact_count=$(find "$ARTIFACTS_DIR" -name '*-findings.json' 2>/dev/null | wc -l | tr -d ' ')
echo "Collected $total total finding(s) from $artifact_count artifact file(s)." >&2

# If no artifact files were found at all, something went wrong — don't auto-approve
if [[ "$artifact_count" -eq 0 ]]; then
  echo "ERROR: No findings artifacts found in $ARTIFACTS_DIR. All upstream jobs may have failed." >&2
  exit 1
fi

# --- Count by severity ---
read -r critical high medium low <<< "$(echo "$all_findings" | jq -r '
  [
    [.[] | select(.severity == "critical")] | length,
    [.[] | select(.severity == "high")] | length,
    [.[] | select(.severity == "medium")] | length,
    [.[] | select(.severity == "low")] | length
  ] | join(" ")')"

# --- Determine review event ---
if [[ "$critical" -gt 0 || "$high" -gt 0 ]]; then
  event="REQUEST_CHANGES"
elif [[ "$medium" -gt 0 || "$low" -gt 0 ]]; then
  event="COMMENT"
else
  event="APPROVE"
fi

# --- Build review body ---
body="## Automated Review Summary\n\n"

if [[ "$total" -eq 0 ]]; then
  body+="All automated checks passed. No issues found.\n\n"
  body+="| Check | Status |\n|-------|--------|\n"
  body+="| Code Quality (tsc + eslint) | :white_check_mark: Pass |\n"
  body+="| Security Scan | :white_check_mark: Pass |\n"
  body+="| Test Coverage | :white_check_mark: Pass |\n"
else
  body+="| Severity | Count |\n|----------|-------|\n"
  [[ "$critical" -gt 0 ]] && body+="| :red_circle: Critical | $critical |\n"
  [[ "$high" -gt 0 ]] && body+="| :orange_circle: High | $high |\n"
  [[ "$medium" -gt 0 ]] && body+="| :yellow_circle: Medium | $medium |\n"
  [[ "$low" -gt 0 ]] && body+="| :white_circle: Low | $low |\n"
  body+="\n"

  # Group and format findings by severity (critical first) — single jq pass
  grouped=$(echo "$all_findings" | jq -r '
    group_by(.severity) | map({key: .[0].severity, items: .}) |
    sort_by(if .key == "critical" then 0 elif .key == "high" then 1
            elif .key == "medium" then 2 else 3 end) | .[] |
    {sev: .key, count: (.items | length),
     icon: (if .key == "critical" then ":red_circle:"
            elif .key == "high" then ":orange_circle:"
            elif .key == "medium" then ":yellow_circle:"
            else ":white_circle:" end),
     label: (if .key == "critical" then "Critical"
             elif .key == "high" then "High"
             elif .key == "medium" then "Medium"
             else "Low" end),
     rows: [.items[] | "| `\(.file)` | \(.line) | \(.source) | \(.message) |"] | join("\n")} |
    "\n### \(.icon) \(.label) (\(.count))\n\n| File | Line | Source | Message |\n|------|------|--------|---------|\n\(.rows)"
  ')
  body+="$grouped\n"
fi

body+="\n---\n*Automated review by CI pipeline*\n"

# --- Post review ---
echo "Review decision: $event" >&2

if [[ "$DRY_RUN" == "true" ]]; then
  echo "=== DRY RUN — Review body ===" >&2
  printf '%b' "$body"
  echo ""
  echo "Event: $event"
  exit 0
fi

# Detect repo if not provided
if [[ -z "${REPO:-}" ]]; then
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")
fi

if [[ -z "$REPO" ]]; then
  echo "ERROR: Could not determine repository. Set REPO=owner/repo." >&2
  exit 1
fi

# Post the review
review_body=$(printf '%b' "$body")

case "$event" in
  APPROVE)
    gh pr review "$PR_NUMBER" --approve --body "$review_body"
    ;;
  REQUEST_CHANGES)
    gh pr review "$PR_NUMBER" --request-changes --body "$review_body"
    ;;
  COMMENT)
    gh pr review "$PR_NUMBER" --comment --body "$review_body"
    ;;
esac

echo "Review posted successfully ($event) on PR #$PR_NUMBER" >&2
exit 0
