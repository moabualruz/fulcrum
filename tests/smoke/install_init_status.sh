#!/usr/bin/env bash
set -euo pipefail

ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT

export FULCRUM_HOME="$ROOT/home"
export PATH="$ROOT/bin:$PATH"

cargo build -p fulcrum-cli -p fulcrum-daemon
mkdir -p "$ROOT/bin"
cp target/debug/fulcrum "$ROOT/bin/fulcrum"
cp target/debug/fulcrum-daemon "$ROOT/bin/fulcrum-daemon"

fulcrum init
fulcrum up
fulcrum project add .
fulcrum task create "Smoke task"
fulcrum run start task_000001
fulcrum run heartbeat run_000001 "working"
fulcrum run complete run_000001
fulcrum run watch run_000001
fulcrum artifact list run_000001
fulcrum status
fulcrum doctor
BACKUP_OUTPUT="$(fulcrum backup create)"
echo "$BACKUP_OUTPUT"
BACKUP_PATH="${BACKUP_OUTPUT##*backup=}"
fulcrum restore verify "$BACKUP_PATH"
RESTORE_HOME="$ROOT/restore-home"
FULCRUM_HOME="$RESTORE_HOME" fulcrum restore apply "$BACKUP_PATH"
fulcrum down
