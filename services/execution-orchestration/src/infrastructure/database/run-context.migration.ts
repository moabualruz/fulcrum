import type { MigrationInterface, QueryRunner } from "typeorm";

export class RunContext1778623200005 implements MigrationInterface {
  name = "RunContext1778623200005";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE fulcrum_memories (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        trace_id varchar(160) NOT NULL,
        scope varchar(80) NOT NULL,
        kind varchar(80) NOT NULL,
        body text NOT NULL,
        tags jsonb NOT NULL DEFAULT '[]'::jsonb,
        importance varchar(80) NOT NULL,
        source varchar(80) NOT NULL,
        source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
        archived boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_memories_scope_check CHECK (scope IN ('project', 'workspace', 'global')),
        CONSTRAINT fulcrum_memories_kind_check CHECK (kind IN ('note', 'decision', 'blocker', 'file_ref', 'section_anchor', 'link', 'fact')),
        CONSTRAINT fulcrum_memories_importance_check CHECK (importance IN ('low', 'medium', 'high')),
        CONSTRAINT fulcrum_memories_source_check CHECK (source IN ('heuristic', 'llm', 'manual', 'system'))
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_memories_project_importance_idx ON fulcrum_memories (project_id, importance)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_memories_trace_idx ON fulcrum_memories (trace_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_memories_scope_kind_idx ON fulcrum_memories (scope, kind)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_memories_archived_idx ON fulcrum_memories (archived)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_memory_links (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        memory_id varchar(128) NOT NULL REFERENCES fulcrum_memories(id) ON DELETE CASCADE,
        target_kind varchar(80) NOT NULL,
        target_id varchar(128) NOT NULL,
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_memory_links_target_kind_check CHECK (target_kind IN ('task', 'doc', 'agent_run', 'artifact', 'context_bundle')),
        CONSTRAINT fulcrum_memory_links_memory_target_key UNIQUE (memory_id, target_kind, target_id)
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_memory_links_memory_idx ON fulcrum_memory_links (memory_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_memory_links_target_idx ON fulcrum_memory_links (project_id, target_kind, target_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_memory_links_trace_idx ON fulcrum_memory_links (trace_id)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_context_bundles (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        trace_id varchar(160) NOT NULL,
        task_id varchar(128) REFERENCES fulcrum_tasks(id) ON DELETE SET NULL,
        run_id varchar(128) REFERENCES fulcrum_agent_runs(id) ON DELETE SET NULL,
        purpose varchar(80) NOT NULL,
        source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
        bundle_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        token_count int NOT NULL,
        source_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_context_bundles_purpose_check CHECK (purpose IN ('acp_planning', 'agent_run', 'final_qa', 'uat_review', 'continuous_update', 'manual_review'))
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_context_bundles_trace_idx ON fulcrum_context_bundles (trace_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_context_bundles_run_idx ON fulcrum_context_bundles (project_id, run_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_context_bundles_task_idx ON fulcrum_context_bundles (project_id, task_id)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_run_events (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        run_id varchar(128) NOT NULL REFERENCES fulcrum_agent_runs(id) ON DELETE CASCADE,
        task_id varchar(128) REFERENCES fulcrum_tasks(id) ON DELETE SET NULL,
        trace_id varchar(160) NOT NULL,
        sequence int NOT NULL,
        domain varchar(80) NOT NULL,
        mutation_type varchar(160) NOT NULL,
        target_kind varchar(80) NOT NULL,
        target_id varchar(128) NOT NULL,
        agent_id varchar(160),
        task_lineage_id varchar(160),
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_run_events_domain_check CHECK (domain IN ('git', 'database', 'filesystem', 'executor', 'review', 'acp', 'system')),
        CONSTRAINT fulcrum_run_events_run_sequence_key UNIQUE (run_id, sequence)
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_run_events_project_trace_idx ON fulcrum_run_events (project_id, trace_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_run_events_run_idx ON fulcrum_run_events (run_id, sequence)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_run_events_task_idx ON fulcrum_run_events (project_id, task_id)",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_run_events");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_context_bundles");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_memory_links");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_memories");
  }
}
