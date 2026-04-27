#!/usr/bin/env bash
# Fulcrum installer — machine-level setup.
# Idempotent: safe to re-run.
#
# What this DOES:
#   - Copies hooks/* (and hooks/recipes/*) to ~/.fulcrum/hooks/ and chmods +x
#   - Copies bin/fulcrum to ~/.local/bin (if on PATH) or ~/.fulcrum/bin
#   - Splices rules/AGENTS.md body into each detected agent's primary rules file
#     using <!-- BEGIN/END FULCRUM RULES --> sentinel markers. Re-runs replace
#     just the block; user content outside the markers is preserved.
#   - Creates ~/.fulcrum/state/ and seeds ~/.fulcrum/tool-output-policy.toml from config/
#   - Optional: --with-project [DIR]  also runs `fulcrum init` on DIR (default cwd).
#
# What this DOES NOT do:
#   - Modify any agent's settings.json / hooks.json / plugins (manual review)
#   - Install plugins or extensions
#   - Push or sync skills — use `fulcrum skills sync` after authoring

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WITH_PROJECT=""
PROJECT_DIR=""

while [ $# -gt 0 ]; do
  case "$1" in
    --with-project) WITH_PROJECT=1; PROJECT_DIR="${2:-$PWD}"; [ "${2:-}" != "" ] && shift; shift ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

echo "Fulcrum install — source: $REPO_DIR"
echo

# ── 1. Hooks ────────────────────────────────────────────────────────────
echo "1/5  Copying hooks → ~/.fulcrum/hooks/"
mkdir -p "$HOME/.fulcrum/hooks/recipes" "$HOME/.fulcrum/state"
cp "$REPO_DIR/hooks/"*.sh "$HOME/.fulcrum/hooks/" 2>/dev/null || true
if [ -d "$REPO_DIR/hooks/recipes" ]; then
  cp "$REPO_DIR/hooks/recipes/"*.sh "$HOME/.fulcrum/hooks/recipes/" 2>/dev/null || true
fi
chmod +x "$HOME/.fulcrum/hooks/"*.sh "$HOME/.fulcrum/hooks/recipes/"*.sh 2>/dev/null || true
echo "     installed: $(ls "$HOME/.fulcrum/hooks/" 2>/dev/null | grep -E '\.sh$' | tr '\n' ' ')"
[ -d "$HOME/.fulcrum/hooks/recipes" ] && \
  echo "     recipes:   $(ls "$HOME/.fulcrum/hooks/recipes/" 2>/dev/null | tr '\n' ' ')"
echo

# ── 2. Tool-output policy (default config) ─────────────────────────────
echo "2/5  Seeding ~/.fulcrum/tool-output-policy.toml"
if [ -f "$REPO_DIR/config/tool-output-policy.toml" ] && [ ! -f "$HOME/.fulcrum/tool-output-policy.toml" ]; then
  cp "$REPO_DIR/config/tool-output-policy.toml" "$HOME/.fulcrum/tool-output-policy.toml"
  echo "     installed default policy"
elif [ -f "$HOME/.fulcrum/tool-output-policy.toml" ]; then
  echo "     existing policy left intact"
else
  echo "     no default config shipped (skip)"
fi
echo

# ── 3. fulcrum CLI ─────────────────────────────────────────────────────
echo "3/5  Installing fulcrum CLI"
mkdir -p "$HOME/.fulcrum/bin"
cp "$REPO_DIR/bin/fulcrum" "$HOME/.fulcrum/bin/fulcrum"
chmod +x "$HOME/.fulcrum/bin/fulcrum"
if [ -d "$HOME/.local/bin" ] && echo "$PATH" | tr ':' '\n' | grep -qx "$HOME/.local/bin"; then
  ln -sf "$HOME/.fulcrum/bin/fulcrum" "$HOME/.local/bin/fulcrum"
  echo "     linked to ~/.local/bin/fulcrum (on PATH)"
else
  echo "     installed to ~/.fulcrum/bin/fulcrum"
  echo "     add to PATH:  export PATH=\"\$HOME/.fulcrum/bin:\$PATH\""
fi
echo

# ── 4. Rules — sentinel-block splice into each detected agent ──────────
echo "4/5  Splicing rules/AGENTS.md into per-agent rules files"
RULES="$REPO_DIR/rules/AGENTS.md"

splice_sentinel() {
  local target="$1" label="$2"
  local begin="<!-- BEGIN FULCRUM RULES -->"
  local end="<!-- END FULCRUM RULES -->"
  mkdir -p "$(dirname "$target")"
  if [ -f "$target" ] && grep -q "$begin" "$target"; then
    # Replace existing block.
    awk -v begin="$begin" -v end="$end" -v body_file="$RULES" '
      BEGIN { inblock=0 }
      $0 ~ begin { print; while ((getline line < body_file) > 0) print line; print end; inblock=1; next }
      $0 ~ end   { inblock=0; next }
      !inblock   { print }
    ' "$target" > "$target.fulcrum.tmp" && mv "$target.fulcrum.tmp" "$target"
    echo "     ↻ $label  (block replaced) → $target"
  else
    {
      [ -f "$target" ] && cat "$target"
      [ -f "$target" ] && [ -s "$target" ] && echo
      echo "$begin"
      cat "$RULES"
      echo "$end"
    } > "$target.fulcrum.tmp" && mv "$target.fulcrum.tmp" "$target"
    echo "     + $label  (block appended) → $target"
  fi
}

# Each agent's parent dir must exist for us to splice — don't create unrelated dirs.
declare -a TARGETS=(
  "$HOME/.claude/CLAUDE.md|Claude Code"
  "$HOME/.codex/AGENTS.md|Codex CLI"
  "$HOME/.config/opencode/AGENTS.md|OpenCode"
  "$HOME/.pi/agent/AGENTS.md|Pi CLI"
  "$HOME/AGENTS.md|Gemini source (referenced via @AGENTS.md)"
)

for entry in "${TARGETS[@]}"; do
  path="${entry%%|*}"
  label="${entry##*|}"
  if [ -d "$(dirname "$path")" ] || [ -f "$path" ] || [ "$path" = "$HOME/AGENTS.md" ]; then
    splice_sentinel "$path" "$label"
  else
    echo "     · skip $label (parent dir not present)"
  fi
done

# Gemini import shim
if [ -d "$HOME/.gemini" ]; then
  if [ ! -f "$HOME/.gemini/GEMINI.md" ] || ! grep -q '@AGENTS.md' "$HOME/.gemini/GEMINI.md" 2>/dev/null; then
    echo "@AGENTS.md" >> "$HOME/.gemini/GEMINI.md"
    echo "     ✓ Gemini GEMINI.md updated with @AGENTS.md import"
  fi
fi
echo

# ── 5. Optional project bootstrap ──────────────────────────────────────
if [ -n "$WITH_PROJECT" ]; then
  echo "5/5  fulcrum init $PROJECT_DIR"
  "$HOME/.fulcrum/bin/fulcrum" init "$PROJECT_DIR"
else
  echo "5/5  Skipping project init (use:  fulcrum init <dir>  or re-run with --with-project)"
fi
echo
echo "Done."
echo
echo "Next:"
echo "  • Register hooks per agent — see docs/hooks.md §6 for snippets."
echo "  • Sync skills:               fulcrum skills sync"
echo "  • Enable a hook recipe:      fulcrum hooks enable <name>"
echo "  • Bootstrap a project:       fulcrum init <dir>"
