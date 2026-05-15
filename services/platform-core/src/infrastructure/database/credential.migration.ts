import type { MigrationInterface, QueryRunner } from "typeorm";

export class Credential1778623200010 implements MigrationInterface {
  name = "Credential1778623200010";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE fulcrum_credentials (
        id varchar(128) PRIMARY KEY,
        org_id varchar(128) NOT NULL REFERENCES fulcrum_workspaces(id) ON DELETE CASCADE,
        user_id varchar(128) NOT NULL,
        name varchar(255) NOT NULL,
        encrypted_value text NOT NULL,
        algo varchar(80) NOT NULL,
        kdf varchar(80) NOT NULL,
        provider varchar(80) NOT NULL DEFAULT 'local',
        archived boolean NOT NULL DEFAULT false,
        last_used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_credentials_org_user_name_key UNIQUE (org_id, user_id, name)
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_credentials_org_user_archived_idx ON fulcrum_credentials (org_id, user_id, archived)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_credentials_org_archived_idx ON fulcrum_credentials (org_id, archived)",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_credentials");
  }
}
