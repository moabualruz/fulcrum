"""Board CLI commands."""
from __future__ import annotations
import typer
from rich.console import Console
from rich.table import Table
from ...config import bootstrap
from ...db import connection as db

app = typer.Typer()
console = Console()


@app.command("show")
def show(
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    project_id: str = typer.Option("", "--project", "-p"),
    item_type: str = typer.Option("issue", "--type", "-t", help="issue|task|epic"),
) -> None:
    """Show the board for a workspace/project."""
    bootstrap()
    clauses = ["workspace_id=?", "item_type=?"]
    params: list = [workspace_id, item_type]
    if project_id:
        clauses.append("project_id=?")
        params.append(project_id)
    where = " AND ".join(clauses)
    rows = db.fetchall(
        f"SELECT * FROM board_items WHERE {where} ORDER BY status, priority DESC LIMIT 200",
        tuple(params),
    )
    if not rows:
        console.print("[dim]No items on board.[/dim]")
        return
    table = Table("ID", "Title", "Status", "Priority", "Assignee")
    for r in rows:
        table.add_row(
            r["display_id"], r["title"][:50],
            r["status"], r["priority"],
            r["assignee_id"] or "—",
        )
    console.print(table)
