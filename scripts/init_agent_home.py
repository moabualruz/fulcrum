#!/usr/bin/env python3
"""Initialize or re-initialize the PI Agent OS agent-home directory."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from pi_agent_os.agent_home import init_agent_home
from pi_agent_os.db.connection import init_db, get_db_path
from pi_agent_os.config import bootstrap


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Initialize PI Agent OS agent-home")
    parser.add_argument("--home", type=Path, help="Custom agent-home path", default=None)
    args = parser.parse_args()

    config = bootstrap(agent_home=args.home)
    print(f"Agent home initialized: {config.agent_home}")
    print(f"Database: {get_db_path()}")
    print("Ready.")


if __name__ == "__main__":
    main()
