"""Workspace CLI commands."""
from __future__ import annotations
import typer
from rich.console import Console
from rich.table import Table
from ...config import bootstrap
from ...ids import generate_id, WS_PREFIX
from ...models.workspace import Workspace
from ...adapters.writers.workspace_writer import WorkspaceWriter
from ...adapters.readers.workspace_read import WorkspaceReadAdapter
from datetime import datetime, timezone

app = typer.Typer()
console = Console()


def _ensure_db() -> None:
    bootstrap()


@app.command("create")
def create(
    name: str = typer.Argument(..., help="Workspace name"),
    description: str = typer.Option("", "--desc", "-d"),
) -> None:
    """Create a new workspace."""
    _ensure_db()
    ws = Workspace(
        workspace_id=generate_id(WS_PREFIX),
        name=name,
        description=description,
    )
    WorkspaceWriter().create(ws)
    console.print(f"[green]Created workspace[/green] {ws.workspace_id} ([bold]{name}[/bold])")


@app.command("list")
def list_workspaces() -> None:
    """List all workspaces."""
    _ensure_db()
    workspaces = WorkspaceReadAdapter().list()
    if not workspaces:
        console.print("[dim]No workspaces found.[/dim]")
        return
    table = Table("ID", "Name", "Status", "Created")
    for ws in workspaces:
        table.add_row(ws.workspace_id, ws.name, ws.status, str(ws.created_at.date()))
    console.print(table)


@app.command("get")
def get(workspace_id: str = typer.Argument(...)) -> None:
    """Get workspace details."""
    _ensure_db()
    ws = WorkspaceReadAdapter().get(workspace_id)
    if ws is None:
        console.print(f"[red]Workspace not found:[/red] {workspace_id}")
        raise typer.Exit(1)
    console.print(f"[bold]{ws.name}[/bold] ({ws.workspace_id})")
    console.print(f"  Status: {ws.status}")
    console.print(f"  Description: {ws.description}")
    console.print(f"  Created: {ws.created_at}")
