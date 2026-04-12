#!/usr/bin/env bash
# PI Agent OS — environment bootstrap script
set -euo pipefail

echo "=== PI Agent OS Bootstrap ==="

# Check Python version
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "Python: $python_version"

# Check uv
if ! command -v uv &> /dev/null; then
    echo "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
fi

# Install Python dependencies
echo "Installing dependencies..."
uv sync

# Initialize agent-home
echo "Initializing agent-home..."
uv run python -c "
from pi_agent_os.agent_home import init_agent_home
from pi_agent_os.db.connection import init_db, get_db_path  # noqa
home = init_agent_home()
print(f'Agent home: {home}')
"

# Run tests
echo "Running Phase 0-3 tests..."
uv run pytest tests/ -v --tb=short

echo ""
echo "=== Bootstrap complete ==="
echo "Run 'uv run pi --help' to start."
