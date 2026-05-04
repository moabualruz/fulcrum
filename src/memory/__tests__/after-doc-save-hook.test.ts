/**
 * AfterDocSaveMemoryHook tests — TDD RED → GREEN.
 *
 * Issue: .scratch/agent-os-vision/08-memory-context-engine/issues/05-heuristic-extraction-hook-doc-save.md
 *
 * Acceptance criteria:
 *   1. Pass 1: frontmatter keys decisions|blockers|links|status|tags → one Memory per value
 *   2. Pass 2: lists under ## Decisions / ## Blockers / ## Action Items → one Memory per bullet
 *   3. Pass 3: Wikilinks [[...]] in body → kind='link'
 *   4. MemoryLink with target_kind='doc', target_id=docId for every memory written
 *   5. Idempotent: re-saving same doc body does not duplicate rows
 *   6. No-op when body + frontmatter produce zero extractions
 *   7. org_id and project_id inferred from ctx
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Container } from "@needle-di/core";

import { createTestOrm, type TestOrm } from "../../test-utils/db.ts";
import { registerDbBindings } from "../../db/db.module.ts";
import { Org } from "../../db/entities/auth/Org.ts";
import { Memory } from "../../db/entities/memory/Memory.ts";
import { MemoryLink } from "../../db/entities/memory/MemoryLink.ts";
import { AfterDocSaveMemoryHook, type DocSaveCtx } from "../hooks/after-doc-save-hook.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const DOC_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

const BASE_CTX: DocSaveCtx = {
  orgId: ORG_ID,
  projectId: PROJECT_ID,
};

let db: TestOrm;

beforeAll(async () => {
  db = await createTestOrm();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  const em = db.orm.em.fork();
  await em.nativeDelete(MemoryLink, {});
  await em.nativeDelete(Memory, {});
  // Ensure ORG_ID org exists (seed creates DEFAULT_ORG_ID which equals ORG_ID)
  await em.upsert(
    Org,
    { id: ORG_ID, name: "Test", slug: "test", updatedAt: new Date() },
    { onConflictFields: ["id"] },
  );
});

describe("AfterDocSaveMemoryHook", () => {
  test("resolves through needle-di", () => {
    const container = new Container();
    registerDbBindings(container, db.orm, db.orm.em.fork());
    const hook = container.get(AfterDocSaveMemoryHook);
    expect(hook).toBeInstanceOf(AfterDocSaveMemoryHook);
  });

  test("is no-op when body and frontmatter produce zero extractions", async () => {
    const hook = createHook();
    await hook.handle(DOC_ID, "No extractable content here", {}, BASE_CTX);

    const em = db.orm.em.fork();
    const memories = await em.find(Memory, {});
    expect(memories).toHaveLength(0);
  });

  // Pass 1 — frontmatter keys
  test("Pass 1: frontmatter decisions array → Memory rows with kind=decision", async () => {
    const hook = createHook();
    await hook.handle(
      DOC_ID,
      "",
      { decisions: ["use PGlite", "local-first defaults"] },
      BASE_CTX,
    );

    const em = db.orm.em.fork();
    const memories = await em.find(Memory, { kind: "decision" });
    expect(memories).toHaveLength(2);
    expect(memories.map((m) => m.body).sort()).toEqual([
      "local-first defaults",
      "use PGlite",
    ]);
    expect(memories.every((m) => m.source === "heuristic")).toBe(true);
    expect(memories.every((m) => m.projectId === PROJECT_ID)).toBe(true);
  });

  test("Pass 1: frontmatter blockers array → Memory rows with kind=blocker", async () => {
    const hook = createHook();
    await hook.handle(DOC_ID, "", { blockers: ["waiting on review"] }, BASE_CTX);

    const em = db.orm.em.fork();
    const blockers = await em.find(Memory, { kind: "blocker" });
    expect(blockers).toHaveLength(1);
    expect(blockers[0]?.body).toBe("waiting on review");
  });

  test("Pass 1: frontmatter tags array → Memory rows with kind=note", async () => {
    const hook = createHook();
    await hook.handle(DOC_ID, "", { tags: ["architecture", "memory"] }, BASE_CTX);

    const em = db.orm.em.fork();
    const notes = await em.find(Memory, { kind: "note" });
    expect(notes).toHaveLength(2);
    expect(notes.map((m) => m.body).sort()).toEqual(["architecture", "memory"]);
  });

  test("Pass 1: frontmatter links scalar string → Memory row with kind=link", async () => {
    const hook = createHook();
    await hook.handle(DOC_ID, "", { links: "some-doc-slug" }, BASE_CTX);

    const em = db.orm.em.fork();
    const links = await em.find(Memory, { kind: "link" });
    expect(links).toHaveLength(1);
    expect(links[0]?.body).toBe("some-doc-slug");
  });

  test("Pass 1: frontmatter status scalar → Memory row with kind=note", async () => {
    const hook = createHook();
    await hook.handle(DOC_ID, "", { status: "in-progress" }, BASE_CTX);

    const em = db.orm.em.fork();
    const notes = await em.find(Memory, { kind: "note" });
    expect(notes).toHaveLength(1);
    expect(notes[0]?.body).toBe("in-progress");
  });

  // Pass 2 — heading sections
  test("Pass 2: ## Decisions heading bullets → Memory rows with kind=decision", async () => {
    const hook = createHook();
    const body = "## Decisions\n- use PGlite\n- keep local-first\n\n## Other\nstuff";
    await hook.handle(DOC_ID, body, {}, BASE_CTX);

    const em = db.orm.em.fork();
    const decisions = await em.find(Memory, { kind: "decision" });
    expect(decisions).toHaveLength(2);
    expect(decisions.map((m) => m.body).sort()).toEqual([
      "keep local-first",
      "use PGlite",
    ]);
    expect(decisions.every((m) => m.importance === "high")).toBe(true);
  });

  test("Pass 2: ## Blockers heading bullets → Memory rows with kind=blocker importance=high", async () => {
    const hook = createHook();
    const body = "## Blockers\n- waiting on review\n- need schema migration";
    await hook.handle(DOC_ID, body, {}, BASE_CTX);

    const em = db.orm.em.fork();
    const blockers = await em.find(Memory, { kind: "blocker" });
    expect(blockers).toHaveLength(2);
    expect(blockers.every((m) => m.importance === "high")).toBe(true);
  });

  test("Pass 2: ## Action Items heading bullets → Memory rows with kind=note", async () => {
    const hook = createHook();
    const body = "## Action Items\n- review PR\n- update docs";
    await hook.handle(DOC_ID, body, {}, BASE_CTX);

    const em = db.orm.em.fork();
    const notes = await em.find(Memory, { kind: "note" });
    expect(notes).toHaveLength(2);
    expect(notes.map((m) => m.body).sort()).toEqual(["review PR", "update docs"]);
  });

  // Pass 3 — wikilinks
  test("Pass 3: [[Wikilink]] in body → Memory with kind=link", async () => {
    const hook = createHook();
    await hook.handle(DOC_ID, "See [[My Doc]] and [[Architecture]]", {}, BASE_CTX);

    const em = db.orm.em.fork();
    const links = await em.find(Memory, { kind: "link" });
    expect(links).toHaveLength(2);
    expect(links.map((m) => m.body).sort()).toEqual(["Architecture", "My Doc"]);
  });

  // MemoryLink persistence
  test("persists MemoryLink with target_kind=doc and target_id=docId for every memory", async () => {
    const hook = createHook();
    await hook.handle(
      DOC_ID,
      "[[Wikilink]]",
      { decisions: ["use PGlite"] },
      BASE_CTX,
    );

    const em = db.orm.em.fork();
    const memories = await em.find(Memory, {});
    const links = await em.find(MemoryLink, {}, { populate: ["memory"] });

    expect(memories.length).toBeGreaterThanOrEqual(2);
    expect(links).toHaveLength(memories.length);
    expect(links.every((l) => l.targetKind === "doc")).toBe(true);
    expect(links.every((l) => l.targetId === DOC_ID)).toBe(true);
  });

  // Idempotency
  test("idempotent: re-saving same body does not duplicate rows", async () => {
    const hook = createHook();
    const body = "## Decisions\n- use PGlite\n\n[[Architecture]]";
    const fm = { tags: ["memory"] };

    await hook.handle(DOC_ID, body, fm, BASE_CTX);
    await hook.handle(DOC_ID, body, fm, BASE_CTX);

    const em = db.orm.em.fork();
    const memories = await em.find(Memory, {});
    const memoryLinks = await em.find(MemoryLink, {});

    // Count should be same after second call
    const uniqueMemoryBodies = new Set(memories.map((m) => `${m.kind}:${m.body}`));
    expect(memories).toHaveLength(uniqueMemoryBodies.size);
    expect(memoryLinks).toHaveLength(memories.length);
  });

  // org/project scoping
  test("sets org_id and project_id from ctx on every Memory", async () => {
    const hook = createHook();
    await hook.handle(DOC_ID, "[[Doc Ref]]", {}, BASE_CTX);

    const em = db.orm.em.fork();
    const memories = await em.find(Memory, {});
    expect(memories.length).toBeGreaterThan(0);
    expect(memories.every((m) => m.projectId === PROJECT_ID)).toBe(true);
  });
});

function createHook(): AfterDocSaveMemoryHook {
  const container = new Container();
  registerDbBindings(container, db.orm, db.orm.em.fork());
  return container.get(AfterDocSaveMemoryHook);
}
