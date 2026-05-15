/**
 * TDD — Pillar 7 docs schema foundation.
 *
 * Verifies Document additive columns, docs-domain related entities, enum
 * constraints, org-scoped composite indexes, idempotent MikroORM migrations,
 * and required FK deletion behavior.
 */

import { afterAll, describe, expect, it } from "bun:test";
import type { MigrationObject } from "@mikro-orm/core";
import type { MikroORM, Options } from "@mikro-orm/postgresql";
import { MikroORM as MikroORMRuntime, ReferenceKind } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { PGlite } from "@electric-sql/pglite";

import { createOrmConfig } from "@platform-core/infrastructure/application-database/mikro-orm.config.ts";
import { DEFAULT_ORG_ID, SeedService } from "@platform-core/infrastructure/application-database/seed.ts";
import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { User } from "@platform-core/infrastructure/application-database/entities/auth/User.ts";
import {
  Document,
  Doc,
  DocLink,
  DocVersion,
  DocComment,
  DocTemplate,
  DocTypeEnum,
  ScopeEnum,
  LinkKindEnum,
} from "@platform-core/infrastructure/application-database/entities/docs/index.ts";
import { Migration20260501104413_auth } from "@platform-core/infrastructure/application-database/migrations/Migration20260501104413_auth.ts";
import { Migration20260501120537_events_org_id_backfill } from "@platform-core/infrastructure/application-database/migrations/Migration20260501120537_events_org_id_backfill.ts";
import { Migration20260501120538_events_org_id_notnull } from "@platform-core/infrastructure/application-database/migrations/Migration20260501120538_events_org_id_notnull.ts";
import { Migration20260501130000_composite_indexes } from "@platform-core/infrastructure/application-database/migrations/Migration20260501130000_composite_indexes.ts";
import { Migration20260501130100_flag_stubs } from "@platform-core/infrastructure/application-database/migrations/Migration20260501130100_flag_stubs.ts";
import { Migration20260501140000_schema_migration_ledger } from "@platform-core/infrastructure/application-database/migrations/Migration20260501140000_schema_migration_ledger.ts";
import { Migration20260501150000_account_verification } from "@platform-core/infrastructure/application-database/migrations/Migration20260501150000_account_verification.ts";
import { Migration20260502000001_orchestration_workflow_definitions } from "@platform-core/infrastructure/application-database/migrations/Migration20260502000001_orchestration_workflow_definitions.ts";
import { Migration20260502011859_cross_cutting_platform } from "@platform-core/infrastructure/application-database/migrations/Migration20260502011859_cross_cutting_platform.ts";
import { Migration20260502030300_agent_runs_symphony_columns } from "@platform-core/infrastructure/application-database/migrations/Migration20260502030300_agent_runs_symphony_columns.ts";
import { Migration20260502070100_docs_document_columns } from "@platform-core/infrastructure/application-database/migrations/Migration20260502070100_docs_document_columns.ts";
import { Migration20260502070200_docs_related_tables } from "@platform-core/infrastructure/application-database/migrations/Migration20260502070200_docs_related_tables.ts";

const DOC_COLUMNS = [
  "parent_id",
  "project_id",
  "scope",
  "doc_type",
  "frontmatter",
  "body_md",
  "content_json",
  "sort_position",
  "archived",
  "external_id",
] as const;

const DOC_INDEXES = [
  "docs_org_project_scope",
  "docs_org_doc_type",
  "docs_org_parent",
  "docs_org_external_id",
] as const;

const RELATED_TABLES = [
  "doc_links",
  "doc_versions",
  "doc_comments",
  "doc_templates",
] as const;

const RELATED_INDEXES = [
  "doc_links_org_from",
  "doc_links_org_to",
  "doc_versions_author",
  "doc_versions_org_doc_version",
  "doc_comments_author",
  "doc_comments_org_doc",
  "doc_templates_org_project_type",
] as const;

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

interface BlankOrm {
  orm: MikroORM;
  pglite: PGlite;
  close: () => Promise<void>;
}

