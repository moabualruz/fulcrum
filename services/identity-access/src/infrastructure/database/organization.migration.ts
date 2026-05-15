import type { MigrationInterface, QueryRunner } from "typeorm";

export class IdentityAccess1778623200009 implements MigrationInterface {
  name = "IdentityAccess1778623200009";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE fulcrum_organization_members (
        id varchar(128) PRIMARY KEY,
        org_id varchar(128) NOT NULL REFERENCES fulcrum_workspaces(id) ON DELETE CASCADE,
        user_id varchar(128) NOT NULL,
        role varchar(80) NOT NULL,
        joined_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_organization_members_org_user_key UNIQUE (org_id, user_id),
        CONSTRAINT fulcrum_organization_members_role_check CHECK (role IN ('owner', 'admin', 'member', 'guest'))
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_organization_members_org_role_idx ON fulcrum_organization_members (org_id, role)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_organization_members_user_idx ON fulcrum_organization_members (user_id)",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_organization_members");
  }
}
