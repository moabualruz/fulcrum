import { describe, it, expect } from 'vitest'
import type {
  TaskStatus, AgentRunStatus, StatusCategory,
  WorkspaceStatus, ProjectStatus, ProjectType, WriteMode,
  AgentRole, TaskRelationType, MemoryScope, MemoryKind,
  ArtifactType, EventType,
  Task, AgentRun, Memory, FulcrumEvent, TaskRelation,
  AgentProfile, AgentRoleDescriptor,
} from '../types.js'

describe('type exports — compile-time shape checks', () => {
  it('TaskStatus includes all 8 values', () => {
    const statuses: TaskStatus[] = [
      'queued', 'ready', 'claimed', 'running',
      'blocked', 'failed', 'completed', 'cancelled',
    ]
    expect(statuses).toHaveLength(8)
  })

  it('AgentRunStatus includes all 8 values', () => {
    const statuses: AgentRunStatus[] = [
      'created', 'starting', 'running', 'waiting',
      'blocked', 'failed', 'finished', 'aborted',
    ]
    expect(statuses).toHaveLength(8)
  })

  it('StatusCategory has 4 values', () => {
    const cats: StatusCategory[] = ['backlog', 'active', 'blocked', 'done']
    expect(cats).toHaveLength(4)
  })

  it('AgentRole includes all 24 roles', () => {
    const roles: AgentRole[] = [
      'chief_of_staff', 'context_gatherer', 'prd_planner', 'implementation_planner',
      'issue_decomposer', 'software_engineer', 'research_worker',
      'refactor_worker', 'browser_worker', 'data_engineer', 'ml_engineer', 'devops_engineer',
      'architecture_reviewer', 'code_reviewer', 'qa_engineer', 'security_reviewer',
      'integration_worker', 'documentation_writer', 'memory_curator',
      'tech_lead', 'product_manager', 'analyst', 'orchestrator', 'custom',
    ]
    expect(roles).toHaveLength(24)
  })

  it('Task interface has display_id, priority, status_category fields', () => {
    const t: Task = {
      task_id: 'task_01', workspace_id: 'ws_01', project_id: 'proj_01',
      issue_id: null, display_id: 'TASK-1', title: 'Test task',
      description: null, status: 'queued', status_category: 'backlog',
      priority: 'medium', estimate_type: null, estimate_value: null,
      assigned_to: null, note: null, done_criteria: null,
      version: 0, created_at: '', updated_at: '',
      claimed_at: null, completed_at: null,
      assigned_run_id: null, labels: [], blockers: [],
    }
    expect(t.display_id).toBe('TASK-1')
    expect(t.status_category).toBe('backlog')
    expect(t.priority).toBe('medium')
  })

  it('AgentRun interface has display_id, agent_id, status_category, blocker, finished_at', () => {
    const r: AgentRun = {
      run_id: 'run_01', task_id: 'task_01', workspace_id: 'ws_01',
      project_id: 'proj_01', display_id: 'RUN-1', agent_id: 'agent-1',
      role: 'software_engineer', pi_profile: null, status: 'running',
      status_category: 'active', current_step: null, current_path: null,
      progress_pct: 0, output_summary: null, artifacts: null,
      git_branch: null, git_commit: null, heartbeat_at: null,
      blocker: null, worktree_id: null, version: 0,
      context_type: 'primary', parent_run_id: null,
      started_at: '', updated_at: '', finished_at: null,
    }
    expect(r.display_id).toBe('RUN-1')
    expect(r.agent_id).toBe('agent-1')
    expect(r.blocker).toBeNull()
    expect(r.finished_at).toBeNull()
  })

  it('Memory interface has scope, kind, title, summary, canonical_text fields', () => {
    const m: Memory = {
      memory_id: 'mem_01', scope: 'project', kind: 'fact',
      workspace_id: 'ws_01', project_id: 'proj_01', file_path: null,
      symbol_path: null, title: 'A fact', summary: 'Short summary',
      content: 'A fact about the project', content_type: 'text', canonical_text: null,
      tags: [], entities: [], confidence: 1.0, freshness: 1.0, importance: 0.5,
      access_count: 0, event_time: null, content_hash: null,
      task_id: null, issue_id: null, artifact_id: null,
      provenance_refs: [], embedding: null,
      created_at: '', updated_at: '', last_accessed_at: '',
    }
    expect(m.scope).toBe('project')
    expect(m.kind).toBe('fact')
    expect(m.title).toBe('A fact')
  })

  it('FulcrumEvent interface has all required fields', () => {
    const e: FulcrumEvent = {
      evt_id: 'evt_01', workspace_id: 'ws_01', project_id: null,
      evt_type: 'task_created', ts: '', object_type: 'task',
      object_id: 'task_01', actor_type: 'agent', actor_id: 'agent-1',
      payload: {}, severity: 'info',
      trace_id: null, span_id: null, correlation_id: null,
    }
    expect(e.evt_type).toBe('task_created')
    expect(e.severity).toBe('info')
  })

  it('TaskRelation interface has all required fields', () => {
    const tr: TaskRelation = {
      task_id: 'task_01', target_task_id: 'task_02',
      relation_type: 'blocks', created_at: '',
    }
    expect(tr.relation_type).toBe('blocks')
  })

  it('AgentRoleDescriptor is an alias for AgentProfile', () => {
    // Both types should accept the same shape at compile time
    const profile: AgentProfile = {
      role: 'software_engineer',
      description: 'Writes code',
      can_create_teams: false,
      can_dispatch_agents: true,
      source: 'hardcoded',
    }
    // AgentRoleDescriptor and AgentProfile are structurally identical types
    const descriptor: AgentRoleDescriptor = profile  // should not cause TS error
    expect(descriptor.role).toBe('software_engineer')
    expect(descriptor.can_create_teams).toBe(false)
    expect(descriptor.can_dispatch_agents).toBe(true)
  })

  it('Memory interface has content_type field', () => {
    const m: Memory = {
      memory_id: 'mem_02', scope: 'project', kind: 'code',
      content_type: 'code',
      workspace_id: 'ws_01', project_id: 'proj_01', file_path: null,
      symbol_path: null, title: 'Code snippet', summary: 'A code example',
      content: 'function hello() {}', canonical_text: null,
      tags: [], entities: [], confidence: 1.0, freshness: 1.0, importance: 0.5,
      access_count: 0, event_time: null, content_hash: null,
      task_id: null, issue_id: null, artifact_id: null,
      provenance_refs: [], embedding: null,
      created_at: '', updated_at: '', last_accessed_at: '',
    }
    expect(m.content_type).toBe('code')
  })
})
