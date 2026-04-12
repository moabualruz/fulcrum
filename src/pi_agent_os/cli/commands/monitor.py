"""Monitor CLI commands — start the read-only monitor server."""
from __future__ import annotations
import typer

app = typer.Typer(name="monitor", help="Monitor server commands")


@app.command("start")
def start(port: int = typer.Option(7821, help="Port to listen on")) -> None:
    """Start the read-only monitor server."""
    import uvicorn
    from pi_agent_os.monitor.server import create_app
    uvicorn.run(create_app(), host="0.0.0.0", port=port)
