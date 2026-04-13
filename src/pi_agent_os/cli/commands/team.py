"""Team CLI commands — templates and instance management."""
from __future__ import annotations
from typing import Optional
import typer
from rich.console import Console
from rich.table import Table
from ...config import bootstrap

app = typer.Typer()
console = Console()


@app.command("list-templates")
def list_templates() -> None:
    """List available team templates."""
    bootstrap()
    from ...teams.template import TeamTemplateWriter
    templates = TeamTemplateWriter().list()
    if not templates:
        console.print("[dim]No team templates found.[/dim]")
        return
    table = Table("Template ID", "Name", "Slots", "Description")
    for t in templates:
        table.add_row(
            t.template_id[-12:],
            t.name,
            str(len(t.slots)),
            t.description[:60],
        )
    console.print(table)


@app.command("instances")
def list_instances(
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    status: Optional[str] = typer.Option(None, "--status", "-s"),
    project_id: Optional[str] = typer.Option(None, "--project", "-p"),
) -> None:
    """List team instances with concurrency report."""
    bootstrap()
    from ...teams.scheduler import TeamScheduler
    from ...db import connection as db

    clauses = ["workspace_id=?"]
    params: list = [workspace_id]
    if status:
        clauses.append("status=?")
        params.append(status)
    if project_id:
        clauses.append("project_id=?")
        params.append(project_id)
    where = " AND ".join(clauses)
    rows = db.fetchall(
        f"SELECT * FROM team_instances WHERE {where} ORDER BY created_at DESC LIMIT 50",
        tuple(params),
    )

    scheduler = TeamScheduler()
    report = scheduler.concurrency_report(workspace_id)

    console.print(f"[bold]Team instances[/bold] — workspace {workspace_id}")
    console.print(f"  Running: {report['running_total']}/{report['global_cap']} (global cap)")
    console.print(f"  Headroom: {report['global_headroom']}")

    if not rows:
        console.print("[dim]No team instances found.[/dim]")
        return

    table = Table("Instance ID", "Template", "Status", "Purpose", "Project")
    status_colors = {
        "running": "green",
        "created": "yellow",
        "completed": "dim",
        "failed": "red",
        "cancelled": "dim",
    }
    for r in rows:
        s = str(r["status"])
        color = status_colors.get(s, "white")
        table.add_row(
            str(r["id"])[-12:],
            str(r["template_id"])[-12:],
            f"[{color}]{s}[/{color}]",
            str(r["purpose"])[:50],
            str(r["project_id"] or "—"),
        )
    console.print(table)


@app.command("concurrency")
def concurrency(
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
) -> None:
    """Show cross-team concurrency report."""
    bootstrap()
    from ...teams.scheduler import TeamScheduler
    import json

    report = TeamScheduler().concurrency_report(workspace_id)
    console.print(f"[bold]Concurrency report[/bold] — workspace {workspace_id}")
    console.print(f"  Running total:    {report['running_total']}")
    console.print(f"  Global cap:       {report['global_cap']}")
    console.print(f"  Headroom:         {report['global_headroom']}")
    console.print(f"  Per-project cap:  {report['per_project_cap']}")
    console.print(f"  Per-template cap: {report['per_template_cap']}")
    if report["per_template"]:
        console.print("\n[bold]By template:[/bold]")
        for tid, count in report["per_template"].items():
            console.print(f"  {tid[-12:]}: {count} running")
    if report["per_project"]:
        console.print("\n[bold]By project:[/bold]")
        for pid, count in report["per_project"].items():
            console.print(f"  {pid[-12:]}: {count} running")
