// packages/workflows/src/registry.ts
import type { WorkflowDefinition } from './types.js'

const BUILTIN_WORKFLOWS: WorkflowDefinition[] = [
  {
    name: 'grill-me',
    version: '1.0',
    description: 'Interactive discovery — ask questions, search, write to memory',
    steps: [
      { step_id: 'ask', step_type: 'prompt_user', name: 'Ask discovery questions', config: {} },
      { step_id: 'search', step_type: 'search_web', name: 'Search for context', config: {}, depends_on: ['ask'] },
      { step_id: 'recall', step_type: 'read_memory', name: 'Read relevant memory', config: {}, depends_on: ['ask'] },
      { step_id: 'save', step_type: 'write_memory', name: 'Write findings to memory', config: {}, depends_on: ['search', 'recall'] },
      { step_id: 'done', step_type: 'complete', name: 'Complete', config: {}, depends_on: ['save'] },
    ],
  },
  {
    name: 'write-a-prd',
    version: '1.0',
    description: 'PRD generation from memory + user input',
    steps: [
      { step_id: 'recall', step_type: 'read_memory', name: 'Read context memory', config: {} },
      { step_id: 'prompt', step_type: 'prompt_user', name: 'Gather requirements', config: {}, depends_on: ['recall'] },
      { step_id: 'agent', step_type: 'spawn_agent', name: 'Spawn prd_planner', config: { role: 'prd_planner' }, depends_on: ['prompt'] },
      { step_id: 'artifact', step_type: 'write_artifact', name: 'Write PRD artifact', config: { artifact_type: 'prd' }, depends_on: ['agent'] },
      { step_id: 'save', step_type: 'write_memory', name: 'Store PRD in memory', config: {}, depends_on: ['artifact'] },
      { step_id: 'done', step_type: 'complete', name: 'Complete', config: {}, depends_on: ['save'] },
    ],
  },
  {
    name: 'prd-to-plan',
    version: '1.0',
    description: 'Generate implementation plan from PRD',
    steps: [
      { step_id: 'recall', step_type: 'read_memory', name: 'Read PRD from memory', config: { kind: 'prd' } },
      { step_id: 'agent', step_type: 'spawn_agent', name: 'Spawn implementation_planner', config: { role: 'implementation_planner' }, depends_on: ['recall'] },
      { step_id: 'tasks', step_type: 'create_task', name: 'Create tasks from plan', config: { multi: true }, depends_on: ['agent'] },
      { step_id: 'artifact', step_type: 'write_artifact', name: 'Write plan artifact', config: { artifact_type: 'plan' }, depends_on: ['tasks'] },
      { step_id: 'done', step_type: 'complete', name: 'Complete', config: {}, depends_on: ['artifact'] },
    ],
  },
  {
    name: 'prd-to-issues',
    version: '1.0',
    description: 'Decompose PRD into issues',
    steps: [
      { step_id: 'recall', step_type: 'read_memory', name: 'Read PRD from memory', config: { kind: 'prd' } },
      { step_id: 'agent', step_type: 'spawn_agent', name: 'Spawn issue_decomposer', config: { role: 'issue_decomposer' }, depends_on: ['recall'] },
      { step_id: 'issues', step_type: 'create_issue', name: 'Create issues', config: { multi: true }, depends_on: ['agent'] },
      { step_id: 'done', step_type: 'complete', name: 'Complete', config: {}, depends_on: ['issues'] },
    ],
  },
]

export class WorkflowRegistry {
  private readonly definitions = new Map<string, WorkflowDefinition>()

  constructor() {
    for (const def of BUILTIN_WORKFLOWS) {
      this.definitions.set(def.name, def)
    }
  }

  getDefinition(name: string): WorkflowDefinition | undefined {
    return this.definitions.get(name)
  }

  register(def: WorkflowDefinition): void {
    this.definitions.set(def.name, def)
  }

  listAll(): WorkflowDefinition[] {
    return Array.from(this.definitions.values())
  }
}

// Singleton registry shared across all calls in this process
export const registry = new WorkflowRegistry()
