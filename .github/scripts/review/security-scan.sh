#!/usr/bin/env bash
# security-scan.sh — Scan changed files for security issues.
#
# Checks: npm audit, hardcoded secrets, string-concatenated SQL, sensitive console.log
# Outputs: security-findings.json
# Always exits 0.

set -uo pipefail

: "${PR_NUMBER:?PR_NUMBER environment variable is required}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${OUTPUT_DIR:-.}/security-findings.json"

findings='[]'

# --- npm audit ---
echo "Running npm audit ..." >&2
audit_output=$(npm audit --json 2>/dev/null || true)

if [[ -n "$audit_output" ]]; then
  vuln_count=$(echo "$audit_output" | jq '.metadata.vulnerabilities // {} | to_entries | map(select(.key != "info" and .key != "low" and .value > 0)) | length' 2>/dev/null || echo 0)
  if [[ "$vuln_count" -gt 0 ]]; then
    # Extract moderate+ vulnerabilities
    parsed=$(echo "$audit_output" | jq -c '
      [.vulnerabilities // {} | to_entries[] |
        select(.value.severity != "info" and .value.severity != "low") |
        {
          file: "package.json",
          line: 0,
          severity: (if .value.severity == "critical" then "critical"
                     elif .value.severity == "high" then "high"
                     else "medium" end),
          message: "npm audit: " + .key + " (" + .value.severity + ") — " + (.value.title // "vulnerability detected"),
          source: "npm-audit"
        }
      ]' 2>/dev/null || echo '[]')
    findings=$(echo "$findings $parsed" | jq -s '.[0] + .[1]')
  fi
fi

# --- Hardcoded secrets in changed files ---
echo "Scanning for hardcoded secrets ..." >&2
changed_files=$("$SCRIPT_DIR/get-changed-files.sh" --filter-ext ts,js,mjs,json)

# Patterns that indicate hardcoded secrets (value after = is a string literal, not env ref)
secret_patterns=(
  '(password|passwd|pwd)\s*[:=]\s*["\x27][^"\x27]{4,}'
  '(api[_-]?key|apikey)\s*[:=]\s*["\x27][^"\x27]{4,}'
  '(secret|token)\s*[:=]\s*["\x27][^"\x27]{8,}'
  '(private[_-]?key)\s*[:=]\s*["\x27][^"\x27]{8,}'
  'Authorization.*Bearer\s+[A-Za-z0-9\-._~+/]+=*'
)

# Files to exclude from secret scanning
exclude_pattern='(\.env\.example|fixtures/|__fixtures__|\.test\.|\.spec\.|test-data|README)'

while IFS= read -r file; do
  [[ -z "$file" || ! -f "$file" ]] && continue
  # Skip excluded patterns
  if echo "$file" | grep -qE "$exclude_pattern"; then
    continue
  fi

  for pattern in "${secret_patterns[@]}"; do
    matches=$(grep -nEi "$pattern" "$file" 2>/dev/null || true)
    while IFS= read -r match; do
      [[ -z "$match" ]] && continue
      lineno=$(echo "$match" | cut -d: -f1)
      # Skip if it references process.env or an env variable
      line_content=$(echo "$match" | cut -d: -f2-)
      if echo "$line_content" | grep -qE 'process\.env|getenv|os\.environ|ENV\['; then
        continue
      fi
      findings=$(echo "$findings" | jq -c \
        --arg f "$file" --arg l "$lineno" --arg s "critical" \
        --arg m "Possible hardcoded secret detected" --arg src "secret-scan" \
        '. + [{"file":$f,"line":($l|tonumber),"severity":$s,"message":$m,"source":$src}]')
    done <<< "$matches"
  done
done <<< "$changed_files"

# --- String-concatenated SQL ---
echo "Scanning for SQL injection risks ..." >&2
changed_ts=$("$SCRIPT_DIR/get-changed-files.sh" --filter-ext ts,js)

while IFS= read -r file; do
  [[ -z "$file" || ! -f "$file" ]] && continue
  if echo "$file" | grep -qE "$exclude_pattern"; then
    continue
  fi

  # Look for template literals in SQL contexts: db.exec(`...${...}`) or .run(`...${...}`)
  matches=$(grep -nE '(\.exec|\.run|\.prepare|\.all|\.get|query)\s*\(\s*`[^`]*\$\{' "$file" 2>/dev/null || true)
  while IFS= read -r match; do
    [[ -z "$match" ]] && continue
    lineno=$(echo "$match" | cut -d: -f1)
    findings=$(echo "$findings" | jq -c \
      --arg f "$file" --arg l "$lineno" --arg s "critical" \
      --arg m "Possible SQL injection: string interpolation in query" --arg src "sql-scan" \
      '. + [{"file":$f,"line":($l|tonumber),"severity":$s,"message":$m,"source":$src}]')
  done <<< "$matches"
done <<< "$changed_ts"

# --- Sensitive console.log ---
echo "Scanning for sensitive data in logs ..." >&2
while IFS= read -r file; do
  [[ -z "$file" || ! -f "$file" ]] && continue
  if echo "$file" | grep -qE "$exclude_pattern"; then
    continue
  fi

  matches=$(grep -nEi 'console\.(log|info|debug|warn)\s*\(.*\b(password|secret|token|apiKey|api_key|credential|private_key)\b' "$file" 2>/dev/null || true)
  while IFS= read -r match; do
    [[ -z "$match" ]] && continue
    lineno=$(echo "$match" | cut -d: -f1)
    findings=$(echo "$findings" | jq -c \
      --arg f "$file" --arg l "$lineno" --arg s "high" \
      --arg m "Possible sensitive data in log output" --arg src "log-scan" \
      '. + [{"file":$f,"line":($l|tonumber),"severity":$s,"message":$m,"source":$src}]')
  done <<< "$matches"
done <<< "$changed_ts"

echo "$findings" | jq '.' > "$OUTPUT_FILE"
count=$(echo "$findings" | jq 'length')
echo "Security scan complete: $count finding(s) written to $OUTPUT_FILE" >&2
exit 0
