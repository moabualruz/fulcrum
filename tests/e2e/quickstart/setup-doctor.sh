#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-${TMPDIR:-/tmp}/fulcrum-quickstart}"
export FULCRUM_STATE_ROOT="$ROOT"
export FULCRUM_NETWORK_DEFAULT="local-only"

pnpm --dir apps/cli exec tsx src/main.ts --json setup:preview >/tmp/fulcrum-setup-preview.json
pnpm --dir apps/cli exec tsx src/main.ts --json setup apply >/tmp/fulcrum-setup-apply.json
pnpm --dir apps/cli exec tsx src/main.ts --json doctor --no-network >/tmp/fulcrum-doctor.json

grep -q '"networkDefault": "local-only"' /tmp/fulcrum-setup-preview.json
grep -q '"status": "applied"' /tmp/fulcrum-setup-apply.json
grep -q '"networkDefault": "local-only"' /tmp/fulcrum-doctor.json
grep -q '"state": "managed"' /tmp/fulcrum-doctor.json
