#!/bin/bash
# Compress markdown files using caveman CLI.
# Idempotent: skips files that already have a .original.md backup.
#
# Usage:
#   scripts/compress-with-caveman.sh                  # default targets
#   scripts/compress-with-caveman.sh <file> [...]    # explicit files
#   scripts/compress-with-caveman.sh --check          # dry-run, exit 1 if pending

set -e

# Resolve caveman compress directory dynamically
CAVEMAN_BASE="$HOME/.claude/plugins/cache/caveman/caveman"
if [ ! -d "$CAVEMAN_BASE" ]; then
    echo "ERROR: Caveman not installed."
    echo "Install with: claude plugin install caveman@caveman"
    exit 1
fi

# Find the hash subdirectory (should be exactly one)
HASH_DIR=$(ls "$CAVEMAN_BASE" 2>/dev/null | head -1)
if [ -z "$HASH_DIR" ]; then
    echo "ERROR: Caveman cache directory is empty."
    echo "Install with: claude plugin install caveman@caveman"
    exit 1
fi

COMPRESS_DIR="$CAVEMAN_BASE/$HASH_DIR/skills/compress"
if [ ! -d "$COMPRESS_DIR" ]; then
    echo "ERROR: Caveman compress module not found at $COMPRESS_DIR"
    exit 1
fi

# Parse arguments
CHECK_MODE=false
TARGETS=()

for arg in "$@"; do
    if [ "$arg" = "--check" ]; then
        CHECK_MODE=true
    else
        TARGETS+=("$arg")
    fi
done

# If no targets provided, use defaults
if [ ${#TARGETS[@]} -eq 0 ]; then
    # Collect default targets from current directory
    # skills/*/SKILL.md (excluding _template)
    while IFS= read -r file; do
        TARGETS+=("$file")
    done < <(find skills -maxdepth 2 -name "SKILL.md" ! -path "skills/_template/*" | sort)

    # rules/AGENTS.md
    [ -f "rules/AGENTS.md" ] && TARGETS+=("rules/AGENTS.md")

    # ./AGENTS.md
    [ -f "AGENTS.md" ] && TARGETS+=("AGENTS.md")

    # skills/SOURCES.md
    [ -f "skills/SOURCES.md" ] && TARGETS+=("skills/SOURCES.md")

    # docs/*.md (excluding README.md and HANDOVER.md)
    while IFS= read -r file; do
        TARGETS+=("$file")
    done < <(find docs -maxdepth 1 -name "*.md" ! -name "README.md" ! -name "HANDOVER.md" ! -name "*.original.md" | sort)
fi

# Process each target
PENDING_COUNT=0
COMPRESSED_COUNT=0
SKIPPED_COUNT=0

for target in "${TARGETS[@]}"; do
    # Resolve to absolute path
    if [[ "$target" != /* ]]; then
        target="$(cd "$(dirname "$target")" && pwd)/$(basename "$target")"
    fi

    # Normalize path (remove duplicate slashes, resolve . and ..)
    target="$(cd "$(dirname "$target")" 2>/dev/null && pwd)/$(basename "$target")" || continue

    # Skip if file doesn't exist
    if [ ! -f "$target" ]; then
        continue
    fi

    # Skip if in excluded directories
    if [[ "$target" =~ /(dist|node_modules|eval-results)/ ]]; then
        continue
    fi

    # Skip if excluded files (HANDOVER.md, README.md)
    case "$(basename "$target")" in
        HANDOVER.md|README.md)
            continue
            ;;
    esac

    # Check if already compressed (has .original.md sibling)
    BACKUP_FILE="${target%.md}.original.md"

    if [ -f "$BACKUP_FILE" ]; then
        # Already compressed
        if [ "$CHECK_MODE" = true ]; then
            echo "SKIP $target (already compressed)"
        else
            echo "SKIP $target (already compressed)"
        fi
        SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
        continue
    fi

    # File needs compression
    if [ "$CHECK_MODE" = true ]; then
        echo "PENDING $target"
        PENDING_COUNT=$((PENDING_COUNT + 1))
    else
        # Perform compression
        if cd "$COMPRESS_DIR" && python3 -m scripts "$target" > /dev/null 2>&1; then
            echo "COMPRESS $target"
            COMPRESSED_COUNT=$((COMPRESSED_COUNT + 1))
        else
            echo "ERROR: Failed to compress $target" >&2
            exit 1
        fi
    fi
done

# Report results
if [ "$CHECK_MODE" = true ]; then
    if [ $PENDING_COUNT -gt 0 ]; then
        exit 1
    else
        exit 0
    fi
else
    if [ $COMPRESSED_COUNT -gt 0 ] || [ $SKIPPED_COUNT -gt 0 ]; then
        exit 0
    else
        exit 0
    fi
fi
