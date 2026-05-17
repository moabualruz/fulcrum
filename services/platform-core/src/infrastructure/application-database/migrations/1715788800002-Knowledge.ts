import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Knowledge — creates knowledge/memory/docs tables:
 *   documents, doc_versions, doc_comments, doc_links, doc_templates,
 *   memories, memory_links, context_snapshots,
 *   saved_searches (saved_views alias), search_documents
 */
export class Knowledge1715788800002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // documents
    await queryRunner.query(`
      CREATE TABLE "documents" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"          uuid NOT NULL REFERENCES "orgs" ("id"),
        "parent_id"       uuid REFERENCES "documents" ("id") ON DELETE SET NULL,
        "project_id"      varchar,
        "scope"           varchar NOT NULL DEFAULT 'project',
        "doc_type"        varchar NOT NULL DEFAULT 'note',
        "frontmatter"     jsonb NOT NULL DEFAULT '{}',
        "body_md"         text NOT NULL DEFAULT '',
        "content_json"    jsonb NOT NULL DEFAULT '{}',
        "sort_position"   float8 NOT NULL DEFAULT 0,
        "archived"        boolean NOT NULL DEFAULT false,
        "external_id"     varchar,
        "embedding"       text,
        "updated_at"      timestamptz NOT NULL DEFAULT now(),
        "title"           varchar,
        "context_summary" jsonb
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_documents_org_updated" ON "documents" ("org_id", "updated_at")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "documents_id_org_unique" ON "documents" ("id", "org_id")`);
    await queryRunner.query(`CREATE INDEX "docs_org_project_scope" ON "documents" ("org_id", "project_id", "scope")`);
    await queryRunner.query(`CREATE INDEX "docs_org_doc_type" ON "documents" ("org_id", "doc_type")`);
    await queryRunner.query(`CREATE INDEX "docs_org_parent" ON "documents" ("org_id", "parent_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "docs_org_external_id" ON "documents" ("org_id", "external_id") WHERE "external_id" IS NOT NULL`);

    // doc_versions
    await queryRunner.query(`
      CREATE TABLE "doc_versions" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"       uuid NOT NULL REFERENCES "orgs" ("id"),
        "doc_id"       uuid NOT NULL REFERENCES "documents" ("id") ON DELETE CASCADE,
        "author_id"    uuid REFERENCES "users" ("id") ON DELETE SET NULL,
        "version_num"     integer NOT NULL,
        "snapshot"        jsonb,
        "delta"           jsonb,
        "body_md_snapshot" text,
        "yjs_state"       bytea,
        "restore_of"      uuid REFERENCES "doc_versions" ("id") ON DELETE SET NULL,
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "doc_versions_doc_version_unique" UNIQUE ("doc_id", "version_num")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "doc_versions_id_org_unique" ON "doc_versions" ("id", "org_id")`);
    await queryRunner.query(`CREATE INDEX "doc_versions_org_doc_version" ON "doc_versions" ("org_id", "doc_id", "version_num")`);
    await queryRunner.query(`CREATE INDEX "doc_versions_author" ON "doc_versions" ("author_id")`);

    // doc_comments
    await queryRunner.query(`
      CREATE TABLE "doc_comments" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"            uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "doc_id"            uuid NOT NULL REFERENCES "documents" ("id") ON DELETE CASCADE,
        "anchor_range"      jsonb,
        "author_id"         uuid REFERENCES "users" ("id") ON DELETE SET NULL,
        "body_md"           text NOT NULL,
        "parent_comment_id" uuid REFERENCES "doc_comments" ("id") ON DELETE CASCADE,
        "resolved"          boolean NOT NULL DEFAULT false,
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "updated_at"        timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "doc_comments_id_org_unique" ON "doc_comments" ("id", "org_id")`);
    await queryRunner.query(`CREATE INDEX "doc_comments_org_doc" ON "doc_comments" ("org_id", "doc_id")`);
    await queryRunner.query(`CREATE INDEX "doc_comments_author" ON "doc_comments" ("author_id")`);

    // doc_links
    await queryRunner.query(`
      CREATE TABLE "doc_links" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"      uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "from_doc_id" uuid NOT NULL REFERENCES "documents" ("id") ON DELETE CASCADE,
        "to_doc_id"   uuid REFERENCES "documents" ("id") ON DELETE SET NULL,
        "to_slug"     varchar NOT NULL,
        "link_kind"   varchar NOT NULL DEFAULT 'wikilink',
        "anchor"      varchar,
        "created_at"  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "doc_links_org_from" ON "doc_links" ("org_id", "from_doc_id")`);
    await queryRunner.query(`CREATE INDEX "doc_links_org_to" ON "doc_links" ("org_id", "to_doc_id")`);

    // doc_templates
    await queryRunner.query(`
      CREATE TABLE "doc_templates" (
        "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"               uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "project_id"           varchar,
        "doc_type"             varchar NOT NULL,
        "name"                 varchar NOT NULL,
        "frontmatter_template" jsonb NOT NULL DEFAULT '{}',
        "body_template"        text NOT NULL DEFAULT '',
        "is_default"           boolean NOT NULL DEFAULT false,
        "created_at"           timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "doc_templates_org_project_type_name_unique" UNIQUE ("org_id", "project_id", "doc_type", "name")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "doc_templates_org_global_type_name_unique" ON "doc_templates" ("org_id", "doc_type", "name") WHERE "project_id" IS NULL`);
    await queryRunner.query(`CREATE INDEX "doc_templates_org_project_type" ON "doc_templates" ("org_id", "project_id", "doc_type")`);

    // memories
    await queryRunner.query(`
      CREATE TABLE "memories" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"      uuid NOT NULL REFERENCES "orgs" ("id"),
        "project_id"  varchar,
        "global"      boolean NOT NULL DEFAULT false,
        "kind"        varchar NOT NULL DEFAULT 'note',
        "body"        text NOT NULL DEFAULT '',
        "tags"        text NOT NULL DEFAULT '',
        "importance"  varchar NOT NULL DEFAULT 'medium',
        "source"      varchar NOT NULL,
        "source_ref"  jsonb NOT NULL DEFAULT '{}',
        "created_at"  timestamptz NOT NULL DEFAULT now(),
        "updated_at"  timestamptz NOT NULL DEFAULT now(),
        "archived"    boolean NOT NULL DEFAULT false,
        "embedding"   text
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_memories_org_kind" ON "memories" ("org_id", "kind")`);
    await queryRunner.query(`CREATE INDEX "memories_org_project_importance" ON "memories" ("org_id", "project_id", "importance")`);
    await queryRunner.query(`CREATE INDEX "memories_org_kind" ON "memories" ("org_id", "kind")`);
    await queryRunner.query(`CREATE INDEX "memories_org_archived" ON "memories" ("org_id", "archived")`);
    await queryRunner.query(`CREATE INDEX "memories_org_global" ON "memories" ("org_id", "global")`);
    await queryRunner.query(`CREATE INDEX "memories_body_tsv" ON "memories" USING gin (to_tsvector('english', body))`);

    // memory_links
    await queryRunner.query(`
      CREATE TABLE "memory_links" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"      uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "memory_id"   uuid NOT NULL REFERENCES "memories" ("id") ON DELETE CASCADE,
        "target_kind" varchar NOT NULL,
        "target_id"   varchar NOT NULL,
        "created_at"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "memory_links_memory_target_dedup" UNIQUE ("memory_id", "target_kind", "target_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "memory_links_memory" ON "memory_links" ("org_id", "memory_id")`);
    await queryRunner.query(`CREATE INDEX "memory_links_target" ON "memory_links" ("org_id", "target_kind", "target_id")`);

    // context_snapshots
    await queryRunner.query(`
      CREATE TABLE "context_snapshots" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"      uuid NOT NULL REFERENCES "orgs" ("id") ON DELETE CASCADE,
        "run_id"      varchar,
        "task_id"     varchar,
        "bundle_blob" jsonb NOT NULL,
        "token_count" integer NOT NULL,
        "slice_sizes" jsonb NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "context_snapshots_run" ON "context_snapshots" ("org_id", "run_id")`);
    await queryRunner.query(`CREATE INDEX "context_snapshots_task" ON "context_snapshots" ("org_id", "task_id")`);

    // search_documents
    await queryRunner.query(`
      CREATE TABLE "search_documents" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "org_id"      uuid NOT NULL REFERENCES "orgs" ("id"),
        "entity_kind" varchar NOT NULL,
        "entity_id"   varchar NOT NULL,
        "embedding"   text,
        "title"       varchar,
        "body"        text,
        "labels"      text,
        "metadata"    jsonb,
        "updated_at"  timestamptz,
        "project_id"  varchar,
        "status"      varchar
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_search_documents_org_subject" ON "search_documents" ("org_id", "entity_kind", "entity_id")`);
    await queryRunner.query(`CREATE INDEX "search_documents_fts" ON "search_documents" USING gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "search_documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "context_snapshots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "memory_links"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "memories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doc_templates"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doc_links"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doc_comments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doc_versions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "documents"`);
  }
}