function migrationsList(): MigrationObject[] {
  return [
    { name: "Migration20260501104413_auth", class: Migration20260501104413_auth },
    {
      name: "Migration20260501120537_events_org_id_backfill",
      class: Migration20260501120537_events_org_id_backfill,
    },
    {
      name: "Migration20260501120538_events_org_id_notnull",
      class: Migration20260501120538_events_org_id_notnull,
    },
    {
      name: "Migration20260501130000_composite_indexes",
      class: Migration20260501130000_composite_indexes,
    },
    {
      name: "Migration20260501130100_flag_stubs",
      class: Migration20260501130100_flag_stubs,
    },
    {
      name: "Migration20260501140000_schema_migration_ledger",
      class: Migration20260501140000_schema_migration_ledger,
    },
    {
      name: "Migration20260501150000_account_verification",
      class: Migration20260501150000_account_verification,
    },
    {
      name: "Migration20260502000001_orchestration_workflow_definitions",
      class: Migration20260502000001_orchestration_workflow_definitions,
    },
    {
      name: "Migration20260502011859_cross_cutting_platform",
      class: Migration20260502011859_cross_cutting_platform,
    },
    {
      name: "Migration20260502030300_agent_runs_symphony_columns",
      class: Migration20260502030300_agent_runs_symphony_columns,
    },
    {
      name: "Migration20260502070100_docs_document_columns",
      class: Migration20260502070100_docs_document_columns,
    },
    {
      name: "Migration20260502070200_docs_related_tables",
      class: Migration20260502070200_docs_related_tables,
    },
  ];
}

async function buildBlankOrm(): Promise<BlankOrm> {
  const pglite = new PGlite();
  const config = createOrmConfig({ pglite });

  config.migrations = {
    ...((config.migrations ?? {}) as NonNullable<Options["migrations"]>),
    transactional: false,
    allOrNothing: false,
    snapshot: false,
    migrationsList: migrationsList(),
  };
  config.extensions = [Migrator];

  const orm = await MikroORMRuntime.init(config);

  return {
    orm,
    pglite,
    close: async () => {
      await orm.close(true);
      await (pglite as { close?: () => Promise<void> }).close?.();
    },
  };
}

async function buildMigratedOrm(): Promise<BlankOrm> {
  const db = await buildBlankOrm();
  await db.orm.migrator.up();
  await new SeedService(db.orm.em).run();
  return db;
}

async function rows<T extends object>(
  orm: MikroORM,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await orm.em.getConnection().execute(sql, params)) as T[];
}

function quoteList(values: readonly string[]): string {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ");
}

