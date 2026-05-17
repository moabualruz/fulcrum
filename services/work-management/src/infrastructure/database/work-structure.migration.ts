import type { MigrationInterface, QueryRunner } from "typeorm";

export class WorkManagement1778623200003 implements MigrationInterface {
  name = "WorkManagement1778623200003";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE fulcrum_task_states (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        name varchar(160) NOT NULL,
        state_group varchar(80) NOT NULL,
        color varchar(32) NOT NULL,
        sequence int NOT NULL,
        is_default boolean NOT NULL DEFAULT false,
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_task_states_project_name_key UNIQUE (project_id, name)
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_task_states_project_group_idx ON fulcrum_task_states (project_id, state_group)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_task_labels (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        name varchar(160) NOT NULL,
        color varchar(32) NOT NULL,
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_task_labels_project_name_key UNIQUE (project_id, name)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE fulcrum_task_label_assignments (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        task_id varchar(128) NOT NULL REFERENCES fulcrum_tasks(id) ON DELETE CASCADE,
        label_id varchar(128) NOT NULL REFERENCES fulcrum_task_labels(id) ON DELETE CASCADE,
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_task_label_assignments_task_label_key UNIQUE (task_id, label_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE fulcrum_cycles (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        name varchar(180) NOT NULL,
        status varchar(80) NOT NULL,
        starts_at timestamptz,
        ends_at timestamptz,
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_cycles_project_name_key UNIQUE (project_id, name)
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_cycles_project_status_idx ON fulcrum_cycles (project_id, status)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_cycle_tasks (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        cycle_id varchar(128) NOT NULL REFERENCES fulcrum_cycles(id) ON DELETE CASCADE,
        task_id varchar(128) NOT NULL REFERENCES fulcrum_tasks(id) ON DELETE CASCADE,
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_cycle_tasks_cycle_task_key UNIQUE (cycle_id, task_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE fulcrum_modules (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        name varchar(180) NOT NULL,
        status varchar(80) NOT NULL,
        lead_user_id varchar(128),
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_modules_project_name_key UNIQUE (project_id, name)
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_modules_project_status_idx ON fulcrum_modules (project_id, status)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_module_tasks (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        module_id varchar(128) NOT NULL REFERENCES fulcrum_modules(id) ON DELETE CASCADE,
        task_id varchar(128) NOT NULL REFERENCES fulcrum_tasks(id) ON DELETE CASCADE,
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_module_tasks_module_task_key UNIQUE (module_id, task_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE fulcrum_saved_views (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        name varchar(180) NOT NULL,
        layout varchar(80) NOT NULL,
        filters jsonb NOT NULL DEFAULT '{}'::jsonb,
        group_by varchar(120),
        sort_by varchar(120),
        display_properties jsonb NOT NULL DEFAULT '{}'::jsonb,
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_saved_views_project_layout_idx ON fulcrum_saved_views (project_id, layout)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_intake_requests (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        title varchar(320) NOT NULL,
        description text,
        status varchar(80) NOT NULL,
        source varchar(80) NOT NULL,
        task_id varchar(128) REFERENCES fulcrum_tasks(id) ON DELETE SET NULL,
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_intake_requests_project_status_idx ON fulcrum_intake_requests (project_id, status)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_notifications (
        id varchar(128) PRIMARY KEY,
        workspace_id varchar(128) NOT NULL REFERENCES fulcrum_workspaces(id) ON DELETE CASCADE,
        project_id varchar(128) REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        task_id varchar(128) REFERENCES fulcrum_tasks(id) ON DELETE CASCADE,
        type varchar(120) NOT NULL,
        actor_id varchar(128),
        recipient_id varchar(128) NOT NULL,
        read_at timestamptz,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_notifications_recipient_read_idx ON fulcrum_notifications (recipient_id, read_at)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_notifications_trace_idx ON fulcrum_notifications (trace_id)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_task_comments (
        id varchar(128) PRIMARY KEY,
        org_id varchar(128) NOT NULL REFERENCES fulcrum_workspaces(id) ON DELETE CASCADE,
        task_id varchar(128) NOT NULL REFERENCES fulcrum_tasks(id) ON DELETE CASCADE,
        author_id varchar(128) NOT NULL,
        body jsonb,
        parent_comment_id varchar(128) REFERENCES fulcrum_task_comments(id) ON DELETE CASCADE,
        resolved boolean NOT NULL DEFAULT false,
        resolved_by varchar(128),
        resolved_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_task_comments_task_idx ON fulcrum_task_comments (task_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_task_comments_org_task_idx ON fulcrum_task_comments (org_id, task_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_task_comments_parent_idx ON fulcrum_task_comments (parent_comment_id)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_comment_reactions (
        id varchar(128) PRIMARY KEY,
        comment_id varchar(128) NOT NULL REFERENCES fulcrum_task_comments(id) ON DELETE CASCADE,
        user_id varchar(128) NOT NULL,
        emoji varchar(32) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_comment_reactions_unique_user_emoji
          UNIQUE (comment_id, user_id, emoji)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE fulcrum_task_watchers (
        id varchar(128) PRIMARY KEY,
        org_id varchar(128) NOT NULL REFERENCES fulcrum_workspaces(id) ON DELETE CASCADE,
        task_id varchar(128) NOT NULL REFERENCES fulcrum_tasks(id) ON DELETE CASCADE,
        user_id varchar(128) NOT NULL,
        source varchar(80) NOT NULL DEFAULT 'manual',
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_task_watchers_task_user_key UNIQUE (task_id, user_id)
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_task_watchers_org_task_idx ON fulcrum_task_watchers (org_id, task_id)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_task_templates (
        id varchar(128) PRIMARY KEY,
        org_id varchar(128) NOT NULL REFERENCES fulcrum_workspaces(id) ON DELETE CASCADE,
        project_id varchar(128) REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        name varchar(220) NOT NULL,
        description text,
        template_data jsonb NOT NULL DEFAULT '{}'::jsonb,
        is_default boolean NOT NULL DEFAULT false,
        created_by varchar(128) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_task_templates_org_project_idx ON fulcrum_task_templates (org_id, project_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_task_templates_org_default_idx ON fulcrum_task_templates (org_id, project_id, is_default)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_custom_field_defs (
        id varchar(128) PRIMARY KEY,
        org_id varchar(128) NOT NULL REFERENCES fulcrum_workspaces(id) ON DELETE CASCADE,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        entity_type varchar(80) NOT NULL DEFAULT 'task',
        name varchar(180) NOT NULL,
        slug varchar(180) NOT NULL,
        type varchar(80) NOT NULL,
        config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        required boolean NOT NULL DEFAULT false,
        archived boolean NOT NULL DEFAULT false,
        position int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_custom_field_defs_project_slug_key UNIQUE (project_id, slug)
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_custom_field_defs_org_project_idx ON fulcrum_custom_field_defs (org_id, project_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_custom_field_defs_project_position_idx ON fulcrum_custom_field_defs (project_id, position)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_field_dependency_rules (
        id varchar(128) PRIMARY KEY,
        org_id varchar(128) NOT NULL REFERENCES fulcrum_workspaces(id) ON DELETE CASCADE,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        source_field_id varchar(180) NOT NULL,
        source_value varchar(320) NOT NULL,
        target_field_id varchar(180) NOT NULL,
        action varchar(40) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_field_dependency_rules_org_project_idx ON fulcrum_field_dependency_rules (org_id, project_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_field_dependency_rules_project_source_idx ON fulcrum_field_dependency_rules (project_id, source_field_id)",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_field_dependency_rules");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_custom_field_defs");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_task_templates");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_task_watchers");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_comment_reactions");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_task_comments");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_notifications");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_intake_requests");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_saved_views");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_module_tasks");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_modules");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_cycle_tasks");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_cycles");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_task_label_assignments");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_task_labels");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_task_states");
  }
}
