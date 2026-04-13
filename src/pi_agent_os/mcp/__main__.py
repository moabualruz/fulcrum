"""Run the PI Agent OS MCP server: python -m pi_agent_os.mcp"""
from .server import mcp

if __name__ == "__main__":
    mcp.run()
