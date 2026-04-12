"""Task CLI commands."""
from __future__ import annotations
from typing import Optional
import typer
from rich.console import Console
from rich.table import Table
from ...config import bootstrap
from ...ids import generate_id, TASK_PREFIX
from ...models.task import Task, TaskStatus
from ...adapters.readers.task_read import TaskReadAdapter, TaskWriter
from datetime import datetime, timezone

app = typer.Typer()
console = Console()


@app.command("create")
def create(
    title: str = typer.Argument(...),
    project_id: str = typer.Option(..., "--project", "-p"),
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    issue_id: Optional[str] = typer.Option(None, "--issue", "-i"),
    description: str = typer.Option("", "--desc", "-d"),
    priority: str = typer.Option("medium", "--priority"),
) -> None:
    """Create a new task."""
    bootstrap()
    task_id = generate_id(TASK_PREFIX)
    existing = len(TaskReadAdapter().for_project(project_id))
    display = f"TASK-{existing + 1}"
    task = Task(
        task_id=task_id,
        workspace_id=workspace_id,
        project_id=project_id,
        issue_id=issue_id,
        display_id=display,
        title=title,
        description=description,
        status=TaskStatus.queued,
        priority=priority,
    )
    TaskWriter().create(task)
    console.print(f"[green]Created[/green] {display} — {title}")


@app.command("list")
def list_tasks(
    project_id: str = typer.Option(..., "--project", "-p"),
    workspace_id: str = typer.Option("", "--workspace", "-w"),
    status: Optional[str] = typer.Option(None, "--status", "-s"),
) -> None:
    """List tasks for a project."""
    bootstrap()
    filters: dict = {"project_id": project_id}
    if status:
        filters["status"] = status
    tasks = TaskReadAdapter().list(filters)
    if not tasks:
        console.print("[dim]No tasks found.[/dim]")
        return
    table = Table("Display ID", "Title", "Status", "Priority", "Assignee")
    for t in tasks:
        status_color = {
            "completed": "green",
            "running": "cyan",
            "blocked": "red",
            "failed": "red",
            "claimed": "yellow",
        }.get(str(t.status), "white")
        table.add_row(
            t.display_id, t.title[:60],
            f"[{status_color}]{t.status}[/{status_color}]",
            t.priority,
            t.assigned_agent_id or "—",
        )
    console.print(table)


@app.command("get")
def get(task_id: str = typer.Argument(...)) -> None:
    """Get task details."""
    bootstrap()
    task = TaskReadAdapter().get(task_id)
    if task is None:
        console.print(f"[red]Task not found:[/red] {task_id}")
        raise typer.Exit(1)
    console.print(f"[bold]{task.display_id}[/bold]: {task.title}")
    console.print(f"  Status:    {task.status}")
    console.print(f"  Priority:  {task.priority}")
    console.print(f"  Project:   {task.project_id}")
    console.print(f"  Issue:     {task.issue_id or '—'}")
    console.print(f"  Assignee:  {task.assigned_agent_id or '—'}")
    if task.description:
        console.print(f"  Desc:      {task.description[:200]}")
    if task.done_criteria:
        console.print(f"  Done when: {task.done_criteria}")


@app.command("claim")
def claim(
    task_id: str = typer.Argument(...),
    agent_id: str = typer.Option(..., "--agent", "-a", help="Agent ID claiming the task"),
) -> None:
    """Claim a task for an agent."""
    bootstrap()
    now = datetime.now(timezone.utc)
    updated = TaskWriter().update(
        task_id,
        {
            "status": TaskStatus.claimed,
            "assigned_agent_id": agent_id,
            "claimed_at": now,
        },
    )
    if updated:
        console.print(f"[green]Claimed[/green] {task_id} by {agent_id}")
    else:
        console.print("[red]Task not found[/red]")
        raise typer.Exit(1)


@app.command("complete")
def complete(task_id: str = typer.Argument(...)) -> None:
    """Mark a task as completed."""
    bootstrap()
    now = datetime.now(timezone.utc)
    updated = TaskWriter().update(
        task_id,
        {
            "status": TaskStatus.completed,
            "completed_at": now,
        },
    )
    if updated:
        console.print(f"[green]Completed[/green] {task_id}")
    else:
        console.print("[red]Task not found[/red]")
        raise typer.Exit(1)
