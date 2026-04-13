"""Tests for pi serve CLI commands."""
from typer.testing import CliRunner


def test_serve_help():
    from pi_agent_os.cli.commands.serve import app
    runner = CliRunner()
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "mcp" in result.output
    assert "hooks" in result.output
    assert "all" in result.output


def test_serve_mcp_help():
    from pi_agent_os.cli.commands.serve import app
    runner = CliRunner()
    result = runner.invoke(app, ["mcp", "--help"])
    assert result.exit_code == 0
    assert "stdio" in result.output or "transport" in result.output


def test_serve_hooks_help():
    from pi_agent_os.cli.commands.serve import app
    runner = CliRunner()
    result = runner.invoke(app, ["hooks", "--help"])
    assert result.exit_code == 0
    assert "port" in result.output


def test_main_app_has_serve():
    """pi serve is registered in the main app."""
    from pi_agent_os.cli.main import app as main_app
    from typer.testing import CliRunner
    runner = CliRunner()
    result = runner.invoke(main_app, ["serve", "--help"])
    assert result.exit_code == 0
