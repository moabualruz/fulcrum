// packages/cli/src/mcp-server.ts
// MCP server built on @modelcontextprotocol/sdk (protocol version 2025-11-25).
// Replaces the hand-rolled JSON-RPC 2.0 loop in index.ts.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { TOOL_SCHEMAS } from './mcp-tools.js'

// ---------- Types ----------

export type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>

export interface McpServerOptions {
  version: string
  handleToolCall: ToolHandler
}

// ---------- Zod shape builder ----------
// Converts a JSON Schema-style properties object to a flat Zod shape.
// Handles all types used in our 18 tool schemas.

type JsonSchemaProp = {
  type?: string
  enum?: string[]
  description?: string
  items?: Record<string, unknown>
}

function buildZodShape(
  properties: Record<string, JsonSchemaProp>,
  required: string[] = [],
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [key, prop] of Object.entries(properties)) {
    let base: z.ZodTypeAny
    if (prop.enum && prop.enum.length > 0) {
      // z.enum requires a non-empty tuple
      const [first, ...rest] = prop.enum as [string, ...string[]]
      base = z.enum([first, ...rest])
    } else if (prop.type === 'number') {
      base = z.number()
    } else if (prop.type === 'boolean') {
      base = z.boolean()
    } else if (prop.type === 'array') {
      base = z.array(z.unknown())
    } else if (prop.type === 'object') {
      base = z.record(z.string(), z.unknown())
    } else {
      base = z.string()
    }
    shape[key] = required.includes(key) ? base : base.optional()
  }
  return shape
}

// ---------- Server factory ----------

export function createFulcrumMcpServer(options: McpServerOptions): McpServer {
  const server = new McpServer({
    name: 'fulcrum',
    version: options.version,
  })

  for (const tool of TOOL_SCHEMAS) {
    const shape = buildZodShape(
      tool.inputSchema.properties as Record<string, JsonSchemaProp>,
      tool.inputSchema.required ?? [],
    )

    server.tool(
      tool.name,
      tool.description,
      shape,
      async (args) => {
        try {
          const result = await options.handleToolCall(tool.name, args as Record<string, unknown>)
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          }
        } catch (err) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: (err as Error).message }) }],
            isError: true,
          }
        }
      },
    )
  }

  return server
}

// ---------- Run ----------

export async function runFulcrumMcpServer(options: McpServerOptions): Promise<void> {
  const server = createFulcrumMcpServer(options)
  const transport = new StdioServerTransport()

  // Graceful shutdown on signals
  const shutdown = async () => {
    process.stderr.write('[fulcrum mcp] shutting down\n')
    try { await server.close() } catch { /* ignore */ }
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  process.stderr.write('[fulcrum mcp] fulcrum MCP server started (stdio, protocol 2025-11-25)\n')

  await server.connect(transport)

  // Keep alive until stdin closes (parent process died)
  await new Promise<void>((resolve) => {
    process.stdin.on('close', () => resolve())
    process.stdin.on('end', () => resolve())
  })
}
