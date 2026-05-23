import type { MigrationInterface, QueryRunner } from "typeorm";

export class Migration20260519AcpSessionPauseResumeCheckpoints1778841600000
  implements MigrationInterface
{
  name = "Migration20260519AcpSessionPauseResumeCheckpoints1778841600000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE fulcrum_acp_sessions ALTER COLUMN id TYPE varchar(128) USING id::text`);
    await queryRunner.query(`ALTER TABLE fulcrum_acp_sessions ADD COLUMN IF NOT EXISTS paused_at timestamptz`);
    await queryRunner.query(`ALTER TABLE fulcrum_acp_sessions ADD COLUMN IF NOT EXISTS paused_reason varchar`);
    await queryRunner.query(`ALTER TABLE fulcrum_acp_sessions ADD COLUMN IF NOT EXISTS current_checkpoint_id varchar`);
    await queryRunner.query(`ALTER TABLE fulcrum_acp_sessions ADD COLUMN IF NOT EXISTS abort_reason varchar`);
    await queryRunner.query(`ALTER TABLE fulcrum_acp_sessions ADD COLUMN IF NOT EXISTS abort_note text`);
    await queryRunner.query(`ALTER TABLE fulcrum_acp_sessions ADD COLUMN IF NOT EXISTS artifacts_path varchar`);
    await queryRunner.query(`ALTER TABLE fulcrum_acp_sessions ADD COLUMN IF NOT EXISTS checkpoint_mode_override varchar`);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE fulcrum_session_checkpoint_kind AS ENUM ('git', 'file', 'message');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fulcrum_session_checkpoints (
        id varchar(128) PRIMARY KEY,
        session_id varchar(128) NOT NULL,
        kind fulcrum_session_checkpoint_kind NOT NULL,
        ref varchar(512) NOT NULL,
        turn_index integer NOT NULL,
        message_uuid varchar(128) NOT NULL,
        label varchar(240),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_fulcrum_session_checkpoints_session
          FOREIGN KEY (session_id) REFERENCES fulcrum_acp_sessions(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE fulcrum_acp_sessions
          ADD CONSTRAINT fk_fulcrum_acp_sessions_current_checkpoint
          FOREIGN KEY (current_checkpoint_id) REFERENCES fulcrum_session_checkpoints(id) ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE fulcrum_acp_sessions DROP CONSTRAINT IF EXISTS fk_fulcrum_acp_sessions_current_checkpoint`);
    await queryRunner.query(`DROP TABLE IF EXISTS fulcrum_session_checkpoints`);
    await queryRunner.query(`DROP TYPE IF EXISTS fulcrum_session_checkpoint_kind`);
    await queryRunner.query(`ALTER TABLE fulcrum_acp_sessions DROP COLUMN IF EXISTS checkpoint_mode_override`);
    await queryRunner.query(`ALTER TABLE fulcrum_acp_sessions DROP COLUMN IF EXISTS artifacts_path`);
    await queryRunner.query(`ALTER TABLE fulcrum_acp_sessions DROP COLUMN IF EXISTS abort_note`);
    await queryRunner.query(`ALTER TABLE fulcrum_acp_sessions DROP COLUMN IF EXISTS abort_reason`);
    await queryRunner.query(`ALTER TABLE fulcrum_acp_sessions DROP COLUMN IF EXISTS current_checkpoint_id`);
    await queryRunner.query(`ALTER TABLE fulcrum_acp_sessions DROP COLUMN IF EXISTS paused_reason`);
    await queryRunner.query(`ALTER TABLE fulcrum_acp_sessions DROP COLUMN IF EXISTS paused_at`);
  }
}
