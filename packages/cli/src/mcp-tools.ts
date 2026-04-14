// packages/cli/src/mcp-tools.ts
// Single source of truth for all MCP tool schemas.
// Used by the MCP server (tool registration) and the CLAUDE.md code-generator.

export interface ToolSchema {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'list_tasks',
    description: 'Lists tasks in a workspace/project. Returns id, title, status, priority, assigned_to, blockers. Filters by status when provided. Effect: read-only. Returns: array of task summaries.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
        status: { type: 'string', description: 'Filter by status (queued, running, blocked, completed)' },
        limit: { type: 'number', description: 'Max results (default 40)' },
      },
      required: ['project_id', 'workspace_id'],
    },
  },
  {
    name: 'create_task',
    description: 'Creates a new task in the project. Auto-creates workspace and project if they do not exist. Effect: writes task row. Returns: task_id, title, status, priority, assigned_to.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        project_id: { type: 'string', description: 'Project ID' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
        description: { type: 'string', description: 'Optional task description' },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'none'], description: 'Priority level' },
        assigned_to: { type: 'string', description: 'Agent role slug to assign the task to' },
        done_criteria: { type: 'string', description: 'Definition of done' },
      },
      required: ['title', 'project_id', 'workspace_id'],
    },
  },
  {
    name: 'update_task',
    description: "Updates a task's status, note, or assignment. Effect: updates task row. Returns: task_id, updated=true, list of changed fields.",
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to update' },
        status: { type: 'string', description: 'New status value' },
        note: { type: 'string', description: 'Progress note' },
        assigned_to: { type: 'string', description: 'Reassign to this agent role slug' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'recall_memory',
    description: 'Hybrid semantic search over agent memory (FTS5 + vector + rerank). Returns top-k most relevant memories for the query in the given workspace/project scope. Effect: read-only. Returns: array of {content, score, tags}. Requires workspace_id and project_id.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
        project_id: { type: 'string', description: 'Project ID' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query', 'workspace_id', 'project_id'],
    },
  },
  {
    name: 'write_memory',
    description: 'Writes a memory note to the project memory store. Persists to vault (L0), SQLite FTS5 (L1), and vector index. Effect: writes memory row + vault file. Returns: saved=true, memory_id, project_id, tags.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Memory content (plain text)' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
        project_id: { type: 'string', description: 'Project ID' },
        title: { type: 'string', description: 'Optional title (defaults to first 80 chars of content)' },
        tags: { type: 'string', description: 'Comma-separated tags (e.g. "decision,architecture")' },
      },
      required: ['content', 'workspace_id', 'project_id'],
    },
  },
  {
    name: 'list_agent_profiles',
    description: 'Lists all 24 canonical AgentRole profiles. When workspace_id is provided, also returns DB-backed custom profiles for that workspace. Effect: read-only. Returns: array of {role, name, description, capabilities}.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: {
          type: 'string',
          description: 'Optional. When provided, DB-backed profiles for this workspace are merged into the response.',
        },
      },
    },
  },
  {
    name: 'get_agent_run_status',
    description: 'Gets live status of a running agent run. Effect: read-only. Returns: run_id, status, role, current_step, progress_pct.',
    inputSchema: {
      type: 'object',
      properties: { run_id: { type: 'string', description: 'Run ID returned by start_agent_run' } },
      required: ['run_id'],
    },
  },
  {
    name: 'start_agent_run',
    description: 'Registers the start of an agent run. Call at the beginning of every task. Auto-creates a stub task if task_id is not provided. Effect: inserts agent_runs row, updates task status to running. Returns: run_id, status.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to associate (auto-creates stub if not found or not provided)' },
        agent_role: { type: 'string', description: 'One of the 24 canonical role slugs (e.g. software_engineer)' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
        project_id: { type: 'string', description: 'Optional project ID (defaults to workspace_id)' },
        worktree_path: { type: 'string', description: 'Optional git worktree path for code-writing roles' },
        pi_run_id: { type: 'string', description: 'Optional custom run ID for external tracking' },
      },
      required: ['agent_role', 'workspace_id'],
    },
  },
  {
    name: 'heartbeat_agent_run',
    description: 'Sends a heartbeat for a running agent to prevent it being marked stale. Call every ~30 seconds during long tasks. Effect: updates heartbeat_at. Returns: run_id, ok=true.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'Run ID from start_agent_run' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
        current_step: { type: 'string', description: 'Optional current step description' },
        progress_pct: { type: 'number', description: 'Optional progress percentage (0–100)' },
      },
      required: ['run_id', 'workspace_id'],
    },
  },
  {
    name: 'complete_agent_run',
    description: 'Marks an agent run as completed with optional summary and artifact paths. Effect: sets agent_runs.status=finished, records artifacts. Returns: run_id, status.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'Run ID from start_agent_run' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
        output_summary: { type: 'string', description: 'Summary of what was accomplished' },
        artifact_paths: { type: 'string', description: 'Comma-separated artifact file paths changed or created' },
      },
      required: ['run_id', 'workspace_id'],
    },
  },
  {
    name: 'block_agent_run',
    description: 'Marks an agent run as blocked with a reason. Use when work cannot continue without human input or another agent resolving a dependency. Effect: sets status=blocked, records reason. Returns: run_id, status, reason.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'Run ID from start_agent_run' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
        reason: { type: 'string', description: 'Why the run is blocked (will surface in workspace status)' },
      },
      required: ['run_id', 'workspace_id', 'reason'],
    },
  },
  {
    name: 'build_cos_context',
    description: 'Builds a Chief-of-Staff world-state snapshot: active tasks, running agents, blockers, recent events. Use to orient before delegating work. Effect: read-only. Returns: context_markdown (formatted for system prompt injection).',
    inputSchema: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'Optional goal description (included in snapshot header)' },
        project_id: { type: 'string', description: 'Project ID' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
        max_tasks: { type: 'number', description: 'Max tasks to include (default 20)' },
        max_events: { type: 'number', description: 'Max events to include (default 10)' },
      },
      required: ['project_id', 'workspace_id'],
    },
  },
  {
    name: 'get_workspace_status',
    description: 'Gets full workspace status: running agents, blockers, WIP count, queue depth, recent runs. Effect: read-only. Returns: workspace_id, active_runs, blocked_runs, wip_count, queued_tasks, runs array, blockers array.',
    inputSchema: {
      type: 'object',
      properties: { workspace_id: { type: 'string', description: 'Workspace ID' } },
      required: ['workspace_id'],
    },
  },
  {
    name: 'create_team_template',
    description: 'Creates a new team template with role slots and policy. Templates are global (not workspace-scoped). Only chief_of_staff may invoke templates via invoke_team. Effect: writes team_templates row. Returns: template object.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Human-readable template name (globally unique)' },
        description: { type: 'string', description: 'Optional description' },
        slots: {
          type: 'array',
          description: 'Team slots — each specifies a role, counts, and optional agent_profile',
          items: {
            type: 'object',
            properties: {
              slot_id: { type: 'string', description: 'Unique slot identifier within the template' },
              role: { type: 'string', description: 'AgentRole slug (e.g. software_engineer)' },
              min_count: { type: 'number', description: 'Minimum members of this slot' },
              max_count: { type: 'number', description: 'Maximum members of this slot' },
              concurrency_cap: { type: 'number', description: 'Max concurrent members allowed' },
              required: { type: 'boolean', description: 'Whether the slot must be filled' },
              description: { type: 'string' },
              agent_profile: { type: 'string', description: 'Optional DB-backed profile_id' },
              spawn_mode: { type: 'string', enum: ['auto', 'manual'] },
            },
            required: ['slot_id', 'role', 'min_count', 'max_count', 'concurrency_cap', 'required'],
          },
        },
        policy: {
          type: 'object',
          description: 'Optional team policy (communication_mode, budget_class, quality_class, etc.)',
        },
      },
      required: ['name', 'slots'],
    },
  },
  {
    name: 'invoke_team',
    description: 'Instantiates a team from a template and starts execution. Only chief_of_staff may invoke teams (enforced by canInvokeTeams capability check). Effect: creates team_instance, spawns agents. Returns: team instance object.',
    inputSchema: {
      type: 'object',
      properties: {
        template_id: { type: 'string', description: 'Template to instantiate' },
        workspace_id: { type: 'string', description: 'Workspace ID' },
        project_id: { type: 'string', description: 'Optional project scope' },
        purpose: { type: 'string', description: 'Why this team is being spawned' },
        task_id: { type: 'string', description: 'Optional originating task' },
        caller_agent_id: { type: 'string', description: 'Agent ID of the invoker' },
        caller_role: { type: 'string', description: 'Role of the invoker (must be chief_of_staff)' },
        initial_slots: {
          type: 'object',
          description: 'Optional initial slot → agent_id[] mapping',
        },
      },
      required: ['template_id', 'workspace_id', 'purpose', 'caller_agent_id', 'caller_role'],
    },
  },
  {
    name: 'list_team_templates',
    description: 'Lists all team templates. Templates are global (not workspace-scoped). Effect: read-only. Returns: array of template objects.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max rows (default 50)' },
        offset: { type: 'number', description: 'Pagination offset (default 0)' },
      },
    },
  },
  {
    name: 'list_team_instances',
    description: 'Lists team instances in a workspace, optionally filtered by status_category. Effect: read-only. Returns: array of team instance objects.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        project_id: { type: 'string', description: 'Optional project scope' },
        status_category: {
          type: 'string',
          enum: ['backlog', 'active', 'blocked', 'done'],
          description: 'Filter by status category',
        },
        limit: { type: 'number', description: 'Max rows (default 50)' },
        offset: { type: 'number', description: 'Pagination offset (default 0)' },
      },
      required: ['workspace_id'],
    },
  },
  {
    name: 'create_agent_profile',
    description: 'Creates a DB-backed agent profile for a workspace. Extends the 24 canonical AgentRole slugs with workspace-scoped specializations referenceable from team template slots. Effect: writes agent_profiles row. Returns: profile object.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        name: { type: 'string', description: 'Profile name, unique within the workspace' },
        description: { type: 'string', description: 'Profile description' },
        base_role: { type: 'string', description: 'Canonical AgentRole slug to inherit from (defaults to "custom")' },
        system_prompt: { type: 'string', description: 'Optional system prompt override' },
        capabilities: { type: 'object', description: 'Optional capability flags / metadata' },
        created_by: { type: 'string', description: 'Agent ID of the creator' },
      },
      required: ['workspace_id', 'name', 'description'],
    },
  },
]

/** Convenience lookup: tool name → schema */
export const TOOL_SCHEMA_MAP = new Map(TOOL_SCHEMAS.map(t => [t.name, t]))
