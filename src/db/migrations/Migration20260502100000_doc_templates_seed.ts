/**
 * Seed migration: Insert 9 org-default doc_templates rows for the local org.
 *
 * - org_id = 00000000-0000-0000-0000-000000000001 (well-known local org, D4)
 * - project_id = NULL  (org-wide defaults)
 * - is_default = true
 * - Idempotent: ON CONFLICT DO NOTHING against the partial unique index
 *   doc_templates_org_global_type_name_unique (org_id, doc_type, name) WHERE project_id IS NULL
 *
 * Body templates are plain markdown (not TipTap JSON).
 * Frontmatter keys match the Zod schemas in src/docs/frontmatter-schemas.ts.
 *
 * C6: addSql() DML inside Migration.up() is the sanctioned escape hatch.
 * A3: down() removes only these seed rows (non-lossy reversal).
 */

import { Migration } from "@mikro-orm/migrations";
import { TEMPLATE_SEEDS } from "../../docs/template-seeds.ts";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export class Migration20260502100000_doc_templates_seed extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `INSERT INTO "orgs" ("id", "name", "slug") ` +
        `VALUES ('${DEFAULT_ORG_ID}', 'Local', 'local') ` +
        `ON CONFLICT DO NOTHING`,
    );

    for (const seed of TEMPLATE_SEEDS) {
      const ft = JSON.stringify(seed.frontmatterTemplate).replace(/'/g, "''");
      const body = seed.bodyTemplate.replace(/'/g, "''");
      const name = seed.name.replace(/'/g, "''");
      const docType = seed.docType;

      this.addSql(
        `INSERT INTO "doc_templates" ` +
          `("org_id", "project_id", "doc_type", "name", "frontmatter_template", "body_template", "is_default") ` +
          `VALUES ` +
          `('${DEFAULT_ORG_ID}', NULL, '${docType}', '${name}', '${ft}'::jsonb, '${body}', true) ` +
          `ON CONFLICT DO NOTHING`,
      );
    }
  }

  override async down(): Promise<void> {
    const typeList = TEMPLATE_SEEDS.map((s) => `'${s.docType}'`).join(", ");
    const nameList = TEMPLATE_SEEDS.map((s) => `'${s.name.replace(/'/g, "''")}'`).join(", ");
    this.addSql(
      `DELETE FROM "doc_templates" ` +
        `WHERE "org_id" = '${DEFAULT_ORG_ID}' ` +
        `AND "project_id" IS NULL ` +
        `AND "is_default" = true ` +
        `AND "doc_type" IN (${typeList}) ` +
        `AND "name" IN (${nameList})`,
    );
  }
}
