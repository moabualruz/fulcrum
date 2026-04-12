"""Memory CLI commands — recall and ingestion."""
from __future__ import annotations
from typing import Optional
import typer
from rich.console import Console
from ...config import bootstrap

app = typer.Typer()
console = Console()


@app.command("recall")
def recall(
    query: str = typer.Argument(..., help="Search query"),
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    limit: int = typer.Option(10, "--limit", "-n"),
) -> None:
    """Search memory for relevant entries."""
    bootstrap()
    console.print("[yellow]memory recall: not yet implemented[/yellow]")
    console.print(f"  Would search memory for: [bold]{query}[/bold]")


@app.command("ingest")
def ingest(
    path: str = typer.Argument(..., help="File or directory path to ingest"),
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    project_id: Optional[str] = typer.Option(None, "--project", "-p"),
    tags: str = typer.Option("", "--tags", help="Comma-separated tags"),
) -> None:
    """Ingest a file or directory into memory."""
    bootstrap()
    console.print("[yellow]memory ingest: not yet implemented[/yellow]")
    console.print(f"  Would ingest: [bold]{path}[/bold]")
