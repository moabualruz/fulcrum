#!/usr/bin/env bash
# Backup PI Agent OS state from canonical sources. Spec §8.8.
#
# Usage:
#   ./scripts/backup.sh [BACKUP_DIR]
#
# Creates a timestamped backup of:
#   - SQLite database (canonical operational truth)
#   - Agent-home artifacts directory
#   - Event JSONL logs
#   - Workflow YAML definitions
#
# Restore:
#   cp <backup>/state.db ~/.pi-agent-home/state.db
#   cp -r <backup>/artifacts ~/.pi-agent-home/artifacts
#   cp -r <backup>/events ~/.pi-agent-home/events

set -euo pipefail

AGENT_HOME="${PI_AGENT_HOME:-$HOME/.pi-agent-home}"
BACKUP_BASE="${1:-$HOME/.pi-agent-backups}"
TIMESTAMP=$(date +"%Y%m%dT%H%M%S")
BACKUP_DIR="$BACKUP_BASE/$TIMESTAMP"

echo "==> PI Agent OS Backup"
echo "    Source: $AGENT_HOME"
echo "    Dest:   $BACKUP_DIR"

mkdir -p "$BACKUP_DIR"

# 1. SQLite database (WAL checkpoint before copy for consistency)
DB="$AGENT_HOME/state.db"
if [ -f "$DB" ]; then
    sqlite3 "$DB" "PRAGMA wal_checkpoint(FULL);" 2>/dev/null || true
    cp "$DB" "$BACKUP_DIR/state.db"
    echo "    [ok] state.db"
else
    echo "    [skip] state.db not found"
fi

# 2. Artifacts
ART="$AGENT_HOME/artifacts"
if [ -d "$ART" ]; then
    cp -r "$ART" "$BACKUP_DIR/artifacts"
    echo "    [ok] artifacts/"
fi

# 3. Event logs
EVT="$AGENT_HOME/events"
if [ -d "$EVT" ]; then
    cp -r "$EVT" "$BACKUP_DIR/events"
    echo "    [ok] events/"
fi

# 4. Metadata manifest
cat > "$BACKUP_DIR/MANIFEST.json" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "agent_home": "$AGENT_HOME",
  "backup_dir": "$BACKUP_DIR",
  "created_by": "scripts/backup.sh"
}
EOF

echo "==> Backup complete: $BACKUP_DIR"
