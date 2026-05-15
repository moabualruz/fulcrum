import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Container } from "@needle-di/core";

import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { registerDbBindings } from "@platform-core/infrastructure/application-database/db.module.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Memory } from "@knowledge-workspace/infrastructure/database/entities/memory/Memory.ts";
import { MemoryLink } from "@knowledge-workspace/infrastructure/database/entities/memory/MemoryLink.ts";
import { AfterRunMemoryHook, type AfterRunMemoryContext } from "../hooks/after-run-hook.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const RUN_ID = "22222222-2222-2222-2222-222222222222";

let db: TestOrm;

beforeAll(async () => {
  db = await createTestOrm();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  const em = db.orm.em;
  await em.nativeDelete(MemoryLink, {});
  await em.nativeDelete(Memory, {});
  await em.upsert(
    Org,
    { id: ORG_ID, name: "Test", slug: "test", updatedAt: new Date() },
    ["id"],
  );
});

describe("AfterRunMemoryHook", () => {
  test("resolves through needle-di", () => {
    const container = null;
    registerDbBindings(container, db.orm, db.orm.em);

    expect(container.get(AfterRunMemoryHook)).toBeInstanceOf(AfterRunMemoryHook);
  });

  test("extracts heuristic memories from transcript and links them to the agent run", async () => {
    const hook = createHook();
    const transcript = [
      "[wrote] services/knowledge-workspace/src/application/memory/hooks/after-run-hook.ts",
      "Decision: persist run memories after Symphony completion",
      "blocked by extractor core",
      "See [[Memory Architecture]]",
    ].join("\n");

    await hook.handle(RUN_ID, transcript, createCtx());

    const em = db.orm.em;
    const memories = await em.find(Memory, {}, { orderBy: { kind: "ASC", body: "ASC" } });
    const links = await em.find(MemoryLink, {}, { populate: ["memory"] });

    expect(memories).toHaveLength(4);
    expect(memories.every((memory) => memory.source === "heuristic")).toBe(true);
    expect(memories.every((memory) => memory.orgId === ORG_ID)).toBe(true);
    expect(memories.map((memory) => memory.kind).sort()).toEqual([
      "blocker",
      "decision",
      "file_ref",
      "link",
    ]);
    expect(memories.map((memory) => memory.sourceRef["run_id"])).toEqual([
      RUN_ID,
      RUN_ID,
      RUN_ID,
      RUN_ID,
    ]);
    expect(
      memories.every((memory) =>
        typeof memory.sourceRef["span_start"] === "number" &&
        typeof memory.sourceRef["span_end"] === "number"
      ),
    ).toBe(true);
    expect(links).toHaveLength(4);
    expect(links.every((link) => link.targetKind === "agent_run")).toBe(true);
    expect(links.every((link) => link.targetId === RUN_ID)).toBe(true);
  });

  test("is idempotent for the same run and transcript", async () => {
    const hook = createHook();
    const transcript = "Decision: keep after_run extraction idempotent";

    await hook.handle(RUN_ID, transcript, createCtx());
    await hook.handle(RUN_ID, transcript, createCtx());

    const em = db.orm.em;
    expect(await em.count(Memory, {})).toBe(1);
    expect(await em.count(MemoryLink, {})).toBe(1);
  });

  test("is no-op when extractor returns no memories", async () => {
    const hook = createHook();

    await hook.handle(RUN_ID, "", createCtx());

    const em = db.orm.em;
    expect(await em.count(Memory, {})).toBe(0);
    expect(await em.count(MemoryLink, {})).toBe(0);
  });
});

function createHook(): AfterRunMemoryHook {
  const container = null;
  registerDbBindings(container, db.orm, db.orm.em);
  return container.get(AfterRunMemoryHook);
}

function createCtx(): AfterRunMemoryContext {
  return {
    orgId: ORG_ID,
  };
}
