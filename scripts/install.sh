#!/usr/bin/env bash
# Fulcrum installer — copies hooks and skills from this repo into the local user paths.
# Idempotent: safe to re-run after edits to refresh installed copies.
#
# What this DOES:
#   - Copies hooks/*.sh to ~/.fulcrum/hooks/ and chmods +x
#   - Creates ~/.fulcrum/state/
#   - Initialises ~/vault/ with the directory structure and ADR registry seed (if missing)
#   - Copies skills/*/SKILL.md to ~/.claude/skills/<name>/
#   - Prints the JSON snippet to add to ~/.claude/settings.json (does NOT modify it)
#
# What this DOES NOT do:
#   - Modify ~/.claude/settings.json (manual review — print snippet at the end)
#   - Create the vault GitHub remote (run `gh repo create vault --private` separately)
#   - Install plugins or extensions (deferred per design)
#   - Mirror skills to other agents (use scripts/sync-skills.sh)
#   - Bring up Plane (use scripts/plane-up.sh)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VAULT="${VAULT:-$HOME/vault}"

echo "Fulcrum install — source: $REPO_DIR"
echo

# 1. Hooks
echo "1/4  Copying hooks → ~/.fulcrum/hooks/"
mkdir -p "$HOME/.fulcrum/hooks" "$HOME/.fulcrum/state"
cp "$REPO_DIR/hooks/"*.sh "$HOME/.fulcrum/hooks/"
chmod +x "$HOME/.fulcrum/hooks/"*.sh
echo "     installed: $(ls "$HOME/.fulcrum/hooks/" | tr '\n' ' ')"
echo

# 2. Vault structure
echo "2/4  Initialising vault → $VAULT"
mkdir -p "$VAULT/cross-project/"{patterns,tools,anti-patterns}
mkdir -p "$VAULT/project-specific" "$VAULT/pending-global"

if [ ! -f "$VAULT/cross-project/adr-registry.md" ]; then
  cat > "$VAULT/cross-project/adr-registry.md" <<'EOF'
# ADR Registry

> Globally unique ADR numbers across all projects. Append-only.
> Skills creating an ADR claim the next G-NNNN, append a row, then write the file.

| Number | Date | Project | Topic | Status | File |
|---|---|---|---|---|---|
EOF
  echo "     created adr-registry.md (empty)"
fi

if [ ! -f "$VAULT/.gitignore" ]; then
  cat > "$VAULT/.gitignore" <<'EOF'
.DS_Store
.obsidian/workspace*
.obsidian/cache
*.tmp
EOF
  echo "     created .gitignore"
fi

if [ ! -d "$VAULT/.git" ]; then
  echo "     vault is not a git repo yet. After this script:"
  echo "       cd $VAULT && git init && gh repo create vault --private --source . --push"
fi
echo

# 3. Skills (Claude Code canonical)
echo "3/4  Copying skills → ~/.claude/skills/"
mkdir -p "$HOME/.claude/skills"
for skill_dir in "$REPO_DIR/skills/"*/; do
  name=$(basename "$skill_dir")
  mkdir -p "$HOME/.claude/skills/$name"
  cp "$skill_dir/SKILL.md" "$HOME/.claude/skills/$name/SKILL.md"
  echo "     installed: $name"
done
echo

# 4. Settings snippet (printed only — DO NOT auto-merge)
echo "4/4  Settings registration"
echo
echo "Add this to ~/.claude/settings.json (merge with existing 'hooks' if present):"
echo
cat <<'EOF'
{
  "hooks": {
    "SessionStart": [
      {"hooks": [{"type": "command", "command": "~/.fulcrum/hooks/index-check.sh"}]},
      {"hooks": [{"type": "command", "command": "~/.fulcrum/hooks/session-start.sh"}]}
    ],
    "Stop": [
      {"hooks": [{"type": "command", "command": "~/.fulcrum/hooks/index-rebuild.sh"}]},
      {"hooks": [{"type": "command", "command": "~/.fulcrum/hooks/session-stop.sh"}]}
    ]
  }
}
EOF
echo
echo "Done. Re-run this script after editing hooks/ or skills/ to refresh installed copies."
