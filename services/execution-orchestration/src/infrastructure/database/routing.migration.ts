import type { MigrationInterface, QueryRunner } from "typeorm";

export class Routing1778623200008 implements MigrationInterface {
  name = "Routing1778623200008";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE fulcrum_routing_rules (
        id varchar(128) PRIMARY KEY,
        org_id varchar(128) NOT NULL REFERENCES fulcrum_workspaces(id) ON DELETE CASCADE,
        project_id varchar(128) REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        name varchar(220) NOT NULL,
        conditions_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        action_agent varchar(160) NOT NULL,
        action_skill_set jsonb NOT NULL DEFAULT '[]'::jsonb,
        priority int NOT NULL DEFAULT 100,
        enabled boolean NOT NULL DEFAULT true,
        source varchar(80) NOT NULL DEFAULT 'manual',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_routing_rules_source_check CHECK (source IN ('manual', 'learned', 'imported'))
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_routing_rules_org_priority_idx ON fulcrum_routing_rules (org_id, priority)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_routing_rules_org_project_idx ON fulcrum_routing_rules (org_id, project_id)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_routing_drafts (
        id varchar(128) PRIMARY KEY,
        org_id varchar(128) NOT NULL REFERENCES fulcrum_workspaces(id) ON DELETE CASCADE,
        project_id varchar(128) REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        status varchar(80) NOT NULL DEFAULT 'review_needed',
        enabled boolean NOT NULL DEFAULT false,
        task_facts_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        no_match_reason text NOT NULL,
        proposed_conditions_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        proposed_actions_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        source varchar(80) NOT NULL DEFAULT 'no_match',
        confidence double precision NOT NULL DEFAULT 0,
        backend varchar(160),
        model varchar(160),
        matching_active_rule_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_routing_drafts_status_check CHECK (status IN ('review_needed', 'conflict', 'abstained', 'approved'))
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_routing_drafts_org_status_idx ON fulcrum_routing_drafts (org_id, status)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_routing_drafts_org_created_idx ON fulcrum_routing_drafts (org_id, created_at)",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_routing_drafts");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_routing_rules");
  }
}
