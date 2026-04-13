"""Memory CLI commands — recall and ingestion."""
from __future__ import annotations
from pathlib import Path
from typing import Optional
import json
import typer
from rich.console import Console
from rich.table import Table
from ...config import bootstrap

app = typer.Typer()
console = Console()


@app.command("recall")
def recall(
    query: str = typer.Argument(..., help="Search query"),
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    project_id: Optional[str] = typer.Option(None, "--project", "-p"),
    scope: Optional[str] = typer.Option(None, "--scope", "-s", help="global|project|file"),
    kind: Optional[str] = typer.Option(None, "--kind", "-k"),
    limit: int = typer.Option(8, "--limit", "-n"),
    mode: str = typer.Option("compact", "--mode", help="compact|total_ranked|total_timeline|total_sourcemap|semantic"),
    raw: bool = typer.Option(False, "--raw", help="Print raw JSON"),
) -> None:
    """Search memory for relevant entries."""
    bootstrap()
    from ...memory.facade import MemoryFacade

    facade = MemoryFacade()
    results = facade.recall(
        query=query,
        workspace_id=workspace_id,
        project_id=project_id,
        scope=scope,
        kind=kind,
        limit=limit,
        mode=mode,
    )

    if not results:
        console.print("[dim]No memories found.[/dim]")
        return

    if raw:
        console.print(json.dumps(results, indent=2, default=str))
        return

    table = Table("Memory ID", "Kind", "Scope", "Title / File", "Summary")
    for r in results:
        mem_id = str(r.get("memory_id") or r.get("id") or "")
        title_or_file = (r.get("title") or r.get("file_path") or "")[:40]
        table.add_row(
            mem_id[-12:],
            str(r.get("kind", "?")),
            str(r.get("scope", "?")),
            str(title_or_file),
            str(r.get("summary", ""))[:60],
        )
    console.print(table)
    console.print(f"[dim]{len(results)} result(s)[/dim]")


@app.command("ingest")
def ingest(
    path: str = typer.Argument(..., help="File or directory path to ingest"),
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    project_id: Optional[str] = typer.Option(None, "--project", "-p"),
) -> None:
    """Ingest a file or directory into memory."""
    bootstrap()
    from ...memory.indexing.walker import ProjectIngester
    from ...memory.facade import MemoryFacade

    target = Path(path)
    if not target.exists():
        console.print(f"[red]Path not found:[/red] {path}")
        raise typer.Exit(1)

    if project_id is None:
        console.print("[yellow]Warning: no --project ID given. Using workspace-level scope.[/yellow]")
        project_id = workspace_id  # fallback

    ingester = ProjectIngester(facade=MemoryFacade())

    if target.is_file():
        # Ingest single file
        facade = MemoryFacade()
        text = target.read_text(errors="replace")
        mem_id = facade.write(
            workspace_id=workspace_id,
            title=target.name,
            summary=text[:500],
            kind="code",
            scope="file",
            project_id=project_id,
            file_path=str(target),
            canonical_text=text,
        )
        console.print(f"[green]Ingested file[/green] {target.name} → {mem_id}")
        return

    console.print(f"[cyan]Ingesting[/cyan] {target} …")
    count = ingester.ingest(
        project_path=target,
        project_id=project_id,
        workspace_id=workspace_id,
    )
    console.print(f"[green]Done.[/green] {count} memories written.")


@app.command("write")
def write(
    title: str = typer.Argument(..., help="Memory title"),
    summary: str = typer.Option(..., "--summary", "-s"),
    workspace_id: str = typer.Option(..., "--workspace", "-w"),
    project_id: Optional[str] = typer.Option(None, "--project", "-p"),
    kind: str = typer.Option("fact", "--kind", "-k"),
    scope: str = typer.Option("project", "--scope"),
    tags: str = typer.Option("", "--tags", help="Comma-separated tags"),
) -> None:
    """Write a memory record manually."""
    bootstrap()
    from ...memory.facade import MemoryFacade

    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
    mem_id = MemoryFacade().write(
        workspace_id=workspace_id,
        title=title,
        summary=summary,
        kind=kind,
        scope=scope,
        project_id=project_id,
        tags=tag_list,
    )
    console.print(f"[green]Memory written[/green] → {mem_id}")
