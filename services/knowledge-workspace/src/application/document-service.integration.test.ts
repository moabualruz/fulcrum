import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { User } from "@identity-access/infrastructure/database/entities/auth/User.ts";
import { DocComment } from "@knowledge-workspace/infrastructure/database/entities/docs/DocComment.ts";
import { Document } from "@knowledge-workspace/infrastructure/database/entities/docs/Document.ts";
import { DocLink } from "@knowledge-workspace/infrastructure/database/entities/docs/DocLink.ts";
import { DocumentService } from "@knowledge-workspace/application/document-service.ts";
import { AppForbiddenError, AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";

const USER_ID = "00000000-0000-0000-0000-000000000010";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

async function ensureUser(
  em: TestOrm["em"],
  id = USER_ID,
  role: "owner" | "admin" | "member" | "guest" = "member",
): Promise<void> {
  const existing = await em.findOne(User, { where: { id } });
  if (existing) {
    existing.role = role;
    return;
  }
  await em.save(em.create(User, {
    id,
    orgId: DEFAULT_ORG_ID,
    email: `${id.slice(-8)}@local.test`,
    name: `User ${id.slice(-4)}`,
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never));
}

async function createProject(em: TestOrm["em"], name = "DocumentService class project"): Promise<string> {
  const id = randomUUID();
  await em.getConnection().execute(
    `INSERT INTO projects (id, org_id, slug, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, now(), now())`,
    [id, DEFAULT_ORG_ID, `doc-service-class-${id.slice(0, 8)}`, name],
  );
  return id;
}

function wikilink(slug: string): Record<string, unknown> {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "wikilink", attrs: { slug } }] }],
  };
}

