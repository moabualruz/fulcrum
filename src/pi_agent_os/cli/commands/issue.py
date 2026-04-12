"""Issue CLI commands."""
from __future__ import annotations
from typing import Optional
import typer
from rich.console import Console
from rich.table import Table
from ...config import bootstrap
from ...ids import generate_id, ISS_PREFIX
from ...models.issue import Issue, IssueStatus
from ...adapters.readers.issue_read import IssueReadAdapter, IssueWriter
from datetime import datetime, timezone

app = typer.Typer()
console = Console()


@app.command("create")
def create(
    title: str = typer.Argument(...),
    project_id: str = typer.Option(..., "--project", "-p"),
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    description: str = typer.Option("", "--desc", "-d"),
    priority: str = typer.Option("medium", "--priority"),
) -> None:
    """Create a new issue."""
    bootstrap()
    issue_id = generate_id(ISS_PREFIX)
    # Generate human display id from counter
    existing = len(IssueReadAdapter().for_project(project_id))
    display = f"ISS-{existing + 1}"
    issue = Issue(
        issue_id=issue_id,
        workspace_id=workspace_id,
        project_id=project_id,
        display_id=display,
        title=title,
        description=description,
        status=IssueStatus.backlog,
        priority=priority,
    )
    IssueWriter().create(issue)
    console.print(f"[green]Created[/green] {display} — {title}")


@app.command("list")
def list_issues(
    project_id: str = typer.Option(..., "--project", "-p"),
    workspace_id: str = typer.Option("", "--workspace", "-w"),
    status: Optional[str] = typer.Option(None, "--status", "-s"),
) -> None:
    """List issues for a project."""
    bootstrap()
    filters: dict = {"project_id": project_id}
    if status:
        filters["status"] = status
    issues = IssueReadAdapter().list(filters)
    if not issues:
        console.print("[dim]No issues found.[/dim]")
        return
    table = Table("Display ID", "Title", "Status", "Priority")
    for iss in issues:
        status_color = {"done": "green", "in_progress": "cyan", "blocked": "red"}.get(
            str(iss.status), "white"
        )
        table.add_row(
            iss.display_id, iss.title[:60],
            f"[{status_color}]{iss.status}[/{status_color}]",
            iss.priority,
        )
    console.print(table)


@app.command("get")
def get(issue_id: str = typer.Argument(...)) -> None:
    """Get issue details."""
    bootstrap()
    issue = IssueReadAdapter().get(issue_id)
    if issue is None:
        console.print(f"[red]Issue not found:[/red] {issue_id}")
        raise typer.Exit(1)
    console.print(f"[bold]{issue.display_id}[/bold]: {issue.title}")
    console.print(f"  Status:    {issue.status}")
    console.print(f"  Priority:  {issue.priority}")
    console.print(f"  Project:   {issue.project_id}")
    if issue.description:
        console.print(f"  Desc:      {issue.description[:200]}")


@app.command("update-status")
def update_status(
    issue_id: str = typer.Argument(...),
    status: str = typer.Argument(..., help="New status: backlog|ready|in_progress|blocked|in_review|done|cancelled"),
) -> None:
    """Update issue status."""
    bootstrap()
    updated = IssueWriter().update(issue_id, {"status": status})
    if updated:
        console.print(f"[green]Updated[/green] {issue_id} → {status}")
    else:
        console.print("[red]Issue not found[/red]")
        raise typer.Exit(1)
