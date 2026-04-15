// packages/cli/src/mcp-server.ts
// MCP server built on @modelcontextprotocol/sdk (protocol version 2025-11-25).
// Replaces the hand-rolled JSON-RPC 2.0 loop in index.ts.

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { SetLevelRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { TOOL_SCHEMAS } from './mcp-tools.js'
import { getDb } from '@fulcrum/core'

// ---------- Types ----------

export type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>

export interface McpServerOptions {
  version: string
  handleToolCall: ToolHandler
}

// ---------- Zod shape builder ----------
// Converts a JSON Schema-style properties object to a flat Zod shape.
// Handles all types used in our 22 tool schemas.

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

// ---------- Output schema (read tools) ----------
// A passthrough Zod object accepts any additional fields — lets clients
// that support structuredContent parse the result directly without
// the client needing to know the exact shape of every tool response.
const READ_OUTPUT_SCHEMA = z.object({}).passthrough()

// Tools that carry structuredContent alongside text (all readOnly tools).
const READ_ONLY_TOOLS = new Set(
  TOOL_SCHEMAS
    .filter(t => t.annotations?.readOnlyHint === true)
    .map(t => t.name)
)

// ---------- Server factory ----------

export function createFulcrumMcpServer(options: McpServerOptions): McpServer {
  const server = new McpServer(
    { name: 'fulcrum', version: options.version },
    { capabilities: { logging: {} } },
  )

  for (const tool of TOOL_SCHEMAS) {
    const shape = buildZodShape(
      tool.inputSchema.properties as Record<string, JsonSchemaProp>,
      tool.inputSchema.required ?? [],
    )

    // Build a strict z.object for input validation. We validate inside the
    // handler (not as the registered shape) so the MCP SDK still gets the
    // raw shape for capabilities negotiation while we enforce strictness.
    const strictSchema = z.object(shape).strict()

    const isReadTool = READ_ONLY_TOOLS.has(tool.name)

    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: shape,
        outputSchema: isReadTool ? READ_OUTPUT_SCHEMA : undefined,
        annotations: tool.annotations ? {
          readOnlyHint: tool.annotations.readOnlyHint,
          idempotentHint: tool.annotations.idempotentHint,
          destructiveHint: tool.annotations.destructiveHint,
          openWorldHint: tool.annotations.openWorldHint,
        } : undefined,
      },
      async (args) => {
        // Validate with strict schema — reject unknown keys and wrong types.
        const parsed = strictSchema.safeParse(args)
        if (!parsed.success) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: 'invalid_input',
                details: parsed.error.issues.map(i => ({
                  path: i.path.join('.'),
                  message: i.message,
                })),
              }),
            }],
            isError: true,
          }
        }
        try {
          const result = await options.handleToolCall(tool.name, parsed.data as Record<string, unknown>)
          const textContent = { type: 'text' as const, text: JSON.stringify(result) }
          if (isReadTool) {
            return {
              content: [textContent],
              structuredContent: result as Record<string, unknown>,
            }
          }
          return { content: [textContent] }
        } catch (err) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: (err as Error).message }) }],
            isError: true,
          }
        }
      },
    )
  }

  // ---------- Resources ----------
  // URI scheme: fulcrum://{workspace_id}
  //             fulcrum://{workspace_id}/tasks
  //             fulcrum://{workspace_id}/task/{task_id}
  //             fulcrum://{workspace_id}/memory/{project_id}
  //             fulcrum://{workspace_id}/run/{run_id}

  const makeText = (data: unknown): { contents: Array<{ uri: string; text: string; mimeType: string }> } => ({
    contents: [{ uri: '', text: JSON.stringify(data, null, 2), mimeType: 'application/json' }],
  })

  // fulcrum://{workspace_id} — workspace status
  server.registerResource(
    'workspace',
    new ResourceTemplate('fulcrum://{workspace_id}', { list: undefined }),
    {
      title: 'Workspace status',
      description: 'Current status and health of a Fulcrum workspace',
      mimeType: 'application/json',
    },
    async (uri, { workspace_id }) => {
      const data = await options.handleToolCall('get_workspace_status', { workspace_id })
      const result = makeText(data)
      result.contents[0].uri = uri.toString()
      return result
    },
  )

  // fulcrum://{workspace_id}/tasks — task list
  server.registerResource(
    'workspace-tasks',
    new ResourceTemplate('fulcrum://{workspace_id}/tasks', { list: undefined }),
    {
      title: 'Workspace tasks',
      description: 'All tasks in a workspace',
      mimeType: 'application/json',
    },
    async (uri, { workspace_id }) => {
      const data = await options.handleToolCall('list_tasks', { workspace_id })
      const result = makeText(data)
      result.contents[0].uri = uri.toString()
      return result
    },
  )

  // fulcrum://{workspace_id}/task/{task_id} — individual task
  server.registerResource(
    'task',
    new ResourceTemplate('fulcrum://{workspace_id}/task/{task_id}', { list: undefined }),
    {
      title: 'Task detail',
      description: 'Details of a single Fulcrum task',
      mimeType: 'application/json',
    },
    async (uri, { workspace_id, task_id }) => {
      // list_tasks filtered by title is the closest read we have for a single task;
      // we pass task_id as a hint and return the full list entry.
      const data = await options.handleToolCall('list_tasks', { workspace_id, limit: 1000 })
      const tasks = (data as { tasks?: unknown[] }).tasks ?? (Array.isArray(data) ? data : [])
      const task = (tasks as Array<{ id?: string; task_id?: string }>).find(
        t => t.id === task_id || t.task_id === task_id,
      ) ?? { error: 'not_found', task_id }
      const result = makeText(task)
      result.contents[0].uri = uri.toString()
      return result
    },
  )

  // fulcrum://{workspace_id}/memory/{project_id} — memory entries
  server.registerResource(
    'memory',
    new ResourceTemplate('fulcrum://{workspace_id}/memory/{project_id}', { list: undefined }),
    {
      title: 'Project memory',
      description: 'Recalled memory entries for a project',
      mimeType: 'application/json',
    },
    async (uri, { workspace_id, project_id }) => {
      const db = getDb()
      const rows = db.prepare(`
        SELECT memory_id, content, kind, title, importance, created_at, updated_at
        FROM memories
        WHERE workspace_id = ? AND project_id = ?
        ORDER BY created_at DESC
        LIMIT 20
      `).all(workspace_id, project_id)
      return {
        contents: [{
          uri: uri.toString(),
          mimeType: 'application/json',
          text: JSON.stringify(rows, null, 2),
        }],
      }
    },
  )

  // fulcrum://{workspace_id}/run/{run_id} — agent run status
  server.registerResource(
    'agent-run',
    new ResourceTemplate('fulcrum://{workspace_id}/run/{run_id}', { list: undefined }),
    {
      title: 'Agent run',
      description: 'Status of a Fulcrum agent run',
      mimeType: 'application/json',
    },
    async (uri, { run_id }) => {
      const data = await options.handleToolCall('get_agent_run_status', { run_id })
      const result = makeText(data)
      result.contents[0].uri = uri.toString()
      return result
    },
  )

  // ---------- Prompts ----------
  // Register fulcrum's two most useful context-builders as MCP prompts so
  // clients (Claude Desktop, etc.) can embed them in their system prompt pane.

  server.registerPrompt(
    'build_cos_context',
    {
      title: 'Build Chief-of-Staff context',
      description: 'Generate a structured CoS context summary for a workspace/project',
      argsSchema: {
        workspace_id: z.string().describe('Workspace ID'),
        project_id: z.string().describe('Project ID'),
      },
    },
    async ({ workspace_id, project_id }) => {
      const result = await options.handleToolCall('build_cos_context', { workspace_id, project_id })
      return {
        messages: [{
          role: 'user' as const,
          content: { type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result) },
        }],
      }
    },
  )

  server.registerPrompt(
    'recall_memory',
    {
      title: 'Recall relevant memories',
      description: 'Search and return memory entries relevant to a query',
      argsSchema: {
        query: z.string().describe('Natural-language memory search query'),
        workspace_id: z.string().describe('Workspace ID'),
        project_id: z.string().describe('Project ID'),
      },
    },
    async ({ query, workspace_id, project_id }) => {
      const result = await options.handleToolCall('recall_memory', { query, workspace_id, project_id })
      return {
        messages: [{
          role: 'user' as const,
          content: { type: 'text' as const, text: JSON.stringify(result) },
        }],
      }
    },
  )

  // ---------- Logging capability ----------
  // Handle logging/setLevel so clients can control server log verbosity.
  server.server.setRequestHandler(SetLevelRequestSchema, (request) => {
    const level = request.params.level
    process.stderr.write(`[fulcrum mcp] logging level set to: ${level}\n`)
    return {}
  })

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

