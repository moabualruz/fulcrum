import type { MigrationInterface, QueryRunner } from "typeorm";

export class WorkflowSpine1778623200001 implements MigrationInterface {
  name = "WorkflowSpine1778623200001";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE fulcrum_workspaces (
        id varchar(128) PRIMARY KEY,
        slug varchar(160) NOT NULL UNIQUE,
        name varchar(240) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE fulcrum_projects (
        id varchar(128) PRIMARY KEY,
        workspace_id varchar(128) NOT NULL REFERENCES fulcrum_workspaces(id) ON DELETE CASCADE,
        slug varchar(160) NOT NULL,
        name varchar(240) NOT NULL,
        description text,
        status varchar(80) NOT NULL DEFAULT 'active',
        owner_id varchar(128),
        trace_id varchar(160) NOT NULL,
        methodology varchar(32) NOT NULL DEFAULT 'kanban',
        workflow_config jsonb,
        enabled_task_types jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_projects_methodology_check CHECK (methodology in ('scrum','kanban','none')),
        CONSTRAINT fulcrum_projects_workspace_slug_key UNIQUE (workspace_id, slug)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE fulcrum_tasks (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        external_id varchar(160),
        title varchar(320) NOT NULL,
        description text,
        description_text text,
        tiptap_content jsonb NOT NULL DEFAULT '{}'::jsonb,
        status varchar(80) NOT NULL,
        priority int,
        points int,
        assignee_id varchar(128),
        parent_task_id varchar(128) REFERENCES fulcrum_tasks(id) ON DELETE SET NULL,
        success_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
        custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
        trace_id varchar(160) NOT NULL,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_tasks_project_status_idx ON fulcrum_tasks (project_id, status)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_tasks_trace_idx ON fulcrum_tasks (trace_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_tasks_project_deleted_idx ON fulcrum_tasks (project_id, deleted_at)",
    );
    await queryRunner.query(
      "CREATE UNIQUE INDEX fulcrum_tasks_project_external_idx ON fulcrum_tasks (project_id, external_id) WHERE external_id IS NOT NULL",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_tasks_project_parent_idx ON fulcrum_tasks (project_id, parent_task_id)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_task_dependencies (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        task_id varchar(128) NOT NULL REFERENCES fulcrum_tasks(id) ON DELETE CASCADE,
        depends_on_task_id varchar(128) NOT NULL REFERENCES fulcrum_tasks(id) ON DELETE CASCADE,
        dependency_kind varchar(80) NOT NULL,
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_task_dependencies_unique_edge
          UNIQUE (task_id, depends_on_task_id, dependency_kind)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE fulcrum_documents (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        parent_id varchar(128),
        title varchar(320) NOT NULL,
        body_md text NOT NULL,
        source_type varchar(80) NOT NULL,
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_documents_project_source_idx ON fulcrum_documents (project_id, source_type)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_documents_project_parent_idx ON fulcrum_documents (project_id, parent_id)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_acp_sessions (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) REFERENCES fulcrum_projects(id) ON DELETE SET NULL,
        trace_id varchar(160) NOT NULL,
        agent_name varchar(160) NOT NULL,
        mode varchar(80) NOT NULL,
        model varchar(160),
        status varchar(80) NOT NULL,
        traffic_log jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_acp_sessions_trace_idx ON fulcrum_acp_sessions (trace_id)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_agent_runs (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        task_id varchar(128) REFERENCES fulcrum_tasks(id) ON DELETE SET NULL,
        trace_id varchar(160) NOT NULL,
        status varchar(80) NOT NULL,
        dependency_tree jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_agent_runs_project_status_idx ON fulcrum_agent_runs (project_id, status)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_agent_runs_trace_idx ON fulcrum_agent_runs (trace_id)",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_agent_runs");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_acp_sessions");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_documents");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_task_dependencies");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_tasks");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_projects");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_workspaces");
  }
}