async function seedUser(orm: MikroORM): Promise<User> {
  const em = orm.em.fork();
  const user = em.create(User, {
    orgId: DEFAULT_ORG_ID,
    email: `docs-${crypto.randomUUID()}@local`,
    role: "member",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await em.flush();
  return user;
}

describe("Docs Zod enum exports", () => {
  it("exports doc type, scope, and link kind enums", () => {
    expect(DocTypeEnum.options).toEqual([
      "spec",
      "adr",
      "wiki",
      "runbook",
      "meeting",
      "postmortem",
      "rfc",
      "note",
      "scratch",
    ]);
    expect(ScopeEnum.options).toEqual(["project", "global"]);
    expect(LinkKindEnum.options).toEqual([
      "wikilink",
      "task_ref",
      "run_ref",
      "mention",
    ]);
  });
});

describe("Document entity metadata", () => {
  let db: BlankOrm | undefined;

  afterAll(async () => {
    await db?.close();
  });

  it("declares Pillar 7 columns, checks, and docs_org_* indexes", async () => {
    db = await buildMigratedOrm();
    const meta = db.orm.getMetadata().get(Document);
    expect(Doc).toBe(Document);

    expect(meta.properties["parent"]?.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(meta.properties["parent"]?.nullable).toBe(true);
    expect(meta.properties["projectId"]?.fieldNames).toContain("project_id");
    expect(meta.properties["scope"]?.fieldNames).toContain("scope");
    expect(meta.properties["docType"]?.fieldNames).toContain("doc_type");
    expect(String(meta.properties["frontmatter"]?.type)).toMatch(/json/i);
    expect(meta.properties["bodyMd"]?.type).toBe("text");
    expect(String(meta.properties["contentJson"]?.type)).toMatch(/json/i);
    expect(meta.properties["sortPosition"]?.type).toBe("float");
    expect(meta.properties["archived"]?.type).toBe("boolean");
    expect(meta.properties["externalId"]?.nullable).toBe(true);

    for (const indexName of DOC_INDEXES) {
      expect(meta.indexes?.some((index) => index.name === indexName)).toBe(true);
    }
  });
});

describe("Docs schema migrations", () => {
  it("apply once, re-run as no-op, and expose required tables/indexes", async () => {
    const db = await buildBlankOrm();
    try {
      await db.orm.migrator.up();

      const documentColumns = await rows<{ column_name: string }>(
        db.orm,
        `
          select column_name
          from information_schema.columns
          where table_name = 'documents'
            and column_name in (${quoteList(DOC_COLUMNS)})
        `,
      );
      expect(documentColumns.map((row) => row.column_name).sort()).toEqual(
        [...DOC_COLUMNS].sort(),
      );

      const docIndexes = await rows<{ indexname: string; indexdef: string }>(
        db.orm,
        `
          select indexname, indexdef
          from pg_indexes
          where tablename = 'documents'
            and indexname in (${quoteList(DOC_INDEXES)})
        `,
      );
      expect(docIndexes.map((row) => row.indexname).sort()).toEqual(
        [...DOC_INDEXES].sort(),
      );
      expect(
        docIndexes.find((row) => row.indexname === "docs_org_external_id")?.indexdef,
      ).toContain("WHERE (external_id IS NOT NULL)");

      const relatedTables = await rows<{ table_name: string }>(
        db.orm,
        `
          select table_name
          from information_schema.tables
          where table_name in (${quoteList(RELATED_TABLES)})
        `,
      );
      expect(relatedTables.map((row) => row.table_name).sort()).toEqual(
        [...RELATED_TABLES].sort(),
      );

      const relatedIndexes = await rows<{ indexname: string }>(
        db.orm,
        `
          select indexname
          from pg_indexes
          where indexname in (${quoteList(RELATED_INDEXES)})
        `,
      );
      expect(relatedIndexes.map((row) => row.indexname).sort()).toEqual(
        [...RELATED_INDEXES].sort(),
      );

      const pending = await db.orm.migrator.getPending();
      expect(pending).toHaveLength(0);
      const second = await db.orm.migrator.up();
      expect(second).toHaveLength(0);
    } finally {
      await db.close();
    }
  });
});

describe("Docs related entity metadata", () => {
  let db: BlankOrm | undefined;

  afterAll(async () => {
    await db?.close();
  });

  it("registers DocLink, DocVersion, DocComment, and DocTemplate with nullable fields", async () => {
    db = await buildMigratedOrm();

    const link = db.orm.getMetadata().get(DocLink);
    expect(link.tableName).toBe("doc_links");
    expect(link.properties["fromDoc"]?.nullable).not.toBe(true);
    expect(link.properties["toDoc"]?.nullable).toBe(true);
    expect(link.properties["anchor"]?.nullable).toBe(true);
    expect(link.indexes?.some((index) => index.name === "doc_links_org_from"))
      .toBe(true);

    const version = db.orm.getMetadata().get(DocVersion);
    expect(version.tableName).toBe("doc_versions");
    expect(version.properties["snapshot"]?.nullable).toBe(true);
    expect(version.properties["delta"]?.nullable).toBe(true);
    expect(version.properties["bodyMdSnapshot"]?.nullable).toBe(true);
    expect(version.properties["author"]?.nullable).toBe(true);
    expect(version.properties["restoreOf"]?.nullable).toBe(true);
    expect(version.uniques?.some((unique) => unique.name === "doc_versions_doc_version_unique"))
      .toBe(true);

    const comment = db.orm.getMetadata().get(DocComment);
    expect(comment.tableName).toBe("doc_comments");
    expect(comment.properties["anchorRange"]?.nullable).toBe(true);
    expect(comment.properties["author"]?.nullable).toBe(true);
    expect(comment.properties["parentComment"]?.nullable).toBe(true);
    expect(comment.properties["resolved"]?.type).toBe("boolean");

    const template = db.orm.getMetadata().get(DocTemplate);
    expect(template.tableName).toBe("doc_templates");
    expect(template.properties["projectId"]?.nullable).toBe(true);
    expect(String(template.properties["frontmatterTemplate"]?.type)).toMatch(/json/i);
    expect(template.uniques?.some((unique) =>
      unique.name === "doc_templates_org_project_type_name_unique"
    )).toBe(true);
  });
});

describe("Docs enum constraints", () => {
  it("rejects invalid document scope, document type, and link kind", async () => {
    const db = await buildMigratedOrm();
    try {
      const em = db.orm.em.fork();
      const org = em.getReference(Org, DEFAULT_ORG_ID);

      await expect(
        em.getRepository(Document).insert({
          org,
          scope: "workspace",
        } as never),
      ).rejects.toThrow("documents_scope_check");

      await expect(
        em.getRepository(Document).insert({
          org,
          docType: "guide",
        } as never),
      ).rejects.toThrow("documents_doc_type_check");

      const doc = em.create(Document, { org, projectId: PROJECT_ID });
      em.persist(doc);
      await em.flush();

      await expect(
        em.getRepository(DocLink).insert({
          org,
          fromDoc: doc,
          toSlug: "target",
          linkKind: "xref",
        } as never),
      ).rejects.toThrow("doc_links_link_kind_check");
    } finally {
      await db.close();
    }
  });
});

describe("Docs FK deletion behavior", () => {
  it("sets Document.parent to null when parent document is deleted", async () => {
    const db = await buildMigratedOrm();
    try {
      const em = db.orm.em.fork();
      const org = em.getReference(Org, DEFAULT_ORG_ID);
      const parent = em.create(Document, { org, projectId: PROJECT_ID });
      const child = em.create(Document, {
        org,
        projectId: PROJECT_ID,
        parent,
      });
      em.persist([parent, child]);
      await em.flush();

      em.remove(parent);
      await em.flush();
      em.clear();

      const [found] = await rows<{ parent_id: string | null }>(
        db.orm,
        `select parent_id from "documents" where "id" = ?`,
        [child.id],
      );
      expect(found?.parent_id).toBeNull();
    } finally {
      await db.close();
    }
  });

  it("cascades outbound DocLink rows when fromDoc is deleted", async () => {
    const db = await buildMigratedOrm();
    try {
      const em = db.orm.em.fork();
      const org = em.getReference(Org, DEFAULT_ORG_ID);
      const from = em.create(Document, { org, projectId: PROJECT_ID });
      const to = em.create(Document, { org, projectId: PROJECT_ID });
      const link = em.create(DocLink, {
        org,
        fromDoc: from,
        toDoc: to,
        toSlug: "target-doc",
      });
      em.persist([from, to, link]);
      await em.flush();

      em.remove(from);
      await em.flush();
      em.clear();

      expect(await em.count(DocLink, { fromDoc: from.id } as never)).toBe(0);
    } finally {
      await db.close();
    }
  });

  it("cascades DocComment replies when thread root is deleted", async () => {
    const db = await buildMigratedOrm();
    try {
      const author = await seedUser(db.orm);
      const em = db.orm.em.fork();
      const org = em.getReference(Org, DEFAULT_ORG_ID);
      const doc = em.create(Document, { org, projectId: PROJECT_ID });
      const root = em.create(DocComment, {
        org,
        doc,
        author: em.getReference(User, author.id),
        bodyMd: "Root",
      });
      const reply = em.create(DocComment, {
        org,
        doc,
        author: em.getReference(User, author.id),
        parentComment: root,
        bodyMd: "Reply",
      });
      em.persist([doc, root, reply]);
      await em.flush();

      em.remove(root);
      await em.flush();
      em.clear();

      expect(await em.count(DocComment, { id: reply.id })).toBe(0);
    } finally {
      await db.close();
    }
  });

  it("preserves authored docs rows when user is deleted", async () => {
    const db = await buildMigratedOrm();
    try {
      const author = await seedUser(db.orm);
      const em = db.orm.em.fork();
      const org = em.getReference(Org, DEFAULT_ORG_ID);
      const doc = em.create(Document, { org, projectId: PROJECT_ID });
      const version = em.create(DocVersion, {
        org,
        doc,
        versionNum: 1,
        author: em.getReference(User, author.id),
      });
      const comment = em.create(DocComment, {
        org,
        doc,
        author: em.getReference(User, author.id),
        bodyMd: "Comment",
      });
      em.persist([doc, version, comment]);
      await em.flush();

      await rows(db.orm, `delete from "users" where "id" = ?`, [author.id]);

      const [savedVersion] = await rows<{ author_id: string | null }>(
        db.orm,
        `select author_id from "doc_versions" where "id" = ?`,
        [version.id],
      );
      const [savedComment] = await rows<{ author_id: string | null }>(
        db.orm,
        `select author_id from "doc_comments" where "id" = ?`,
        [comment.id],
      );

      expect(savedVersion?.author_id).toBeNull();
      expect(savedComment?.author_id).toBeNull();
    } finally {
      await db.close();
    }
  });

  it("rejects cross-org Document.parent references", async () => {
    const db = await buildMigratedOrm();
    try {
      const em = db.orm.em.fork();
      const now = new Date();
      const otherOrg = em.create(Org, {
        name: "Docs Other Org",
        slug: `docs-other-${crypto.randomUUID()}`,
        createdAt: now,
        updatedAt: now,
      });
      const parent = em.create(Document, { org: otherOrg, projectId: PROJECT_ID });
      em.persist([otherOrg, parent]);
      await em.flush();

      await expect(
        rows(
          db.orm,
          `insert into "documents" ("org_id", "parent_id", "project_id") values (?, ?, ?)`,
          [DEFAULT_ORG_ID, parent.id, PROJECT_ID],
        ),
      ).rejects.toThrow("documents_parent_org_foreign");
    } finally {
      await db.close();
    }
  });

  it("rejects cross-org DocLink, DocVersion, and DocComment document references", async () => {
    const db = await buildMigratedOrm();
    try {
      const em = db.orm.em.fork();
      const now = new Date();
      const otherOrg = em.create(Org, {
        name: "Docs Related Other Org",
        slug: `docs-related-other-${crypto.randomUUID()}`,
        createdAt: now,
        updatedAt: now,
      });
      const localDoc = em.create(Document, {
        org: em.getReference(Org, DEFAULT_ORG_ID),
        projectId: PROJECT_ID,
      });
      const otherDoc = em.create(Document, { org: otherOrg, projectId: PROJECT_ID });
      em.persist([otherOrg, localDoc, otherDoc]);
      await em.flush();

      await expect(
        rows(
          db.orm,
          `insert into "doc_links" ("org_id", "from_doc_id", "to_slug") values (?, ?, ?)`,
          [DEFAULT_ORG_ID, otherDoc.id, "other"],
        ),
      ).rejects.toThrow("doc_links_from_doc_org_foreign");
      await expect(
        rows(
          db.orm,
          `insert into "doc_links" ("org_id", "from_doc_id", "to_doc_id", "to_slug") values (?, ?, ?, ?)`,
          [DEFAULT_ORG_ID, localDoc.id, otherDoc.id, "other"],
        ),
      ).rejects.toThrow("doc_links_to_doc_org_foreign");
      await expect(
        rows(
          db.orm,
          `insert into "doc_versions" ("org_id", "doc_id", "version_num") values (?, ?, ?)`,
          [DEFAULT_ORG_ID, otherDoc.id, 1],
        ),
      ).rejects.toThrow("doc_versions_doc_org_foreign");
      await expect(
        rows(
          db.orm,
          `insert into "doc_comments" ("org_id", "doc_id", "body_md") values (?, ?, ?)`,
          [DEFAULT_ORG_ID, otherDoc.id, "wrong tenant"],
        ),
      ).rejects.toThrow("doc_comments_doc_org_foreign");
    } finally {
      await db.close();
    }
  });

  it("rejects cross-org doc author and comment-parent references", async () => {
    const db = await buildMigratedOrm();
    try {
      const otherAuthor = await seedUser(db.orm);
      const em = db.orm.em.fork();
      const now = new Date();
      const otherOrgId = crypto.randomUUID();
      const otherOrg = em.create(Org, {
        id: otherOrgId,
        name: "Docs Author Other Org",
        slug: `docs-author-other-${crypto.randomUUID()}`,
        createdAt: now,
        updatedAt: now,
      });
      em.assign(em.getReference(User, otherAuthor.id), { orgId: otherOrgId });
      const localDoc = em.create(Document, {
        org: em.getReference(Org, DEFAULT_ORG_ID),
        projectId: PROJECT_ID,
      });
      const otherDoc = em.create(Document, { org: otherOrg, projectId: PROJECT_ID });
      const otherComment = em.create(DocComment, {
        org: otherOrg,
        doc: otherDoc,
        bodyMd: "Other org",
      });
      em.persist([otherOrg, localDoc, otherDoc, otherComment]);
      await em.flush();

      await expect(
        rows(
          db.orm,
          `insert into "doc_versions" ("org_id", "doc_id", "version_num", "author_id") values (?, ?, ?, ?)`,
          [DEFAULT_ORG_ID, localDoc.id, 1, otherAuthor.id],
        ),
      ).rejects.toThrow("doc_versions_author_org_foreign");
      await expect(
        rows(
          db.orm,
          `insert into "doc_comments" ("org_id", "doc_id", "author_id", "body_md") values (?, ?, ?, ?)`,
          [DEFAULT_ORG_ID, localDoc.id, otherAuthor.id, "wrong author"],
        ),
      ).rejects.toThrow("doc_comments_author_org_foreign");
      await expect(
        rows(
          db.orm,
          `insert into "doc_comments" ("org_id", "doc_id", "parent_comment_id", "body_md") values (?, ?, ?, ?)`,
          [DEFAULT_ORG_ID, localDoc.id, otherComment.id, "wrong parent"],
        ),
      ).rejects.toThrow("doc_comments_parent_org_foreign");
    } finally {
      await db.close();
    }
  });
});

describe("Docs org-scoped index plan", () => {
  it("uses docs_org_project_scope for org/project/scope query", async () => {
    const db = await buildMigratedOrm();
    try {
      const em = db.orm.em.fork();
      const org = em.getReference(Org, DEFAULT_ORG_ID);
      const docs = Array.from({ length: 40 }, (_, index) =>
        em.create(Document, {
          org,
          projectId:
            index % 2 === 0
              ? PROJECT_ID
              : "22222222-2222-2222-2222-222222222222",
          scope: index % 3 === 0 ? "global" : "project",
        }),
      );
      em.persist(docs);
      await em.flush();
      await db.orm.em.getConnection().execute(`analyze "documents"`);

      await db.orm.em.getConnection().execute(`set enable_seqscan = off`);

      const planRows = await rows<{ "QUERY PLAN": string }>(
        db.orm,
        `
          explain select *
          from "documents"
          where "org_id" = '${DEFAULT_ORG_ID}'
            and "project_id" = '${PROJECT_ID}'
            and "scope" = 'project'
          order by "org_id", "project_id", "scope"
        `,
      );
      const planText = planRows.map((row) => row["QUERY PLAN"] ?? "").join("\n");

      expect(planText).toContain("docs_org_project_scope");
      expect(planText).not.toMatch(/Seq Scan/i);
    } finally {
      await db.close();
    }
  });
});
