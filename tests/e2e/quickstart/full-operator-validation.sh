#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
STATE_ROOT="${FULCRUM_QUICKSTART_STATE_ROOT:-$(mktemp -d "${TMPDIR:-/tmp}/fulcrum-full-operator.XXXXXX")}"
PROJECT_ROOT="${FULCRUM_QUICKSTART_PROJECT_ROOT:-$(mktemp -d "${TMPDIR:-/tmp}/fulcrum-project.XXXXXX")}"
CLI_DIR="$ROOT_DIR/apps/cli"

export FULCRUM_STATE_ROOT="$STATE_ROOT"

record_evidence() {
  local name="$1"
  local body="$2"
  mkdir -p "$STATE_ROOT/evidence"
  printf '%s\n' "$body" > "$STATE_ROOT/evidence/$name"
}

assert_json_status_ok() {
  node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(0,"utf8")); if (p.status !== "ok") process.exit(1)'
}

setup_preview="$(pnpm --dir "$CLI_DIR" exec tsx src/main.ts --json setup preview)"
record_evidence setup-preview.json "$setup_preview"
assert_json_status_ok <<<"$setup_preview"

setup_apply="$(pnpm --dir "$CLI_DIR" exec tsx src/main.ts --json setup apply)"
record_evidence setup-apply.json "$setup_apply"
assert_json_status_ok <<<"$setup_apply"

doctor="$(pnpm --dir "$CLI_DIR" exec tsx src/main.ts --json doctor)"
record_evidence doctor.json "$doctor"
node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(0,"utf8")); if (p.data.blockingCount !== 0) process.exit(1)' <<<"$doctor"

project="$(pnpm --dir "$CLI_DIR" exec tsx src/main.ts --json project register "$PROJECT_ROOT")"
record_evidence project-register.json "$project"
project_id="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(0,"utf8")); process.stdout.write(p.data.projectId)' <<<"$project")"

task="$(pnpm --dir "$CLI_DIR" exec tsx src/main.ts --json task create --project "$project_id" --title "Quickstart validation task" --label release)"
record_evidence task-create.json "$task"
task_id="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(0,"utf8")); process.stdout.write(p.data.taskId)' <<<"$task")"

task_ready="$(pnpm --dir "$CLI_DIR" exec tsx src/main.ts --json task transition "$task_id" ready)"
record_evidence task-ready.json "$task_ready"
assert_json_status_ok <<<"$task_ready"

context="$(pnpm --dir "$CLI_DIR" exec tsx src/main.ts --json context build "$task_id")"
record_evidence context-build.json "$context"
assert_json_status_ok <<<"$context"

run="$(pnpm --dir "$CLI_DIR" exec tsx src/main.ts --json run start "$task_id" --agent adapter_validation --no-worktree)"
record_evidence run-start.json "$run"
assert_json_status_ok <<<"$run"

gate="$(pnpm --dir "$CLI_DIR" exec tsx src/main.ts --json gate list --project "$project_id")"
record_evidence gate-list.json "$gate"
assert_json_status_ok <<<"$gate"

policy="$(pnpm --dir "$CLI_DIR" exec tsx src/main.ts --json policy check --action sensitive_export --subject-type export --subject quickstart --requester operator || true)"
record_evidence policy-check.json "$policy"
node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(0,"utf8")); if (!p.data.policyDecisionId) process.exit(1)' <<<"$policy"

recovery="$(pnpm --dir "$CLI_DIR" exec tsx src/main.ts --json backup create --state-root "$STATE_ROOT" --output-root "$STATE_ROOT/backups")"
record_evidence backup-preview.json "$recovery"
assert_json_status_ok <<<"$recovery"

printf 'Fulcrum full operator quickstart validation passed. Evidence: %s/evidence\n' "$STATE_ROOT"
