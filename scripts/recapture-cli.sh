#!/usr/bin/env bash
# Re-capture CLI screenshots via ttyd + playwright-cli.
# Runs each command in a fresh ttyd session so the screenshot is the command's exact terminal output.
set -euo pipefail

FULCRUM="/Users/mkh/workspace/fulcrum/dist/fulcrum-darwin-arm64"
OUT_DIR="/Users/mkh/workspace/fulcrum/docs/manuals/screenshots/cli"
PORT=7681

mkdir -p "$OUT_DIR"

capture() {
  local idx="$1"
  local name="$2"
  shift 2
  local cmd="$*"
  local file="$OUT_DIR/${idx}-${name}.png"

  echo ">>> [${idx}] ${name}: ${cmd}"
  pkill -f "ttyd.*${PORT}" 2>/dev/null || true
  sleep 0.5
  ttyd -W -p "$PORT" -t rendererType=dom -t fontSize=14 \
    bash -lc "${cmd}; echo; echo '---DONE---'; exec bash" \
    >/tmp/ttyd.log 2>&1 &
  TTYD_PID=$!
  sleep 1.5

  playwright-cli goto "http://localhost:${PORT}/" >/dev/null 2>&1 || true
  sleep 2.5
  playwright-cli screenshot --filename "${file}" >/dev/null 2>&1 || true

  kill $TTYD_PID 2>/dev/null || true
  wait $TTYD_PID 2>/dev/null || true
  echo "    saved: ${file}"
}

# 01 help
capture 01 help "$FULCRUM --help"
# 02 version
capture 02 version "$FULCRUM --version"
# 03 doctor
capture 03 doctor "$FULCRUM doctor"
# 04 doctor json
capture 04 doctor-json "$FULCRUM doctor --json | head -40"
# 05 hooks list
capture 05 hooks-list "$FULCRUM hooks list"
# 06 skills list
capture 06 skills-list "$FULCRUM skills list 2>&1 | head -30"
# 08 install help
capture 08 install-help "$FULCRUM install --help"
# 09 init help
capture 09 init-help "$FULCRUM init --help"
# 10 compress help
capture 10 compress-help "$FULCRUM compress --help"
# 11 hooks help
capture 11 hooks-help "$FULCRUM hooks --help"
# 12 skills help
capture 12 skills-help "$FULCRUM skills --help"
# 13 uninstall help
capture 13 uninstall-help "$FULCRUM uninstall --help"
# 14 compress check
capture 14 compress-check "cd /Users/mkh/workspace/fulcrum && $FULCRUM compress --check 2>&1 | head -20"
# 15 skills sync help
capture 15 skills-sync-help "$FULCRUM skills sync --help"
# 16 hooks enable help
capture 16 hooks-enable-help "$FULCRUM hooks enable --help"
# 17 doctor checks
capture 17 doctor-checks "$FULCRUM doctor --json | jq '.checks[]?.name' 2>&1 | head -30"
# 18 skills upstream help
capture 18 skills-upstream-help "$FULCRUM skills upstream --help"

pkill -f "ttyd.*${PORT}" 2>/dev/null || true
echo "ALL DONE"
