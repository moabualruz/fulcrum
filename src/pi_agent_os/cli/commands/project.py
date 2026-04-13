"""Project CLI commands."""
from __future__ import annotations
from typing import Optional
import typer
from rich.console import Console
from rich.table import Table
from ...config import bootstrap
from ...ids import generate_id, PROJ_PREFIX
from ...models.project import Project
from ...adapters.writers.project_writer import ProjectWriter, ProjectReadAdapter

app = typer.Typer()
console = Console()


@app.command("create")
def create(
    name: str = typer.Argument(..., help="Project name"),
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    description: str = typer.Option("", "--desc", "-d"),
    root_path: str = typer.Option(".", "--path"),
    project_type: str = typer.Option("git", "--type", "-t", help="git|non_git|submodule|logical"),
    default_branch: str = typer.Option("main", "--branch"),
) -> None:
    """Create a new project."""
    bootstrap()
    project = Project(
        project_id=generate_id(PROJ_PREFIX),
        workspace_id=workspace_id,
        name=name,
        description=description,
        project_type=project_type,
        root_path=root_path,
        default_branch=default_branch,
    )
    ProjectWriter().create(project)
    console.print(f"[green]Created project[/green] {project.project_id} ([bold]{name}[/bold])")
    console.print(f"  Workspace: {workspace_id}")
    console.print(f"  Type:      {project_type}")
    console.print(f"  Path:      {root_path}")


@app.command("list")
def list_projects(
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    status: Optional[str] = typer.Option(None, "--status", "-s"),
) -> None:
    """List all projects in a workspace."""
    bootstrap()
    filters: dict = {"workspace_id": workspace_id}
    if status:
        filters["status"] = status
    projects = ProjectReadAdapter().list(filters)
    if not projects:
        console.print("[dim]No projects found.[/dim]")
        return
    table = Table("ID", "Name", "Type", "Status", "Path")
    for p in projects:
        table.add_row(p.project_id, p.name, p.project_type, p.status, p.root_path or "—")
    console.print(table)


@app.command("get")
def get(project_id: str = typer.Argument(...)) -> None:
    """Get project details."""
    bootstrap()
    project = ProjectReadAdapter().get(project_id)
    if project is None:
        console.print(f"[red]Project not found:[/red] {project_id}")
        raise typer.Exit(1)
    console.print(f"[bold]{project.name}[/bold] ({project.project_id})")
    console.print(f"  Workspace:  {project.workspace_id}")
    console.print(f"  Type:       {project.project_type}")
    console.print(f"  Status:     {project.status}")
    console.print(f"  Path:       {project.root_path or '—'}")
    console.print(f"  Branch:     {project.default_branch}")
    console.print(f"  Write mode: {project.write_mode}")
    if project.parent_project_id:
        console.print(f"  Parent:     {project.parent_project_id}")
    console.print(f"  Created:    {project.created_at}")


@app.command("update")
def update(
    project_id: str = typer.Argument(...),
    name: Optional[str] = typer.Option(None, "--name"),
    description: Optional[str] = typer.Option(None, "--desc", "-d"),
    status: Optional[str] = typer.Option(None, "--status", "-s"),
    root_path: Optional[str] = typer.Option(None, "--path"),
    write_mode: Optional[str] = typer.Option(None, "--write-mode", help="worktree|sequential"),
) -> None:
    """Update a project."""
    bootstrap()
    updates = {}
    if name is not None:
        updates["name"] = name
    if description is not None:
        updates["description"] = description
    if status is not None:
        updates["status"] = status
    if root_path is not None:
        updates["root_path"] = root_path
    if write_mode is not None:
        updates["write_mode"] = write_mode
    if not updates:
        console.print("[yellow]No updates specified.[/yellow]")
        return
    project = ProjectWriter().update(project_id, updates)
    if project is None:
        console.print(f"[red]Project not found:[/red] {project_id}")
        raise typer.Exit(1)
    console.print(f"[green]Updated project[/green] {project_id}")
