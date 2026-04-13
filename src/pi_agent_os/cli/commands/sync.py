"""Plane sync CLI commands. Spec §22."""
from __future__ import annotations
import json
from typing import Optional
import typer
from rich.console import Console
from rich.table import Table
from ...config import bootstrap

app = typer.Typer()
console = Console()


@app.command("status")
def status(
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    object_type: Optional[str] = typer.Option(None, "--type", "-t"),
) -> None:
    """Show sync drift summary for a workspace."""
    bootstrap()
    from ...adapters.readers.sync_read import SyncStateReadAdapter, SyncConflictReadAdapter

    reader = SyncStateReadAdapter()
    conflict_reader = SyncConflictReadAdapter()

    summary = reader.drift_summary(workspace_id)
    unresolved = conflict_reader.unresolved_count(workspace_id)

    console.print(f"[bold]Sync status[/bold] — workspace {workspace_id}")
    console.print(f"  Total synced objects: {summary['total']}")
    console.print(f"  Pending queue:        {summary['pending_queue']}")
    console.print(f"  Unresolved conflicts: {unresolved}")

    if summary["by_status"]:
        console.print("\n[bold]By status:[/bold]")
        for s, count in summary["by_status"].items():
            color = "green" if s == "synced" else "yellow" if s == "pending" else "red"
            console.print(f"  [{color}]{s}[/{color}]: {count}")


@app.command("list")
def list_states(
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    object_type: Optional[str] = typer.Option(None, "--type", "-t"),
    sync_status: Optional[str] = typer.Option(None, "--status", "-s"),
) -> None:
    """List sync states for workspace objects."""
    bootstrap()
    from ...adapters.readers.sync_read import SyncStateReadAdapter

    filters: dict = {"workspace_id": workspace_id}
    if object_type:
        filters["object_type"] = object_type
    if sync_status:
        filters["sync_status"] = sync_status

    states = SyncStateReadAdapter().list(filters)
    if not states:
        console.print("[dim]No sync states found.[/dim]")
        return
    table = Table("Object ID", "Type", "Sync Status", "External ID", "Last Synced")
    for s in states:
        color = "green" if s.get("sync_status") == "synced" else "yellow"
        table.add_row(
            str(s.get("object_id", ""))[-12:],
            str(s.get("object_type", "?")),
            f"[{color}]{s.get('sync_status', '?')}[/{color}]",
            str(s.get("external_id") or "—"),
            str(s.get("last_synced_at", "—"))[:19],
        )
    console.print(table)


@app.command("conflicts")
def conflicts(
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
) -> None:
    """Show unresolved sync conflicts (local wins by default)."""
    bootstrap()
    from ...adapters.readers.sync_read import SyncConflictReadAdapter

    items = SyncConflictReadAdapter().for_workspace(workspace_id)
    if not items:
        console.print("[green]No unresolved conflicts.[/green]")
        return
    table = Table("Object ID", "Type", "Local Hash", "Remote Hash", "Detected")
    for c in items:
        table.add_row(
            str(c.get("object_id", ""))[-12:],
            str(c.get("object_type", "?")),
            str(c.get("local_hash", ""))[:8],
            str(c.get("remote_hash", ""))[:8],
            str(c.get("detected_at", "—"))[:19],
        )
    console.print(table)
    console.print(f"[dim]Resolution policy: local wins (spec §22.4)[/dim]")


@app.command("queue")
def sync_queue(
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
) -> None:
    """Show objects queued for sync."""
    bootstrap()
    from ...adapters.readers.sync_read import SyncStateReadAdapter

    pending = SyncStateReadAdapter().pending(workspace_id)
    if not pending:
        console.print("[green]Sync queue is empty.[/green]")
        return
    table = Table("Object ID", "Type", "Operation", "Priority", "Queued At")
    for p in pending:
        table.add_row(
            str(p.get("object_id", ""))[-12:],
            str(p.get("object_type", "?")),
            str(p.get("operation", "upsert")),
            str(p.get("priority", 0)),
            str(p.get("queued_at", "—"))[:19],
        )
    console.print(table)


@app.command("drain")
def drain_sync(
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    limit: int = typer.Option(10, "--limit", "-n"),
) -> None:
    """Process the sync queue (requires Plane credentials in env)."""
    bootstrap()
    from ...config import get_config
    from ...sync.sync_manager import SyncManager

    cfg = get_config()
    if not cfg.plane_base_url or not cfg.plane_api_key:
        console.print("[yellow]Plane not configured. Set PLANE_BASE_URL and PLANE_API_KEY.[/yellow]")
        raise typer.Exit(1)

    manager = SyncManager(cfg.plane_base_url, cfg.plane_api_key)
    results = manager.process_queue(workspace_id, limit=limit)
    for r in results:
        if r.get("skipped"):
            console.print(f"[dim]skipped[/dim]  {r.get('reason', '')}")
        elif r.get("success"):
            console.print(f"[green]synced[/green]  {r.get('object_id', '')}")
        elif r.get("unchanged"):
            console.print(f"[dim]unchanged[/dim]  {r.get('object_id', '')}")
        else:
            console.print(f"[red]error[/red]  {r.get('object_id', '')} — {r.get('error', '')}")
    console.print(f"\n[dim]{len(results)} items processed.[/dim]")
