#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$(pwd)}"
EVIDENCE_DIR="${FULCRUM_RELEASE_EVIDENCE_DIR:-/tmp/fulcrum-release-evidence}"
STATE_ROOT="${FULCRUM_STATE_ROOT:-/tmp/fulcrum-release-state}"

rm -rf "$EVIDENCE_DIR"
rm -rf "$STATE_ROOT"
mkdir -p "$EVIDENCE_DIR"

(
  cd "$ROOT_DIR/apps/cli"
  FULCRUM_STATE_ROOT="$STATE_ROOT" pnpm exec tsx src/main.ts --json release validate --local-only --evidence "$EVIDENCE_DIR" --root "$ROOT_DIR"
)

test -f "$EVIDENCE_DIR/release-evidence.json"
test -f "$EVIDENCE_DIR/compliance-matrix.json"
test -f "$EVIDENCE_DIR/sections/compliance-matrix.json"
node -e "const fs=require('node:fs'); const p=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); if (p.schemaVersion !== '1.0') process.exit(1); if (p.pass !== true) process.exit(1); if (!Array.isArray(p.failures) || p.failures.length !== 0) process.exit(1);" "$EVIDENCE_DIR/release-evidence.json"

echo "release readiness evidence written: $EVIDENCE_DIR/release-evidence.json"
