#!/usr/bin/env bash
# Fulcrum lint-skill — validate a SKILL.md against the strictest union of
# all 5 agents' frontmatter rules:
#   - name:        lowercase + digits + hyphens, 1..64 chars, no reserved words
#                  ("anthropic", "claude"); directory name must equal `name`
#   - description: 1..1024 chars, no XML tags
#
# Usage:
#   scripts/lint-skill.sh <path-to-SKILL.md>          # lint one
#   scripts/lint-skill.sh skills/                     # lint every skills/<name>/SKILL.md

set -euo pipefail

ERR=0

lint_one() {
  local file="$1"
  local dir name desc

  if [ ! -f "$file" ]; then
    echo "✗ $file: not a file" >&2; ERR=1; return
  fi

  dir="$(basename "$(dirname "$file")")"

  # Extract YAML frontmatter (first --- block).
  local fm
  fm="$(awk 'BEGIN{n=0} /^---$/{n++; next} n==1{print} n==2{exit}' "$file")"
  if [ -z "$fm" ]; then
    echo "✗ $file: missing YAML frontmatter" >&2; ERR=1; return
  fi

  name="$(printf '%s\n' "$fm"  | awk -F': *' '/^name:/{print $2; exit}'        | tr -d '"' | tr -d "'")"
  desc="$(printf '%s\n' "$fm"  | awk -F': *' '/^description:/{sub(/^description: */,""); print; exit}' \
                                | sed 's/^"//; s/"$//; s/^'\''//; s/'\''$//')"

  local fail=()

  # name checks
  if [ -z "$name" ]; then
    fail+=("missing 'name' in frontmatter")
  else
    [[ "$name" =~ ^[a-z0-9-]+$ ]]   || fail+=("name '$name' must be lowercase + digits + hyphens")
    [ ${#name} -le 64 ]              || fail+=("name length ${#name} exceeds 64")
    [[ "$name" =~ (anthropic|claude) ]] && fail+=("name '$name' contains reserved word")
    [ "$name" = "$dir" ]             || fail+=("name '$name' must equal directory '$dir'")
  fi

  # description checks
  if [ -z "$desc" ]; then
    fail+=("missing 'description' in frontmatter")
  else
    [ ${#desc} -le 1024 ]            || fail+=("description length ${#desc} exceeds 1024")
    [[ "$desc" =~ \<[a-zA-Z/] ]]    && fail+=("description contains XML-like tags")
  fi

  if [ ${#fail[@]} -eq 0 ]; then
    echo "✓ $file  (name=$name, desc=${#desc}c)"
  else
    echo "✗ $file"
    for m in "${fail[@]}"; do echo "    - $m"; done
    ERR=1
  fi
}

if [ $# -eq 0 ]; then
  echo "usage: $0 <SKILL.md | skills/dir>" >&2
  exit 2
fi

target="$1"
if [ -d "$target" ]; then
  shopt -s nullglob
  for d in "$target"/*/; do
    name="$(basename "$d")"
    [ "$name" = "_template" ] && continue
    [ -f "$d/SKILL.md" ] || continue
    lint_one "$d/SKILL.md"
  done
elif [ -f "$target" ]; then
  lint_one "$target"
else
  echo "no such file or directory: $target" >&2
  exit 2
fi

exit $ERR
