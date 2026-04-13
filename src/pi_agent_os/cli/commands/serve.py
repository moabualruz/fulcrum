"""CLI commands for starting PI Agent OS servers."""
from __future__ import annotations

import typer

app = typer.Typer(help="Start PI Agent OS servers (MCP tool server, hook interceptor)")


@app.command("mcp")
def serve_mcp(
    transport: str = typer.Option("stdio", help="MCP transport: stdio | sse"),
    host: str = typer.Option("127.0.0.1", help="Bind host (sse only)"),
    port: int = typer.Option(7200, help="Bind port (sse only)"),
) -> None:
    """Start the PI Agent OS MCP tool server."""
    from ...mcp.server import mcp
    typer.echo(f"Starting PI Agent OS MCP server (transport={transport})")
    if transport == "sse":
        mcp.run(transport="sse", host=host, port=port)
    else:
        mcp.run(transport="stdio")


@app.command("hooks")
def serve_hooks(
    host: str = typer.Option("127.0.0.1", help="Bind host"),
    port: int = typer.Option(7100, help="Bind port"),
) -> None:
    """
    Start an HTTP hook server for Claude's http-type PreToolUse hooks.

    Register in ~/.claude/settings.json:
        {"type": "http", "url": "http://localhost:7100/hooks/pre-tool"}
    """
    import uvicorn
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse

    hook_app = FastAPI(title="pi-os hooks")

    @hook_app.post("/hooks/pre-tool")
    async def pre_tool(request: Request) -> JSONResponse:
        event = await request.json()
        from ...hooks.claude_hook import handle_hook
        code, msg = handle_hook(event)
        if code == 0:
            return JSONResponse({"continue": True})
        return JSONResponse({"continue": False, "stopReason": msg})

    @hook_app.get("/health")
    def health():
        return {"status": "ok"}

    typer.echo(f"Starting PI Agent OS hook server on http://{host}:{port}")
    uvicorn.run(hook_app, host=host, port=port)


@app.command("all")
def serve_all(
    mcp_port: int = typer.Option(7200, help="MCP SSE port"),
    hooks_port: int = typer.Option(7100, help="Hooks HTTP port"),
) -> None:
    """Start both MCP (SSE) and hook servers concurrently."""
    import threading

    def _run_mcp() -> None:
        from ...mcp.server import mcp
        mcp.run(transport="sse", host="127.0.0.1", port=mcp_port)

    def _run_hooks() -> None:
        import uvicorn
        from fastapi import FastAPI, Request
        from fastapi.responses import JSONResponse

        hook_app = FastAPI(title="pi-os hooks")

        @hook_app.post("/hooks/pre-tool")
        async def pre_tool(request: Request) -> JSONResponse:
            event = await request.json()
            from ...hooks.claude_hook import handle_hook
            code, msg = handle_hook(event)
            return JSONResponse({"continue": code == 0, "stopReason": msg or None})

        @hook_app.get("/health")
        def health():
            return {"status": "ok"}

        uvicorn.run(hook_app, host="127.0.0.1", port=hooks_port)

    typer.echo(f"Starting MCP server on :{mcp_port} and hook server on :{hooks_port}")

    mcp_t = threading.Thread(target=_run_mcp, daemon=True)
    hooks_t = threading.Thread(target=_run_hooks, daemon=True)
    mcp_t.start()
    hooks_t.start()

    try:
        mcp_t.join()
        hooks_t.join()
    except KeyboardInterrupt:
        typer.echo("Shutting down.")
