#!/usr/bin/env bash
# Fulcrum bootstrap installer.
#
# What this DOES (in order):
#   1. Detects platform (darwin/linux × arm64/x64; windows handled separately).
#   2. Resolves the fulcrum binary:
#        a. If FULCRUM_BIN is set, uses that.
#        b. Else if FULCRUM_RELEASE_TAG is set, fetches the prebuilt asset from
#           https://github.com/moabualruz/fulcrum/releases/download/<tag>/fulcrum-<plat>
#           via curl. Use this when you don't have a clone.
#        c. Else if a prebuilt binary exists at dist/fulcrum-<os>-<arch>, uses it.
#        d. Else if `bun` is on PATH and we're inside a clone, builds from source.
#        e. Else: prints clear instructions and exits 1.
#   3. Installs the binary to ~/.fulcrum/bin/fulcrum and (if possible) symlinks
#      to ~/.local/bin/fulcrum.
#   4. Delegates the rest to `fulcrum install` — sentinel-block rules splice,
#      recipe vendoring, policy seed, optional --with-project DIR.
#
# Pass --with-project [DIR] to also bootstrap a project after install.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WITH_PROJECT_ARGS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --with-project)
      WITH_PROJECT_ARGS=(--with-project "${2:-$PWD}")
      [ "${2:-}" != "" ] && shift
      shift ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *) echo "fulcrum install: unknown arg: $1" >&2; exit 2 ;;
  esac
done

# ── 1. Detect platform ────────────────────────────────────────────────
case "$(uname -s)" in
  Darwin) os="darwin" ;;
  Linux)  os="linux" ;;
  *)      echo "fulcrum: unsupported OS $(uname -s) (only darwin/linux are bootstrapped via this script)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64)  arch="x64" ;;
  *)             echo "fulcrum: unsupported arch $(uname -m)" >&2; exit 1 ;;
esac
plat="${os}-${arch}"
echo "fulcrum bootstrap — platform: $plat"

# ── 2. Resolve binary ─────────────────────────────────────────────────
if [ -n "${FULCRUM_BIN:-}" ] && [ -x "$FULCRUM_BIN" ]; then
  src_bin="$FULCRUM_BIN"
  echo "  using FULCRUM_BIN=$src_bin"
elif [ -n "${FULCRUM_RELEASE_TAG:-}" ]; then
  if ! command -v curl >/dev/null 2>&1; then
    echo "fulcrum: FULCRUM_RELEASE_TAG set but curl is not on PATH" >&2
    exit 1
  fi
  asset="fulcrum-$plat"
  url="https://github.com/moabualruz/fulcrum/releases/download/$FULCRUM_RELEASE_TAG/$asset"
  echo "  fetching prebuilt: $url"
  tmp="$(mktemp -t fulcrum.XXXXXX)"
  if ! curl -fSL --retry 3 -o "$tmp" "$url"; then
    rm -f "$tmp"
    echo "fulcrum: failed to download $url" >&2
    exit 1
  fi
  chmod +x "$tmp"
  src_bin="$tmp"
elif [ -x "$REPO_DIR/dist/fulcrum-$plat" ]; then
  src_bin="$REPO_DIR/dist/fulcrum-$plat"
  echo "  using prebuilt: $src_bin"
elif command -v bun >/dev/null 2>&1; then
  echo "  building from source via bun..."
  cd "$REPO_DIR"
  mkdir -p dist
  bun build --compile --minify --target="bun-$plat" src/index.ts --outfile="dist/fulcrum-$plat" >/dev/null
  src_bin="$REPO_DIR/dist/fulcrum-$plat"
  echo "  built: $src_bin"
else
  cat >&2 <<EOF
fulcrum: cannot resolve a binary.

Options (any one):
  - install Bun + clone the repo:  curl -fsSL https://bun.sh/install | bash
  - fetch a published release:     FULCRUM_RELEASE_TAG=v0.1.0 bash scripts/install.sh
  - point at a prebuilt:           FULCRUM_BIN=/path/to/fulcrum bash scripts/install.sh
  - drop a prebuilt at:            $REPO_DIR/dist/fulcrum-$plat
EOF
  exit 1
fi

# ── 3. Install binary ────────────────────────────────────────────────
mkdir -p "$HOME/.fulcrum/bin"
cp "$src_bin" "$HOME/.fulcrum/bin/fulcrum"
chmod +x "$HOME/.fulcrum/bin/fulcrum"
if [ -d "$HOME/.local/bin" ] && echo "$PATH" | tr ':' '\n' | grep -qx "$HOME/.local/bin"; then
  ln -sf "$HOME/.fulcrum/bin/fulcrum" "$HOME/.local/bin/fulcrum"
  echo "  linked to ~/.local/bin/fulcrum (on PATH)"
else
  echo "  installed to ~/.fulcrum/bin/fulcrum"
  echo "  add to PATH:  export PATH=\"\$HOME/.fulcrum/bin:\$PATH\""
fi
echo

# ── 4. Delegate to `fulcrum install` ────────────────────────────────
# Bash 3.2 + `set -u` expands an empty `${arr[@]}` to "unbound" — guard it.
FULCRUM_REPO_DIR="$REPO_DIR" exec "$HOME/.fulcrum/bin/fulcrum" install ${WITH_PROJECT_ARGS[@]+"${WITH_PROJECT_ARGS[@]}"}