describe("DocumentService class with real persistence", () => {
  test("creates parent and child docs, filters lists, updates body/content, and deletes softly/hard", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    await ensureUser(em);
    const service = new DocumentService(em);
    const ctx = { orgId: DEFAULT_ORG_ID, userId: USER_ID, em };
    const projectId = await createProject(em);

    const parent = await service.create(ctx, {
      title: "Service Parent",
      docType: "wiki",
      scope: "project",
      bodyMd: "Parent body",
      links: [
        { kind: "task", id: "task-1" },
        { targetKind: "agent_run", targetId: "run-1" },
        { targetKind: "other", targetId: "mention-1" },
        { kind: "ignored-without-id" },
      ],
    });
    const child = await service.create(ctx, {
      title: "Service Child",
      parentId: parent.id,
      docType: "note",
      scope: "global",
      bodyMd: "Child body",
      sortPosition: 5,
    });

    expect(await service.get(DEFAULT_ORG_ID, { id: parent.id })).toMatchObject({ id: parent.id, title: "Service Parent" });
    expect(await service.get(DEFAULT_ORG_ID, { slug: child.slug })).toMatchObject({
      id: child.id,
      parentId: parent.id,
      scope: "global",
    });
    expect((await service.list(DEFAULT_ORG_ID, { parentId: parent.id })).map((doc) => doc.id)).toEqual([child.id]);
    expect((await service.list(DEFAULT_ORG_ID, { scope: "global", docType: "note" })).map((doc) => doc.id)).toEqual([child.id]);

    const linkRows = await em.find(DocLink, { fromDoc: parent.id } as never, { orderBy: { toSlug: "ASC" } });
    expect(linkRows.map((link) => [link.toSlug, link.linkKind])).toEqual([
      ["agent_run:run-1", "run_ref"],
      ["other:mention-1", "mention"],
      ["task:task-1", "task_ref"],
    ]);

    const updated = await service.update(ctx, {
      id: child.id,
      title: "Service Child v2",
      parentId: null,
      projectId,
      docType: "adr",
      scope: "project",
      bodyMd: "Updated child",
      archived: false,
    });
    expect(updated).toMatchObject({
      id: child.id,
      title: "Service Child v2",
      parentId: null,
      projectId,
      docType: "adr",
      bodyMd: "Updated child",
    });

    const archived = await service.delete(ctx, child.id);
    expect(archived).toMatchObject({ id: child.id, archived: true });
    expect(await service.delete(ctx, child.id, true)).toEqual({ deleted: true });
    await expect(service.get(DEFAULT_ORG_ID, { id: child.id })).rejects.toBeInstanceOf(AppNotFoundError);
    await expect(service.create(ctx, { title: "Bad child", parentId: child.id }))
      .rejects.toBeInstanceOf(AppNotFoundError);
    expect(await service.update(ctx, { id: randomUUID(), title: "nope" })).toBeNull();
    expect(await service.delete(ctx, randomUUID())).toBeNull();
  });

  test("creates comment threads, sorts by anchor, resolves roots, updates/deletes with author/admin checks", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    await ensureUser(em, USER_ID, "member");
    const adminId = "00000000-0000-0000-0000-000000000011";
    await ensureUser(em, adminId, "admin");
    const service = new DocumentService(em);
    const ctx = { orgId: DEFAULT_ORG_ID, userId: USER_ID, em };
    const adminCtx = { orgId: DEFAULT_ORG_ID, userId: adminId, em };
    const doc = await service.create(ctx, { title: "Commented doc", bodyMd: "Comment target" });

    const late = await service.createComment(ctx, {
      docId: doc.id,
      anchorRange: { from: 20, to: 25 },
      bodyMd: "Late thread",
    });
    const early = await service.createComment(ctx, {
      docId: doc.id,
      anchorRange: { from: 1, to: 5 },
      bodyMd: "Early thread",
    });
    const reply = await service.createComment(ctx, {
      docId: doc.id,
      parentCommentId: early.id,
      bodyMd: "Early reply",
    });

    expect(reply.parentCommentId).toBe(early.id);
    expect((await service.listComments(ctx, doc.id)).map((comment) => comment.id)).toEqual([early.id, late.id]);
    expect((await service.listComments(ctx, doc.id))[0]!.replies.map((item) => item.id)).toEqual([reply.id]);

    expect(await service.updateComment(ctx, early.id, "Updated early")).toMatchObject({ bodyMd: "Updated early" });
    expect(await service.resolveComment(ctx, early.id, true)).toMatchObject({ id: early.id, resolved: true });
    await expect(service.resolveComment(ctx, reply.id, true)).rejects.toBeInstanceOf(AppValidationError);

    const stranger = { orgId: DEFAULT_ORG_ID, userId: randomUUID(), em };
    await expect(service.updateComment(stranger, early.id, "not allowed")).rejects.toBeInstanceOf(AppForbiddenError);
    await expect(service.deleteComment(stranger, late.id)).rejects.toBeInstanceOf(AppForbiddenError);
    expect(await service.deleteComment(adminCtx, late.id)).toEqual({ deleted: true });
    expect(await em.findOne(DocComment, { where: { id: late.id } })).toBeNull();
    expect(await service.deleteComment(ctx, randomUUID())).toBeNull();
    expect(await service.updateComment(ctx, randomUUID(), "none")).toBeNull();
    expect(await service.resolveComment(ctx, randomUUID(), true)).toBeNull();
    await expect(service.createComment(ctx, { docId: randomUUID(), bodyMd: "no doc" }))
      .rejects.toBeInstanceOf(AppNotFoundError);
    await expect(service.createComment(ctx, { docId: doc.id, parentCommentId: randomUUID(), bodyMd: "no parent" }))
      .rejects.toBeInstanceOf(AppNotFoundError);
  });

  test("lists, diffs, restores versions and reports forward/back links from wikilinks", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    await ensureUser(em);
    const service = new DocumentService(em);
    const ctx = { orgId: DEFAULT_ORG_ID, userId: USER_ID, em };

    const target = await service.create(ctx, { title: "Target Link", bodyMd: "Target" });
    const source = await service.create(ctx, { title: "Source Link", bodyMd: "Source v1" });
    await service.update(ctx, {
      id: source.id,
      bodyMd: "Source v2",
      contentJson: wikilink(target.slug),
    });

    const versions = await service.listVersions(ctx, source.id);
    expect(versions.length).toBeGreaterThanOrEqual(2);
    const versionOne = await service.getVersion(ctx, source.id, 1);
    expect(versionOne).toMatchObject({ versionNum: 1, authorId: USER_ID });

    const diff = await service.diffVersions(ctx, source.id, 1, 2);
    expect(diff.html).toContain("Source");

    const restored = await service.restoreVersion(ctx, source.id, 1);
    expect(restored.bodyMd).toBe("Source v1");

    await service.update(ctx, { id: source.id, contentJson: wikilink(target.slug) });
    expect(await service.listForwardLinks(DEFAULT_ORG_ID, source.id)).toEqual([{
      toDocId: target.id,
      toSlug: target.slug,
      linkKind: "wikilink",
    }]);
    expect(await service.listBacklinks(DEFAULT_ORG_ID, target.id)).toEqual([{
      fromDocId: source.id,
      title: "Source Link",
      slug: source.slug,
      linkKind: "wikilink",
    }]);

    await expect(service.listVersions(ctx, randomUUID())).rejects.toBeInstanceOf(AppNotFoundError);
    await expect(service.diffVersions(ctx, randomUUID(), 1, 2)).rejects.toBeInstanceOf(AppNotFoundError);
  });

  test("serializes fallback titles when frontmatter title is absent", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    await ensureUser(em);
    const service = new DocumentService(em);
    const ctx = { orgId: DEFAULT_ORG_ID, userId: USER_ID, em };
    const doc = await service.create(ctx, { title: "Fallback source" });

    await em.getConnection().execute(
      `UPDATE documents SET frontmatter = ?::jsonb, external_id = NULL WHERE id = ?`,
      [JSON.stringify({}), doc.id],
    );
    em.clear();

    expect(await service.get(DEFAULT_ORG_ID, { id: doc.id })).toMatchObject({
      title: doc.id,
      slug: doc.id,
      externalId: null,
    });
    await em.save(em.create(DocLink, {
      org: em.getReference(Org, DEFAULT_ORG_ID),
      fromDoc: em.getReference(Document, doc.id),
      toDoc: null,
      toSlug: "missing-slug",
      linkKind: "wikilink",
      createdAt: new Date(),
    } as never));
    expect(await service.listForwardLinks(DEFAULT_ORG_ID, doc.id)).toEqual([{
      toDocId: null,
      toSlug: "missing-slug",
      linkKind: "wikilink",
    }]);
  });
});
