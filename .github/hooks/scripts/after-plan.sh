#!/usr/bin/env bash
# After-plan hook: validates plan.md structure after speckit.plan completes.
# Triggers on SubagentStop; passes through silently for non-plan agents.
set -euo pipefail

# ── Debug logging ──
LOG_DIR=".github/hooks/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/after-plan.log"
log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG_FILE"; }

INPUT=$(cat)
log "Hook triggered. Raw input length: ${#INPUT}"

# ── Extract agent name from hook input ──
AGENT_NAME=$(printf '%s' "$INPUT" | node -e "
  const d=[];
  process.stdin.on('data',c=>d.push(c));
  process.stdin.on('end',()=>{
    try{const j=JSON.parse(Buffer.concat(d).toString());process.stdout.write(j.agentName||j.agent||'');}
    catch{process.stdout.write('');}
  });
")

# Log extracted name for debugging
if [[ -z "$AGENT_NAME" ]]; then
  log "WARNING: Could not extract agent name from stdin. Raw input: ${INPUT:0:200}"
else
  log "Agent name: $AGENT_NAME"
fi

# Only act for speckit.plan — pass through for all other agents
if [[ "$AGENT_NAME" != *"speckit.plan"* ]]; then
  log "Skipping — not speckit.plan"
  printf '{"continue":true}\n'
  exit 0
fi

# ── Detect spec folder from git branch ──
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
SPEC_FOLDER="specs/${GIT_BRANCH}"
PLAN_FILE="${SPEC_FOLDER}/plan.md"

WARNINGS=""

# ── Validate: plan.md exists ──
if [[ ! -f "$PLAN_FILE" ]]; then
  WARNINGS="plan.md was not created at ${PLAN_FILE}"
  HOOK_WARNINGS="$WARNINGS" node -e '
    const msg = "PLAN VALIDATION FAILED:\n" + process.env.HOOK_WARNINGS;
    process.stdout.write(JSON.stringify({ systemMessage: msg }, null, 2) + "\n");
  '
  exit 1  # Non-blocking warning
fi

log "Validating plan.md structure"
# ── Validate: Required sections ──
REQUIRED_SECTIONS=("Phases" "Dependencies" "Acceptance Criteria" "Risk")
for section in "${REQUIRED_SECTIONS[@]}"; do
  if ! grep -qiE "^#{1,3}\s.*${section}" "$PLAN_FILE" 2>/dev/null; then
    WARNINGS="${WARNINGS}plan.md missing required section: ${section}\n"
  fi
done
# Architecture OR Design (either heading is acceptable)
if ! grep -qiE "^#{1,3}\s.*(Architecture|Design)" "$PLAN_FILE" 2>/dev/null; then
  WARNINGS="${WARNINGS}plan.md missing required section: Architecture/Design\n"
fi

# ── Validate: Heading hierarchy (no skipped levels, e.g. h1 → h3) ──
PREV_LEVEL=0
while IFS= read -r line; do
  HASHES="${line%%[^#]*}"
  LEVEL=${#HASHES}
  if [[ $PREV_LEVEL -gt 0 && $LEVEL -gt $((PREV_LEVEL + 1)) ]]; then
    WARNINGS="${WARNINGS}Invalid heading hierarchy: jumped from h${PREV_LEVEL} to h${LEVEL} at: ${line}\n"
    break  # Report first violation only
  fi
  PREV_LEVEL=$LEVEL
done < <(grep -E '^#{1,6}\s' "$PLAN_FILE" 2>/dev/null)

# ── Report results ──
if [[ -n "$WARNINGS" ]]; then
  HOOK_WARNINGS="$WARNINGS" node -e '
    const warnings = process.env.HOOK_WARNINGS.replace(/\\n/g, "\n").trim();
    const msg = "PLAN VALIDATION — Issues found:\n" + warnings + "\n\nConsider addressing these before proceeding to task generation.";
    process.stdout.write(JSON.stringify({ systemMessage: msg }, null, 2) + "\n");
  '
  exit 1  # Non-blocking warning
fi

# All validations passed
HOOK_PLAN_FILE="$PLAN_FILE" node -e '
  const msg = "PLAN VALIDATION PASSED — " + process.env.HOOK_PLAN_FILE + " has valid structure with all required sections.";
  process.stdout.write(JSON.stringify({ systemMessage: msg }, null, 2) + "\n");
'
