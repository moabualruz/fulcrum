#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"
export FULCRUM_STATE_ROOT="${FULCRUM_STATE_ROOT:-/tmp/fulcrum-product-install-readiness}"
rm -rf "$FULCRUM_STATE_ROOT"

pnpm install --frozen-lockfile
pnpm build:package

pnpm start -- --help >/tmp/fulcrum-package-help.txt
pnpm start -- --json setup apply >/tmp/fulcrum-package-setup.json
pnpm start -- --json doctor --no-network >/tmp/fulcrum-package-doctor.json
pnpm start -- tui --view dashboard >/tmp/fulcrum-package-tui.txt
pnpm start -- --json mcp tools >/tmp/fulcrum-package-mcp.json

SERVER_LOG=/tmp/fulcrum-package-server.log
SERVER_PORT="${FULCRUM_PACKAGE_SERVER_PORT:-$((3410 + (RANDOM % 1000)))}"
export FULCRUM_PACKAGE_SERVER_PORT="$SERVER_PORT"
pnpm start -- --json server start --bind "127.0.0.1:$SERVER_PORT" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

node <<'EOF'
const deadline = Date.now() + 15000;
const port = process.env.FULCRUM_PACKAGE_SERVER_PORT;
const url = `http://127.0.0.1:${port}/`;

async function waitForServer() {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      const body = await response.text();
      if (!response.ok) throw new Error(`unexpected status ${response.status}`);
      if (!body.includes("<!doctype html>") && !body.includes("<div id=\"root\">")) {
        throw new Error("cockpit root not served");
      }
      return;
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("timed out waiting for packaged server");
}

waitForServer().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
EOF

grep -q '"privacyStatus": "local_only"' "$SERVER_LOG"
grep -q '"status": "ok"' "$SERVER_LOG"

test -s apps/cockpit/dist/index.html
test -s /tmp/fulcrum-package-tui.txt
