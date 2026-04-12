"""Workflow CLI commands."""
from __future__ import annotations
from typing import Optional
import typer
from rich.console import Console
from rich.table import Table
from ...config import bootstrap

app = typer.Typer()
console = Console()


@app.command("list")
def list_workflows(
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    status: Optional[str] = typer.Option(None, "--status", "-s"),
) -> None:
    """List workflow runs."""
    bootstrap()
    console.print("[yellow]workflow list: not yet implemented[/yellow]")


@app.command("run")
def run(
    workflow_name: str = typer.Argument(..., help="Name of the workflow to run"),
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    project_id: Optional[str] = typer.Option(None, "--project", "-p"),
    task_id: Optional[str] = typer.Option(None, "--task", "-t"),
) -> None:
    """Trigger a workflow run."""
    bootstrap()
    console.print("[yellow]workflow run: not yet implemented[/yellow]")
    console.print(f"  Would run workflow: [bold]{workflow_name}[/bold]")
