import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds bridge-specific columns to the existing fulcrum_acp_sessions table:
 * org_id, cwd, mode_id, model_id, permission_mode.
 *
 * The base table was created by WorkflowSpine1778623200001.
 */
export class Migration20260516AcpSessionColumns1778623200002
  implements MigrationInterface
{
  name = "Migration20260516AcpSessionColumns1778623200002";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE fulcrum_acp_sessions ADD COLUMN IF NOT EXISTS org_id varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE fulcrum_acp_sessions ADD COLUMN IF NOT EXISTS cwd varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE fulcrum_acp_sessions ADD COLUMN IF NOT EXISTS mode_id varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE fulcrum_acp_sessions ADD COLUMN IF NOT EXISTS model_id varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE fulcrum_acp_sessions ADD COLUMN IF NOT EXISTS permission_mode varchar`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE fulcrum_acp_sessions DROP COLUMN IF EXISTS permission_mode`,
    );
    await queryRunner.query(
      `ALTER TABLE fulcrum_acp_sessions DROP COLUMN IF EXISTS model_id`,
    );
    await queryRunner.query(
      `ALTER TABLE fulcrum_acp_sessions DROP COLUMN IF EXISTS mode_id`,
    );
    await queryRunner.query(
      `ALTER TABLE fulcrum_acp_sessions DROP COLUMN IF EXISTS cwd`,
    );
    await queryRunner.query(
      `ALTER TABLE fulcrum_acp_sessions DROP COLUMN IF EXISTS org_id`,
    );
  }
}
