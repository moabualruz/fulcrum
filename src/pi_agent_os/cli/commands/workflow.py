"""Workflow CLI commands."""
from __future__ import annotations
import json
from pathlib import Path
from typing import Optional
import typer
from rich.console import Console
from rich.table import Table
from ...config import bootstrap
from ...db import connection as db

app = typer.Typer()
console = Console()

# Bundled workflow definitions live here
_WORKFLOWS_DIR = Path(__file__).parent.parent.parent.parent.parent / "workflows"


def _list_bundled() -> list[str]:
    """Return names of bundled coded workflows."""
    if not _WORKFLOWS_DIR.exists():
        return []
    return [p.name for p in sorted(_WORKFLOWS_DIR.iterdir()) if p.is_dir() and (p / "workflow.yaml").exists()]


@app.command("list")
def list_workflows(
    workspace_id: Optional[str] = typer.Option(None, "--workspace", "-w"),
    status: Optional[str] = typer.Option(None, "--status", "-s"),
    show_bundled: bool = typer.Option(False, "--bundled", help="Also list bundled workflow definitions"),
) -> None:
    """List workflow runs, optionally filtered by status."""
    bootstrap()

    if show_bundled:
        bundled = _list_bundled()
        if bundled:
            console.print("[bold]Bundled workflows:[/bold]")
            for name in bundled:
                console.print(f"  • {name}")
        else:
            console.print("[dim]No bundled workflows found.[/dim]")
        return

    clauses: list[str] = []
    params: list = []
    if workspace_id:
        clauses.append("workspace_id=?")
        params.append(workspace_id)
    if status:
        clauses.append("status=?")
        params.append(status)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = db.fetchall(
        f"SELECT * FROM workflow_runs {where} ORDER BY created_at DESC LIMIT 100",
        tuple(params),
    )
    if not rows:
        console.print("[dim]No workflow runs found.[/dim]")
        return
    table = Table("Run ID", "Workflow", "Status", "Project", "Created")
    for r in rows:
        table.add_row(
            r["id"], r["workflow_name"], r["status"],
            r["project_id"] or "—",
            r["created_at"][:19],
        )
    console.print(table)


@app.command("get")
def get(run_id: str = typer.Argument(..., help="Workflow run ID")) -> None:
    """Get details for a workflow run."""
    bootstrap()
    row = db.fetchone("SELECT * FROM workflow_runs WHERE id=?", (run_id,))
    if row is None:
        console.print(f"[red]Workflow run not found:[/red] {run_id}")
        raise typer.Exit(1)
    console.print(f"[bold]{row['workflow_name']}[/bold] v{row['workflow_version']} ({run_id})")
    console.print(f"  Status:     {row['status']}")
    console.print(f"  Workspace:  {row['workspace_id']}")
    console.print(f"  Project:    {row['project_id'] or '—'}")
    console.print(f"  Created:    {row['created_at'][:19]}")
    if row["current_step"]:
        console.print(f"  Step:       {row['current_step']}")
    if row["error"]:
        console.print(f"  [red]Error:[/red] {row['error']}")
    # Show step states
    try:
        steps = json.loads(row["steps"] or "[]")
        if steps:
            console.print("\n[bold]Steps:[/bold]")
            for s in steps:
                status_color = {"done": "green", "failed": "red", "running": "yellow"}.get(s.get("status", ""), "white")
                console.print(f"  [{status_color}]{s.get('status','?'):10}[/{status_color}] {s.get('step_id','?')} — {s.get('step_name','')}")
    except Exception:
        pass


@app.command("run")
def run(
    workflow_name: str = typer.Argument(..., help="Name of the workflow to run (e.g. grill-me)"),
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    project_id: Optional[str] = typer.Option(None, "--project", "-p"),
    task_id: Optional[str] = typer.Option(None, "--task", "-t"),
    input_json: str = typer.Option("{}", "--inputs", "-i", help="JSON-encoded workflow inputs"),
    workflow_dir: Optional[str] = typer.Option(None, "--dir", help="Path to workflow directory (overrides bundled)"),
) -> None:
    """Trigger a workflow run."""
    bootstrap()
    from ...workflows.engine.runner import WorkflowRunner

    # Resolve workflow directory
    wf_path: Optional[Path] = None
    if workflow_dir:
        wf_path = Path(workflow_dir)
    else:
        candidate = _WORKFLOWS_DIR / workflow_name
        if candidate.exists():
            wf_path = candidate

    if wf_path is None or not wf_path.exists():
        console.print(f"[red]Workflow not found:[/red] {workflow_name}")
        available = _list_bundled()
        if available:
            console.print("Available bundled workflows: " + ", ".join(available))
        raise typer.Exit(1)

    try:
        inputs = json.loads(input_json)
    except json.JSONDecodeError as exc:
        console.print(f"[red]Invalid --inputs JSON:[/red] {exc}")
        raise typer.Exit(1)

    runner = WorkflowRunner(wf_path)
    wf_run = runner.create_run(
        workspace_id=workspace_id,
        project_id=project_id,
        task_id=task_id,
        inputs=inputs,
    )
    console.print(f"[green]Created workflow run[/green] {wf_run.run_id}")
    console.print(f"  Workflow:  {wf_run.workflow_name} v{wf_run.workflow_version}")
    console.print(f"  Status:    {wf_run.status}")
    console.print(f"  Steps:     {len(wf_run.steps)}")

    console.print("\n[dim]Starting execution (blocking)…[/dim]")
    try:
        finished = runner.execute(wf_run)
        status_color = "green" if str(finished.status) == "completed" else "red"
        console.print(f"[{status_color}]Finished:[/{status_color}] {finished.status}")
    except Exception as exc:
        console.print(f"[red]Workflow error:[/red] {exc}")
        raise typer.Exit(1)


@app.command("resume")
def resume(
    run_id: str = typer.Argument(..., help="Workflow run ID to resume"),
    workflow_dir: Optional[str] = typer.Option(None, "--dir", help="Path to workflow directory"),
) -> None:
    """Resume a paused or blocked workflow run."""
    bootstrap()
    from ...workflows.engine.runner import WorkflowRunner

    row = db.fetchone("SELECT * FROM workflow_runs WHERE id=?", (run_id,))
    if row is None:
        console.print(f"[red]Workflow run not found:[/red] {run_id}")
        raise typer.Exit(1)

    wf_name = row["workflow_name"]
    wf_path: Optional[Path] = None
    if workflow_dir:
        wf_path = Path(workflow_dir)
    else:
        candidate = _WORKFLOWS_DIR / wf_name
        if candidate.exists():
            wf_path = candidate

    if wf_path is None:
        console.print(f"[red]Cannot find workflow directory for:[/red] {wf_name}")
        raise typer.Exit(1)

    runner = WorkflowRunner(wf_path)
    wf_run = runner.load_run(run_id)
    if wf_run is None:
        console.print(f"[red]Could not load run state for:[/red] {run_id}")
        raise typer.Exit(1)

    console.print(f"[cyan]Resuming[/cyan] {run_id} ({wf_run.status})")
    try:
        finished = runner.execute(wf_run)
        status_color = "green" if str(finished.status) == "completed" else "red"
        console.print(f"[{status_color}]Finished:[/{status_color}] {finished.status}")
    except Exception as exc:
        console.print(f"[red]Workflow error:[/red] {exc}")
        raise typer.Exit(1)
