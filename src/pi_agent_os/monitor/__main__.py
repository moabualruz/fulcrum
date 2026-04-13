"""
Entry point for: python -m pi_agent_os.monitor

Starts the PI Agent OS monitor + control API server.
Used by the PI cockpit extension to start the backend.

Usage:
    python -m pi_agent_os.monitor [--port 4721] [--host 127.0.0.1] [--db PATH]
"""
from __future__ import annotations

import argparse
import sys


def main() -> None:
    parser = argparse.ArgumentParser(
        description="PI Agent OS monitor + control API server",
        prog="python -m pi_agent_os.monitor",
    )
    parser.add_argument("--port", type=int, default=4721, help="HTTP port (default: 4721)")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--db", default="", help="Path to state.db (default: ~/.pi-agent-home/state.db)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload (dev mode)")
    args = parser.parse_args()

    if args.db:
        from pi_agent_os.db.connection import configure
        configure(args.db)

    try:
        import uvicorn
    except ImportError:
        print("ERROR: uvicorn not installed. Run: uv add uvicorn[standard]", file=sys.stderr)
        sys.exit(1)

    print(f"PI Agent OS monitor starting on http://{args.host}:{args.port}")
    print(f"  Monitor:  http://{args.host}:{args.port}/api/v1/status")
    print(f"  Control:  http://{args.host}:{args.port}/api/v1/control/")
    print(f"  Docs:     http://{args.host}:{args.port}/docs")

    uvicorn.run(
        "pi_agent_os.monitor.server:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="warning",
    )


if __name__ == "__main__":
    main()
