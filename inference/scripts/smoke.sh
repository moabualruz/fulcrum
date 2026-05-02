#!/usr/bin/env bash
# Smoke test: start inference-server, send health JSON-RPC, assert "status":"ok".
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY="${1:-"$SCRIPT_DIR/../target/release/inference-server"}"

if [[ ! -x "$BINARY" ]]; then
    echo "ERROR: binary not found at $BINARY (run cargo build --release first)" >&2
    exit 1
fi

run_with_timeout() {
    local seconds="$1"
    shift

    local out
    local err
    out=$(mktemp)
    err=$(mktemp)

    "$@" >"$out" 2>"$err" &
    local pid=$!

    for _ in $(seq 1 "$((seconds * 10))"); do
        if ! kill -0 "$pid" 2>/dev/null; then
            wait "$pid"
            local rc=$?
            cat "$out"
            cat "$err" >&2
            rm -f "$out" "$err"
            return "$rc"
        fi
        sleep 0.1
    done

    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    cat "$err" >&2
    rm -f "$out" "$err"
    return 124
}

# Test 1: --version exits 0 and prints semver.
version=$("$BINARY" --version)
if ! echo "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+'; then
    echo "FAIL: --version output not semver: $version" >&2
    exit 1
fi
echo "PASS: --version => $version"

# Test 2: stdio transport health request. Keep FULCRUM_HOME set to prove
# piped stdin wins over socket mode in normal Fulcrum shells.
STDIO_HOME=$(mktemp -d)
stdio_resp=$(FULCRUM_HOME="$STDIO_HOME" run_with_timeout 3 bash -c \
    "printf '%s\n' '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"health\",\"params\":{}}' | \"$BINARY\"")
rm -rf "$STDIO_HOME"
if ! echo "$stdio_resp" | grep -q '"status":"ok"'; then
    echo "FAIL: stdio health response missing status:ok: $stdio_resp" >&2
    exit 1
fi
echo "PASS: stdio health => $stdio_resp"

# Test 2b: delayed writer still selects stdio before bytes are pending.
STDIO_HOME=$(mktemp -d)
delayed_stdio_resp=$(FULCRUM_HOME="$STDIO_HOME" run_with_timeout 3 bash -c \
    "{ sleep 0.1; printf '%s\n' '{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"health\",\"params\":{}}'; } | \"$BINARY\"")
rm -rf "$STDIO_HOME"
if ! echo "$delayed_stdio_resp" | grep -q '"status":"ok"'; then
    echo "FAIL: delayed stdio health response missing status:ok: $delayed_stdio_resp" >&2
    exit 1
fi
echo "PASS: delayed stdio health => $delayed_stdio_resp"

# Test 3: Unix socket transport (requires socat or nc with -U support).
SOCK_DIR=$(mktemp -d)
SOCK_PATH="$SOCK_DIR/inference.sock"

cleanup() {
    if [[ -n "${SERVER_PID:-}" ]]; then
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
    rm -rf "$SOCK_DIR"
}
trap cleanup EXIT

FULCRUM_HOME="$SOCK_DIR" "$BINARY" </dev/null &
SERVER_PID=$!

# Wait up to 3 s for socket to appear.
for i in $(seq 1 30); do
    [[ -S "$SOCK_PATH" ]] && break
    sleep 0.1
done

if [[ ! -S "$SOCK_PATH" ]]; then
    echo "FAIL: socket $SOCK_PATH not created after 3s" >&2
    exit 1
fi

REQUEST='{"jsonrpc":"2.0","id":2,"method":"health","params":{}}'

if command -v socat &>/dev/null; then
    sock_resp=$(printf '%s\n' "$REQUEST" | socat -t 3 STDIN UNIX-CONNECT:"$SOCK_PATH")
elif command -v nc &>/dev/null; then
    sock_resp=$(printf '%s\n' "$REQUEST" | nc -U "$SOCK_PATH")
else
    echo "SKIP: neither socat nor nc available; socket transport not tested" >&2
    echo "DONE: all available smoke tests passed"
    exit 0
fi

if ! echo "$sock_resp" | grep -q '"status":"ok"'; then
    echo "FAIL: socket health response missing status:ok: $sock_resp" >&2
    exit 1
fi
echo "PASS: socket health => $sock_resp"

echo "DONE: all smoke tests passed"
