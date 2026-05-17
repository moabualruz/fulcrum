import type { MigrationInterface, QueryRunner } from "typeorm";
import { Table, TableCheck, TableForeignKey, TableIndex, TableUnique } from "typeorm";

export class Invitation1778757000000 implements MigrationInterface {
  name = "Invitation1778757000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "fulcrum_invitations",
        columns: [
          { name: "id", type: "varchar", length: "128", isPrimary: true },
          { name: "org_id", type: "varchar", length: "128", isNullable: false },
          { name: "email", type: "varchar", length: "255", isNullable: false },
          { name: "role", type: "varchar", length: "80", isNullable: false },
          { name: "token_hash", type: "varchar", length: "128", isNullable: false },
          { name: "invited_by", type: "varchar", length: "128", isNullable: false },
          { name: "status", type: "varchar", length: "80", isNullable: false, default: "'pending'" },
          { name: "expires_at", type: "timestamptz", isNullable: false },
          { name: "accepted_at", type: "timestamptz", isNullable: true },
          { name: "revoked_at", type: "timestamptz", isNullable: true },
          { name: "created_at", type: "timestamptz", isNullable: false, default: "now()" },
          { name: "updated_at", type: "timestamptz", isNullable: false, default: "now()" },
        ],
      }),
      true,
    );
    await createUniqueIfMissing(queryRunner, "fulcrum_invitations", new TableUnique({
      name: "fulcrum_invitations_token_hash_key",
      columnNames: ["token_hash"],
    }));
    await createCheckIfMissing(queryRunner, "fulcrum_invitations", new TableCheck({
      name: "fulcrum_invitations_role_check",
      expression: "role in ('owner', 'admin', 'member', 'guest')",
    }));
    await createCheckIfMissing(queryRunner, "fulcrum_invitations", new TableCheck({
      name: "fulcrum_invitations_status_check",
      expression: "status in ('pending', 'accepted', 'revoked')",
    }));
    await createForeignKeyIfMissing(queryRunner, "fulcrum_invitations", new TableForeignKey({
      name: "fulcrum_invitations_org_fk",
      columnNames: ["org_id"],
      referencedTableName: "fulcrum_workspaces",
      referencedColumnNames: ["id"],
      onDelete: "CASCADE",
    }));
    await createIndexIfMissing(queryRunner, "fulcrum_invitations", new TableIndex({
      name: "fulcrum_invitations_org_email_idx",
      columnNames: ["org_id", "email"],
    }));
    await createIndexIfMissing(queryRunner, "fulcrum_invitations", new TableIndex({
      name: "fulcrum_invitations_org_status_idx",
      columnNames: ["org_id", "status"],
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("fulcrum_invitations", true);
  }
}

async function createUniqueIfMissing(
  queryRunner: QueryRunner,
  tableName: string,
  unique: TableUnique,
): Promise<void> {
  const table = await queryRunner.getTable(tableName);
  if (table?.uniques.some((candidate) => candidate.name === unique.name)) return;
  await queryRunner.createUniqueConstraint(tableName, unique);
}

async function createCheckIfMissing(
  queryRunner: QueryRunner,
  tableName: string,
  check: TableCheck,
): Promise<void> {
  const table = await queryRunner.getTable(tableName);
  if (table?.checks.some((candidate) => candidate.name === check.name)) return;
  await queryRunner.createCheckConstraint(tableName, check);
}

async function createForeignKeyIfMissing(
  queryRunner: QueryRunner,
  tableName: string,
  foreignKey: TableForeignKey,
): Promise<void> {
  const table = await queryRunner.getTable(tableName);
  if (table?.foreignKeys.some((candidate) => candidate.name === foreignKey.name)) return;
  await queryRunner.createForeignKey(tableName, foreignKey);
}

async function createIndexIfMissing(
  queryRunner: QueryRunner,
  tableName: string,
  index: TableIndex,
): Promise<void> {
  const table = await queryRunner.getTable(tableName);
  if (table?.indices.some((candidate) => candidate.name === index.name)) return;
  await queryRunner.createIndex(tableName, index);
}
