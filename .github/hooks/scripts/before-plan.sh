#!/usr/bin/env bash
# Before-plan hook: gates preconditions and injects context for speckit.plan.
# Triggers on SubagentStart; passes through silently for non-plan agents.
set -euo pipefail

# ── Debug logging ──
LOG_DIR=".github/hooks/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/before-plan.log"
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

ERRORS=""

# ── Gate: spec.md exists ──
if [[ ! -f "${SPEC_FOLDER}/spec.md" ]]; then
  ERRORS="${ERRORS}spec.md not found in ${SPEC_FOLDER}/\n"
fi

# ── Gate: Required spec sections ──
# Matches: "### Functional Requirements", "## FR", etc.
if [[ -f "${SPEC_FOLDER}/spec.md" ]]; then
  if ! grep -qiE '^#{1,4}\s+(Functional Requirements|FR)\b' "${SPEC_FOLDER}/spec.md" 2>/dev/null; then
    ERRORS="${ERRORS}spec.md missing Functional Requirements section\n"
    log "Gate failed: Functional Requirements heading not found"
  fi
  if ! grep -qiE '^#{1,4}\s+(Non-Functional Requirements|NFR)\b' "${SPEC_FOLDER}/spec.md" 2>/dev/null; then
    ERRORS="${ERRORS}spec.md missing Non-Functional Requirements section\n"
    log "Gate failed: Non-Functional Requirements heading not found"
  fi
fi

# ── Gate: data-model.md exists ──
if [[ ! -f "${SPEC_FOLDER}/data-model.md" ]]; then
  ERRORS="${ERRORS}data-model.md not found in ${SPEC_FOLDER}/\n"
fi

# ── Gate: research.md exists ──
if [[ ! -f "${SPEC_FOLDER}/research.md" ]]; then
  ERRORS="${ERRORS}research.md not found in ${SPEC_FOLDER}/\n"
fi

# ── If gates failed → ask user for confirmation ──
if [[ -n "$ERRORS" ]]; then
  log "Gates failed. Asking for confirmation."
  HOOK_ERRORS="$ERRORS" node -e '
    const errors = process.env.HOOK_ERRORS.replace(/\\n/g, "\n").trim();
    const output = {
      hookSpecificOutput: {
        hookEventName: "SubagentStart",
        permissionDecision: "ask",
        permissionDecisionReason: "Plan prerequisites not met:\n" + errors + "\n\nProceeding may produce an incomplete plan."
      }
    };
    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  '
  exit 0
fi

log "All gates passed. Injecting context."
# ── All gates passed → inject context ──

# 1. Spec folder contents listing
SPEC_LISTING=$(ls -1 "${SPEC_FOLDER}/" 2>/dev/null | tr '\n' ', ' | sed 's/,$//')

# 2. Spec.md key section headings (top 30)
SPEC_SECTIONS=$(grep -E '^#{1,3}\s' "${SPEC_FOLDER}/spec.md" 2>/dev/null | head -30)

# 3. Plan artifact status
PLAN_STATUS="not created"
[[ -f "${SPEC_FOLDER}/plan.md" ]] && PLAN_STATUS="exists ($(wc -l < "${SPEC_FOLDER}/plan.md" | tr -d ' ') lines)"
TASKS_STATUS="not created"
[[ -f "${SPEC_FOLDER}/tasks.md" ]] && TASKS_STATUS="exists ($(wc -l < "${SPEC_FOLDER}/tasks.md" | tr -d ' ') lines)"

HOOK_SPEC_FOLDER="$SPEC_FOLDER" \
HOOK_LISTING="$SPEC_LISTING" \
HOOK_SECTIONS="$SPEC_SECTIONS" \
HOOK_PLAN_STATUS="$PLAN_STATUS" \
HOOK_TASKS_STATUS="$TASKS_STATUS" \
node -e '
  const { HOOK_SPEC_FOLDER, HOOK_LISTING, HOOK_SECTIONS, HOOK_PLAN_STATUS, HOOK_TASKS_STATUS } = process.env;
  const msg = [
    "PLAN HOOK — Pre-plan context injected automatically:",
    "",
    "## Active Spec Folder: " + HOOK_SPEC_FOLDER,
    "Contents: " + HOOK_LISTING,
    "",
    "## spec.md Sections:",
    HOOK_SECTIONS,
    "",
    "## Existing Artifacts:",
    "- plan.md: " + HOOK_PLAN_STATUS,
    "- tasks.md: " + HOOK_TASKS_STATUS,
    "",
    "All prerequisites verified. Proceed with planning."
  ].join("\n");
  process.stdout.write(JSON.stringify({ systemMessage: msg }, null, 2) + "\n");
'
