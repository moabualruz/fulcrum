"""Agent status CLI commands. Spec §24.3."""
from __future__ import annotations
from typing import Optional
import typer
from rich.console import Console
from rich.table import Table
from ...config import bootstrap
from ...adapters.readers.agent_status_read import AgentStatusReadAdapter
from ...events.store import tail as events_tail

app = typer.Typer()
console = Console()


@app.command("status")
def status(
    run_id: str = typer.Argument(..., help="Agent run ID"),
) -> None:
    """Get the current status of an agent run."""
    bootstrap()
    run = AgentStatusReadAdapter().get(run_id)
    if run is None:
        console.print(f"[red]Run not found:[/red] {run_id}")
        raise typer.Exit(1)
    console.print(f"[bold]{run.display_id}[/bold] ({run_id})")
    console.print(f"  Role:       {run.agent_role}")
    console.print(f"  Status:     {run.status}")
    console.print(f"  Task:       {run.task_id or '—'}")
    console.print(f"  Step:       {run.current_step or '—'}")
    console.print(f"  Path:       {run.current_path or '—'}")
    console.print(f"  Progress:   {run.progress_pct or 0:.0f}%")
    console.print(f"  Heartbeat:  {run.heartbeat_at or '—'}")
    if run.blocker:
        console.print(f"  [red]Blocker:[/red] {run.blocker}")


@app.command("list")
def list_runs(
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    status: Optional[str] = typer.Option(None, "--status", "-s"),
) -> None:
    """List agent runs."""
    bootstrap()
    filters: dict = {"workspace_id": workspace_id}
    if status:
        filters["status"] = status
    runs = AgentStatusReadAdapter().list(filters)
    if not runs:
        console.print("[dim]No runs found.[/dim]")
        return
    table = Table("Run ID", "Role", "Status", "Task", "Heartbeat")
    for r in runs:
        table.add_row(
            r.display_id, r.agent_role, str(r.status),
            r.task_id or "—",
            str(r.heartbeat_at.strftime("%H:%M:%S") if r.heartbeat_at else "—"),
        )
    console.print(table)


@app.command("blockers")
def blockers(workspace_id: str = typer.Option(..., "--workspace", "-w")) -> None:
    """Show all blocked agent runs."""
    bootstrap()
    blocked = AgentStatusReadAdapter().blockers(workspace_id)
    if not blocked:
        console.print("[green]No blocked runs.[/green]")
        return
    table = Table("Run ID", "Role", "Task", "Blocker", "Since")
    for b in blocked:
        table.add_row(
            str(b["id"]), str(b["agent_role"]), str(b["task_id"] or "—"),
            str(b["blocker"] or "unknown"), str(b["updated_at"]),
        )
    console.print(table)


@app.command("tail")
def tail(
    run_id: str = typer.Argument(...),
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    limit: int = typer.Option(20, "--limit", "-n"),
) -> None:
    """Tail recent events for an agent run."""
    bootstrap()
    events = events_tail(workspace_id=workspace_id, limit=limit)
    run_events = [e for e in events if e.get("object_id") == run_id]
    if not run_events:
        console.print("[dim]No events found for this run.[/dim]")
        return
    for e in run_events:
        console.print(f"[dim]{e['ts']}[/dim] [{e['severity']}] {e['evt_type']} — {e.get('payload', {})}")
