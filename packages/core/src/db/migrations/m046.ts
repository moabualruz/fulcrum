import type Database from 'better-sqlite3'

// MIGRATION_046 — agent_definitions: populate output_schema for key roles.
//
// GAP-SKILLS-7: AgentDefinition.output_schema exists in DB and types but is
// NULL everywhere.  Structured output schemas give routing agents signal about
// what each role produces and enable downstream consumers to parse results.
//
// Uses JSON Schema (draft-07 subset) for the output_schema field.
export function runM046(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '046_agent_definitions_output_schemas'").get()
  if (already) return

  const now = Math.floor(Date.now() / 1000)
  const schemas: Array<{ role: string; output_schema: object }> = [
    {
      role: 'chief_of_staff',
      output_schema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['DONE', 'IN_PROGRESS', 'BLOCKED'] },
          work_completed: { type: 'array', items: { type: 'string' } },
          next_steps: { type: 'array', items: { type: 'string' } },
          risks_blockers: { type: 'array', items: { type: 'string' } },
        },
        required: ['status', 'work_completed', 'next_steps'],
      },
    },
    {
      role: 'qa_engineer',
      output_schema: {
        type: 'object',
        properties: {
          tests_passed: { type: 'integer', minimum: 0 },
          tests_failed: { type: 'integer', minimum: 0 },
          coverage_percent: { type: 'number', minimum: 0, maximum: 100 },
          failures: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                error: { type: 'string' },
              },
              required: ['name', 'error'],
            },
          },
          verdict: { type: 'string', enum: ['pass', 'fail', 'partial'] },
        },
        required: ['tests_passed', 'tests_failed', 'verdict'],
      },
    },
    {
      role: 'security_reviewer',
      output_schema: {
        type: 'object',
        properties: {
          findings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low', 'Informational'] },
                location: { type: 'string' },
                issue: { type: 'string' },
                recommendation: { type: 'string' },
              },
              required: ['severity', 'issue'],
            },
          },
          verdict: { type: 'string', enum: ['approved', 'requires_changes', 'blocked'] },
          critical_count: { type: 'integer', minimum: 0 },
        },
        required: ['findings', 'verdict'],
      },
    },
    {
      role: 'code_reviewer',
      output_schema: {
        type: 'object',
        properties: {
          verdict: { type: 'string', enum: ['approve', 'request_changes', 'comment'] },
          comments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                severity: { type: 'string', enum: ['Critical', 'Important', 'Nit', 'Optional', 'FYI'] },
                location: { type: 'string' },
                message: { type: 'string' },
              },
              required: ['severity', 'message'],
            },
          },
        },
        required: ['verdict', 'comments'],
      },
    },
    {
      role: 'integration_worker',
      output_schema: {
        type: 'object',
        properties: {
          merged: { type: 'boolean' },
          conflicts_resolved: { type: 'integer', minimum: 0 },
          tests_passed: { type: 'integer', minimum: 0 },
          tests_failed: { type: 'integer', minimum: 0 },
          pr_url: { type: 'string' },
          commit_sha: { type: 'string' },
        },
        required: ['merged'],
      },
    },
  ]

  const stmt = db.prepare(`
    UPDATE agent_definitions SET output_schema = ?, updated_at = ?
    WHERE role = ? AND (output_schema IS NULL OR output_schema = '')
  `)
  for (const s of schemas) {
    stmt.run(JSON.stringify(s.output_schema), now, s.role)
  }

  db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('046_agent_definitions_output_schemas')").run()
}
