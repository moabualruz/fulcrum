"""Project CLI commands."""
from __future__ import annotations
from typing import Optional
import typer
from rich.console import Console
from rich.table import Table
from ...config import bootstrap
from ...ids import generate_id, PROJ_PREFIX

app = typer.Typer()
console = Console()


@app.command("create")
def create(
    name: str = typer.Argument(..., help="Project name"),
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    description: str = typer.Option("", "--desc", "-d"),
    root_path: str = typer.Option(".", "--path"),
    project_type: str = typer.Option("git", "--type", "-t", help="git|non_git|submodule|logical"),
) -> None:
    """Create a new project."""
    bootstrap()
    console.print("[yellow]project create: not yet implemented[/yellow]")
    console.print(f"  Would create project [bold]{name}[/bold] in workspace {workspace_id}")
    console.print(f"  type={project_type}, path={root_path}")


@app.command("list")
def list_projects(
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
) -> None:
    """List all projects in a workspace."""
    bootstrap()
    console.print("[yellow]project list: not yet implemented[/yellow]")


@app.command("get")
def get(project_id: str = typer.Argument(...)) -> None:
    """Get project details."""
    bootstrap()
    console.print("[yellow]project get: not yet implemented[/yellow]")
