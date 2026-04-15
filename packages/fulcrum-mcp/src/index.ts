#!/usr/bin/env tsx
/**
 * fulcrum-mcp — zero-install MCP server for Fulcrum agent OS.
 *
 * Usage:
 *   npx fulcrum-mcp                    # stdio MCP server (Claude Desktop)
 *   npx fulcrum-mcp --no-monitor       # suppress auto-started monitor
 *
 * Claude Desktop / Claude Code config:
 *   {
 *     "mcpServers": {
 *       "fulcrum": {
 *         "command": "npx",
 *         "args": ["-y", "fulcrum-mcp"]
 *       }
 *     }
 *   }
 *
 * Or, if installed globally (npm install -g fulcrum-mcp):
 *   fulcrum-mcp
 *
 * This thin wrapper delegates to @fulcrum/cli's `serve mcp` command so that
 * the full Fulcrum tool set is available without a separate `fulcrum` binary
 * install. The monitor HTTP server auto-starts on port 4721 by default.
 */

// Inject the subcommand into argv so @fulcrum/cli's dispatch hits `serve mcp`
// before @fulcrum/cli processes process.argv.
process.argv.splice(2, 0, 'serve', 'mcp')

// Delegate to @fulcrum/cli — all tool logic lives there.
await import('@fulcrum/cli')