// ---------- StreamableHTTP transport ----------

export interface McpHttpServerOptions extends McpServerOptions {
  port?: number
  host?: string
}

/**
 * Serve the Fulcrum MCP server over HTTP using the StreamableHTTP transport.
 * Session state is preserved across requests via a session map keyed by
 * the MCP session ID returned in the mcp-session-id response header.
 * Listens on /mcp for POST (tool calls) and GET (SSE notifications).
 */
export async function runFulcrumMcpHttpServer(options: McpHttpServerOptions): Promise<void> {
  const port = options.port ?? 4722
  const host = options.host ?? '127.0.0.1'

  // Session map: session ID → { server, transport } pair kept alive across requests.
  const sessions = new Map<string, {
    server: McpServer
    transport: StreamableHTTPServerTransport
    lastUsed: number
  }>()

  // Evict sessions inactive for >30 minutes every 5 minutes.
  setInterval(() => {
    const cutoff = Date.now() - 30 * 60 * 1000
    for (const [id, session] of sessions) {
      if (session.lastUsed < cutoff) {
        session.server.close().catch(() => {})
        sessions.delete(id)
      }
    }
  }, 5 * 60 * 1000).unref()

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${host}`)

    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found. Use POST /mcp for MCP requests.' }))
      return
    }

    // For existing sessions, reuse the stored server+transport pair.
    const incomingSessionId = req.headers['mcp-session-id'] as string | undefined
    let sessionEntry = incomingSessionId ? sessions.get(incomingSessionId) : undefined

    if (!sessionEntry) {
      // New session: create server and transport, connect them once.
      const mcpServer = createFulcrumMcpServer(options)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      })

      // Clean up the session entry when transport closes.
      transport.onclose = () => {
        const sid = transport.sessionId
        if (sid) sessions.delete(sid)
        mcpServer.close().catch(() => {})
      }

      await mcpServer.connect(transport)

      // The transport generates its session ID on the first initialize request.
      // We store under a placeholder key until we can retrieve the real session ID
      // after handleRequest writes the response headers.
      sessionEntry = { server: mcpServer, transport, lastUsed: Date.now() }
    } else {
      sessionEntry.lastUsed = Date.now()
    }

    try {
      await sessionEntry.transport.handleRequest(req, res)

      // After the first request the transport has a session ID — index it.
      const sid = sessionEntry.transport.sessionId
      if (sid && !sessions.has(sid)) {
        sessions.set(sid, sessionEntry)
      }
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: (err as Error).message }))
      }
    }
  })

  const shutdown = async () => {
    process.stderr.write('[fulcrum mcp-http] shutting down\n')
    await new Promise<void>((resolve, reject) => httpServer.close(err => err ? reject(err) : resolve()))
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(port, host, () => resolve())
    httpServer.once('error', reject)
  })

  process.stderr.write(`[fulcrum mcp-http] MCP StreamableHTTP server started on http://${host}:${port}/mcp\n`)

  // Keep alive
  await new Promise<void>(() => {})
}
