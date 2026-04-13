"""Main CLI entrypoint for PI Agent OS."""
from __future__ import annotations
import typer
from rich.console import Console
from .commands import workspace as workspace_cmd
from .commands import project as project_cmd
from .commands import epic as epic_cmd
from .commands import issue as issue_cmd
from .commands import task as task_cmd
from .commands import agent as agent_cmd
from .commands import board as board_cmd
from .commands import memory as memory_cmd
from .commands import workflow as workflow_cmd
from .commands import team as team_cmd
from .commands import queue as queue_cmd
from .commands import sync as sync_cmd
from .commands import monitor as monitor_cmd
from .commands import serve as serve_cmd

app = typer.Typer(
    name="pi",
    help="PI Local-First Agent OS — control plane CLI",
    no_args_is_help=True,
    rich_markup_mode="rich",
)

console = Console()

app.add_typer(workspace_cmd.app, name="workspace", help="Manage workspaces")
app.add_typer(project_cmd.app, name="project", help="Manage projects")
app.add_typer(epic_cmd.app, name="epic", help="Manage epics")
app.add_typer(issue_cmd.app, name="issue", help="Manage issues")
app.add_typer(task_cmd.app, name="task", help="Manage tasks")
app.add_typer(agent_cmd.app, name="agent", help="Agent status and control")
app.add_typer(board_cmd.app, name="board", help="Board views")
app.add_typer(memory_cmd.app, name="memory", help="Memory search and ingestion")
app.add_typer(workflow_cmd.app, name="workflow", help="Workflow management")
app.add_typer(team_cmd.app, name="team", help="Team templates and instances")
app.add_typer(queue_cmd.app, name="queue", help="Merge queue management")
app.add_typer(sync_cmd.app, name="sync", help="Plane sync management")
app.add_typer(monitor_cmd.app, name="monitor", help="Monitor server")
app.add_typer(serve_cmd.app, name="serve", help="Start PI Agent OS servers")


@app.callback(invoke_without_command=True)
def main(ctx: typer.Context) -> None:
    """PI Agent OS CLI."""
    if ctx.invoked_subcommand is None:
        console.print("[bold]PI Agent OS[/bold] v0.1 — run [cyan]pi --help[/cyan] for commands")


if __name__ == "__main__":
    app()
