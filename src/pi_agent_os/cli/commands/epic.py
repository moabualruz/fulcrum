"""Epic CLI commands."""
from __future__ import annotations
from typing import Optional
import typer
from rich.console import Console
from rich.table import Table
from ...config import bootstrap
from ...ids import generate_id, EPIC_PREFIX
from ...models.epic import Epic
from ...adapters.writers.epic_writer import EpicWriter, EpicReadAdapter

app = typer.Typer()
console = Console()


@app.command("create")
def create(
    title: str = typer.Argument(..., help="Epic title"),
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    project_id: str = typer.Option(..., "--project", "-p"),
    description: str = typer.Option("", "--desc", "-d"),
    priority: str = typer.Option("medium", "--priority", help="low|medium|high|critical"),
    milestone_id: Optional[str] = typer.Option(None, "--milestone"),
) -> None:
    """Create a new epic."""
    bootstrap()
    existing = len(EpicReadAdapter().for_project(project_id))
    epic = Epic(
        epic_id=generate_id(EPIC_PREFIX),
        workspace_id=workspace_id,
        project_id=project_id,
        display_id=f"EPIC-{existing + 1}",
        title=title,
        description=description,
        priority=priority,
        milestone_id=milestone_id,
    )
    EpicWriter().create(epic)
    console.print(f"[green]Created epic[/green] {epic.display_id} ({epic.epic_id})")
    console.print(f"  Title:   {title}")
    console.print(f"  Project: {project_id}")


@app.command("list")
def list_epics(
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    project_id: Optional[str] = typer.Option(None, "--project", "-p"),
    status: Optional[str] = typer.Option(None, "--status", "-s"),
) -> None:
    """List epics."""
    bootstrap()
    filters: dict = {"workspace_id": workspace_id}
    if project_id:
        filters["project_id"] = project_id
    if status:
        filters["status"] = status
    epics = EpicReadAdapter().list(filters)
    if not epics:
        console.print("[dim]No epics found.[/dim]")
        return
    table = Table("ID", "Title", "Status", "Priority", "Project")
    for e in epics:
        table.add_row(e.display_id, e.title[:50], e.status, e.priority, e.project_id)
    console.print(table)


@app.command("get")
def get(epic_id: str = typer.Argument(...)) -> None:
    """Get epic details."""
    bootstrap()
    epic = EpicReadAdapter().get(epic_id)
    if epic is None:
        console.print(f"[red]Epic not found:[/red] {epic_id}")
        raise typer.Exit(1)
    console.print(f"[bold]{epic.title}[/bold] ({epic.display_id})")
    console.print(f"  ID:       {epic.epic_id}")
    console.print(f"  Status:   {epic.status}")
    console.print(f"  Priority: {epic.priority}")
    console.print(f"  Project:  {epic.project_id}")
    if epic.description:
        console.print(f"  Desc:     {epic.description[:120]}")


@app.command("update")
def update(
    epic_id: str = typer.Argument(...),
    title: Optional[str] = typer.Option(None, "--title"),
    status: Optional[str] = typer.Option(None, "--status", "-s"),
    priority: Optional[str] = typer.Option(None, "--priority"),
    description: Optional[str] = typer.Option(None, "--desc", "-d"),
) -> None:
    """Update an epic."""
    bootstrap()
    updates = {}
    if title is not None:
        updates["title"] = title
    if status is not None:
        updates["status"] = status
    if priority is not None:
        updates["priority"] = priority
    if description is not None:
        updates["description"] = description
    if not updates:
        console.print("[yellow]No updates specified.[/yellow]")
        return
    epic = EpicWriter().update(epic_id, updates)
    if epic is None:
        console.print(f"[red]Epic not found:[/red] {epic_id}")
        raise typer.Exit(1)
    console.print(f"[green]Updated epic[/green] {epic_id}")
