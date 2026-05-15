import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { registerDbBindings } from "@platform-core/infrastructure/application-database/db.module.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Task } from "@work-management/infrastructure/database/entities/tasks/Task.ts";
import { Document } from "@knowledge-workspace/infrastructure/database/entities/docs/Document.ts";
import { Memory } from "@knowledge-workspace/infrastructure/database/entities/memory/Memory.ts";
import { ContextSnapshot } from "@knowledge-workspace/infrastructure/database/entities/memory/ContextSnapshot.ts";
import { MemoryRetriever } from "@knowledge-workspace/application/memory/retriever.ts";
import { MemoryRepository } from "@knowledge-workspace/infrastructure/database/repositories/memory/MemoryRepository.ts";
import {
  CONTEXT_SLICE_WEIGHTS,
  ContextAssembler,
  DEFAULT_CONTEXT_TOKEN_BUDGET,
  estimateContextTokens,
  replayContextSnapshot,
  type ContextBundle,
  type ContextSliceKey,
} from "../assemble.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const TASK_ID = "22222222-2222-2222-2222-222222222222";
const SIBLING_TASK_ID = "33333333-3333-3333-3333-333333333333";
const REPO_ID = "44444444-4444-4444-4444-444444444444";

const SLICE_KEYS: ContextSliceKey[] = [
  "memories",
  "linkedDocs",
  "recentRuns",
  "repoState",
  "skillPrompts",
];

describe("ContextAssembler", () => {
  test("assembles exactly five non-null slices, calls retriever with title plus description, and stores identical snapshot JSON", async () => {
    const snapshotRepo = new FakeSnapshotRepo();
    const retriever = new FakeMemoryRetriever([
      { body: "Remember to use the existing retriever.", kind: "decision", importance: "high" },
    ]);
    const assembler = new ContextAssembler(
      retriever,
      new FakeTaskRepo(taskFixture()),
      new FakeDocRepo([
        docFixture("Design Doc", "Doc first paragraph.\n\nDoc second paragraph."),
      ]),
      new FakeRunRepo([]),
      snapshotRepo,
      new FakeRepoRepo(null),
      new FakeSkillRepo([]),
    );

    const { bundle, snapshotId } = await assembler.assemble(TASK_ID);

    expect(snapshotId).toBe("snapshot-1");
    expect(retriever.calls).toEqual([
      {
        query: "Fix context bundles Use [[Design Doc]] before the run.",
        opts: {
          orgId: ORG_ID,
          projectId: PROJECT_ID,
          topK: 20,
        },
      },
    ]);
    expect(bundle.tokenBudget).toBe(DEFAULT_CONTEXT_TOKEN_BUDGET);
    expect(Object.keys(bundle.slices)).toHaveLength(5);
    expect(new Set(Object.keys(bundle.slices))).toEqual(new Set(SLICE_KEYS));
    for (const key of SLICE_KEYS) {
      expect(bundle.slices[key]).toEqual({
        content: expect.any(String),
        tokenCount: expect.any(Number),
      });
    }
    expect(bundle.slices.memories.content).toContain("existing retriever");
    expect(bundle.slices.linkedDocs.content).toContain("Doc first paragraph.");
    expect(bundle.slices.linkedDocs.content).not.toContain("Doc second paragraph");
    expect(snapshotRepo.records).toHaveLength(1);
    expect(JSON.stringify(snapshotRepo.records[0]!.bundleBlob)).toBe(
      JSON.stringify(bundle),
    );
  });

  test("clips every slice to its proportional allocation and total token budget", async () => {
    const assembler = new ContextAssembler(
      new FakeMemoryRetriever([{ body: words("memory", 200), kind: "note" }]),
      new FakeTaskRepo(taskFixture({ description: "Read [[Long Doc]]." })),
      new FakeDocRepo([docFixture("Long Doc", words("doc", 300))]),
      new FakeRunRepo([
        runFixture("same-1", TASK_ID, "succeeded", words("summary", 80), words("transcript", 100)),
      ]),
      new FakeSnapshotRepo(),
      new FakeRepoRepo(repoFixture()),
      new FakeSkillRepo([skillFixture()]),
    );

    const { bundle } = await assembler.assemble(TASK_ID, {
      tokenBudget: 100,
      agent: "codex",
    });

    expect(bundle.tokenCount).toBeLessThanOrEqual(100);
    for (const key of SLICE_KEYS) {
      const allocation = Math.floor(100 * CONTEXT_SLICE_WEIGHTS[key]);
      expect(bundle.slices[key].tokenCount).toBeLessThanOrEqual(allocation);
    }
  });

  test("resolves at most five wikilinks and caps each linked doc at the 200-token boundary", async () => {
    const docTitles = Array.from({ length: 7 }, (_, index) => `Doc ${index + 1}`);
    const docs = docTitles.map((title, index) =>
      docFixture(title, words(`doc${index + 1}`, 300))
    );
    const description = docTitles.map((title) => `[[${title}]]`).join(" ");
    const assembler = new ContextAssembler(
      new FakeMemoryRetriever([]),
      new FakeTaskRepo(taskFixture({ description })),
      new FakeDocRepo(docs),
      new FakeRunRepo([]),
      new FakeSnapshotRepo(),
      new FakeRepoRepo(null),
      new FakeSkillRepo([]),
    );

    const { bundle } = await assembler.assemble(TASK_ID);
    const linkedDocs = bundle.slices.linkedDocs.content;

    expect(linkedDocs).toContain("Doc 1");
    expect(linkedDocs).toContain("Doc 5");
    expect(linkedDocs).not.toContain("Doc 6");
    expect(linkedDocs).not.toContain("Doc 7");
    for (const docSection of linkedDocs.split("\n---\n").filter(Boolean)) {
      expect(estimateContextTokens(docSection)).toBeLessThanOrEqual(200);
    }
  });

  test("includes last three same-task runs plus last two sibling runs and drops transcripts when budget is tight", async () => {
    const assembler = new ContextAssembler(
      new FakeMemoryRetriever([]),
      new FakeTaskRepo(taskFixture({ description: "Run context", sprintId: "sprint-1" })),
      new FakeDocRepo([]),
      new FakeRunRepo([
        runFixture("same-1", TASK_ID, "failed", "same old", "TRANSCRIPT-same-1", 1),
        runFixture("same-2", TASK_ID, "failed", "same two", "TRANSCRIPT-same-2", 2),
        runFixture("same-3", TASK_ID, "succeeded", "same three", "TRANSCRIPT-same-3", 3),
        runFixture("same-4", TASK_ID, "succeeded", "same four", "TRANSCRIPT-same-4", 4),
        runFixture("sibling-1", SIBLING_TASK_ID, "failed", "sibling old", "TRANSCRIPT-sibling-1", 1),
        runFixture("sibling-2", SIBLING_TASK_ID, "succeeded", "sibling two", "TRANSCRIPT-sibling-2", 2),
        runFixture("sibling-3", SIBLING_TASK_ID, "succeeded", "sibling three", "TRANSCRIPT-sibling-3", 3),
      ]),
      new FakeSnapshotRepo(),
      new FakeRepoRepo(null),
      new FakeSkillRepo([]),
    );

    const { bundle } = await assembler.assemble(TASK_ID, { tokenBudget: 120 });
    const recentRuns = bundle.slices.recentRuns.content;

    expect(recentRuns).toContain("same-4");
    expect(recentRuns).toContain("same-3");
    expect(recentRuns).toContain("same-2");
    expect(recentRuns).not.toContain("same-1");
    expect(recentRuns).toContain("sibling-3");
    expect(recentRuns).toContain("sibling-2");
    expect(recentRuns).not.toContain("sibling-1");
    expect(recentRuns).not.toContain("TRANSCRIPT-");
  });

  test("fills repo and skill slices when available and leaves them empty when unavailable", async () => {
    const fullAssembler = new ContextAssembler(
      new FakeMemoryRetriever([]),
      new FakeTaskRepo(taskFixture({ repoId: REPO_ID })),
      new FakeDocRepo([]),
      new FakeRunRepo([]),
      new FakeSnapshotRepo(),
      new FakeRepoRepo(repoFixture()),
      new FakeSkillRepo([skillFixture()]),
    );
    const emptyAssembler = new ContextAssembler(
      new FakeMemoryRetriever([]),
      new FakeTaskRepo(taskFixture()),
      new FakeDocRepo([]),
      new FakeRunRepo([]),
      new FakeSnapshotRepo(),
      new FakeRepoRepo(null),
      new FakeSkillRepo([]),
    );

    const full = await fullAssembler.assemble(TASK_ID, { agent: "codex" });
    const empty = await emptyAssembler.assemble(TASK_ID, { agent: "pi" });

    expect(full.bundle.slices.repoState.content).toContain("main");
    expect(full.bundle.slices.repoState.content).toContain("services/knowledge-workspace/src/application/context");
    expect(full.bundle.slices.skillPrompts.content).toContain("Use when assembling context.");
    expect(full.bundle.slices.skillPrompts.content).toContain("context bundle");
    expect(empty.bundle.slices.repoState).toEqual({ content: "", tokenCount: 0 });
    expect(empty.bundle.slices.skillPrompts).toEqual({ content: "", tokenCount: 0 });
  });

  test("persists a real ContextSnapshot and replays bundleBlob without repository calls", async () => {
    const db = await createTestOrm();
    try {
      await seedIntegrationRows(db);
      registerDbBindings(null);
      const assembler = buildAssembler(db);

      const { bundle, snapshotId } = await assembler.assemble(TASK_ID);

      const snapshot = await db.orm.em.findOneOrFail(
        ContextSnapshot,
        { id: snapshotId },
      );
      expect(JSON.stringify(snapshot.bundleBlob)).toBe(JSON.stringify(bundle));
      expect(JSON.stringify(replayContextSnapshot(snapshot.bundleBlob))).toBe(
        JSON.stringify(bundle),
      );
      expect(snapshot.tokenCount).toBe(bundle.tokenCount);
      expect(snapshot.sliceSizes).toEqual(sliceSizes(bundle));
    } finally {
      await db.close();
    }
  });

  test("loads lazy task customFields in the real repository path before deriving query, project, and wikilinks", async () => {
    const db = await createTestOrm();
    try {
      const retriever = new FakeMemoryRetriever([
        { body: "Lazy custom fields memory.", kind: "note" },
      ]);
      await seedLazyTaskRows(db);
      registerDbBindings(null);
      const assembler = buildAssembler(db, retriever);

      const { bundle } = await assembler.assemble(TASK_ID);

      expect(retriever.calls[0]?.query).toBe(
        "Lazy field title Read [[Lazy Linked Doc]] before dispatch.",
      );
      expect(bundle.projectId).toBe(PROJECT_ID);
      expect(bundle.slices.linkedDocs.content).toContain("Lazy linked content.");
    } finally {
      await db.close();
    }
  });
});

class FakeMemoryRetriever {
  readonly calls: Array<{ query: string; opts: unknown }> = [];

  constructor(private readonly memories: Array<Record<string, unknown>>) {}

  async retrieve(query: string, opts: unknown): Promise<Array<Record<string, unknown>>> {
    this.calls.push({ query, opts });
    return this.memories;
  }
}

class FakeTaskRepo {
  constructor(private readonly task: Record<string, unknown>) {}

  async findOneOrFail(): Promise<Record<string, unknown>> {
    return this.task;
  }
}

class FakeDocRepo {
  constructor(private readonly docs: Array<Record<string, unknown>>) {}

  async find(): Promise<Array<Record<string, unknown>>> {
    return this.docs;
  }
}

class FakeRunRepo {
  constructor(private readonly runs: Array<Record<string, unknown>>) {}

  async find(criteria: unknown): Promise<Array<Record<string, unknown>>> {
    const query = criteria as { task?: { id?: unknown; sprint?: unknown } };
    const taskId = typeof query.task?.id === "string" ? query.task.id : null;
    const sprintId = typeof query.task?.sprint === "string" ? query.task.sprint : null;
    if (taskId) return this.runs.filter((run) => run["taskId"] === taskId);
    if (sprintId) {
      return this.runs.filter((run) =>
        run["taskId"] !== TASK_ID && run["sprintId"] === sprintId
      );
    }
    return this.runs;
  }
}

class FakeSnapshotRepo {
  readonly records: Array<{
    bundleBlob: ContextBundle;
    tokenCount: number;
    sliceSizes: Record<ContextSliceKey, number>;
  }> = [];

  async write(record: {
    bundleBlob: ContextBundle;
    tokenCount: number;
    sliceSizes: Record<ContextSliceKey, number>;
  }): Promise<string> {
    this.records.push(record);
    return `snapshot-${this.records.length}`;
  }
}

class FakeRepoRepo {
  constructor(private readonly repo: Record<string, unknown> | null) {}

  async findOne(): Promise<Record<string, unknown> | null> {
    return this.repo;
  }
}

class FakeSkillRepo {
  constructor(private readonly skills: Array<Record<string, unknown>>) {}

  async find(): Promise<Array<Record<string, unknown>>> {
    return this.skills;
  }
}

function taskFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const customFields: Record<string, unknown> = {
    title: "Fix context bundles",
    description: "Use [[Design Doc]] before the run.",
    projectId: PROJECT_ID,
    ...overrides,
  };

  return {
    id: TASK_ID,
    org: { id: ORG_ID },
    sprint: customFields["sprintId"] ?? null,
    customFields,
  };
}

function docFixture(title: string, bodyMd: string): Record<string, unknown> {
  return {
    id: `${title.toLowerCase().replaceAll(" ", "-")}-id`,
    projectId: PROJECT_ID,
    scope: "project",
    frontmatter: { title, slug: title.toLowerCase().replaceAll(" ", "-") },
    bodyMd,
    updatedAt: new Date("2026-05-02T00:00:00.000Z"),
  };
}

function runFixture(
  id: string,
  taskId: string,
  status: string,
  summary: string,
  transcript: string,
  order = 0,
): Record<string, unknown> {
  return {
    id,
    taskId,
    task: { id: taskId, sprint: "sprint-1" },
    sprintId: "sprint-1",
    status,
    summary,
    transcript,
    startedAt: new Date(`2026-05-02T00:0${order}:00.000Z`),
  };
}

function repoFixture(): Record<string, unknown> {
  return {
    id: REPO_ID,
    slug: "fulcrum",
    currentBranch: "main",
    commits: [
      { sha: "abc001", subject: "feat: first" },
      { sha: "abc002", subject: "fix: second" },
      { sha: "abc003", subject: "test: third" },
      { sha: "abc004", subject: "docs: fourth" },
      { sha: "abc005", subject: "refactor: fifth" },
      { sha: "abc006", subject: "chore: sixth" },
    ],
    tree: ["services/knowledge-workspace/src/application/context", "services/knowledge-workspace/src/application/memory", "services/platform-core/src/infrastructure/application-database/entities", "README.md"],
  };
}

function skillFixture(): Record<string, unknown> {
  return {
    name: "Context assembler",
    slug: "context-assembler",
    enabledAgents: ["codex"],
    description: "Use when assembling context.",
    triggers: ["context bundle", "before_run"],
  };
}

function words(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index}`).join(" ");
}

function sliceSizes(bundle: ContextBundle): Record<ContextSliceKey, number> {
  return {
    memories: bundle.slices.memories.tokenCount,
    linkedDocs: bundle.slices.linkedDocs.tokenCount,
    recentRuns: bundle.slices.recentRuns.tokenCount,
    repoState: bundle.slices.repoState.tokenCount,
    skillPrompts: bundle.slices.skillPrompts.tokenCount,
  };
}

async function seedIntegrationRows(db: TestOrm): Promise<void> {
  const em = db.orm.em;
  const org = em.getReference(Org, ORG_ID);
  em.persist(em.create(Task, {
    id: TASK_ID,
    org,
    customFields: {
      title: "Assembler retrieval",
      description: "Assembler retrieval memory marker.",
      projectId: PROJECT_ID,
    },
  }));
  em.persist(em.create(Memory, {
    id: "55555555-5555-5555-5555-555555555555",
    org,
    projectId: PROJECT_ID,
    global: false,
    kind: "decision",
    body: "Assembler retrieval memory marker should be included.",
    tags: [],
    importance: "high",
    source: "manual",
    sourceRef: {},
    archived: false,
    createdAt: new Date("2026-05-02T00:00:00.000Z"),
    updatedAt: new Date("2026-05-02T00:00:00.000Z"),
  }));
  await (em as any).flush();
}

async function seedLazyTaskRows(db: TestOrm): Promise<void> {
  const em = db.orm.em;
  const org = em.getReference(Org, ORG_ID);
  em.persist(em.create(Task, {
    id: TASK_ID,
    org,
    customFields: {
      title: "Lazy field title",
      description: "Read [[Lazy Linked Doc]] before dispatch.",
      projectId: PROJECT_ID,
    },
  }));
  em.persist(em.create(Document, {
    id: "66666666-6666-6666-6666-666666666666",
    org,
    projectId: PROJECT_ID,
    scope: "project",
    docType: "note",
    frontmatter: {
      title: "Lazy Linked Doc",
      slug: "lazy-linked-doc",
    },
    bodyMd: "Lazy linked content.\n\nSecond paragraph.",
    contentJson: {},
    sortPosition: 0,
    archived: false,
    externalId: null,
    updatedAt: new Date("2026-05-02T00:00:00.000Z"),
  }));
  await (em as any).flush();
}

/**
 * Build a ContextAssembler backed by the test DB.
 * Bypasses NestJS DI container (which is null in tests) by wiring repos directly.
 */
function buildAssembler(db: TestOrm, retrieverOverride?: { retrieve: Function }): ContextAssembler {
  const em = db.orm.em;

  // MemoryRetriever backed by real DB MemoryRepository
  let retriever: any;
  if (retrieverOverride) {
    retriever = retrieverOverride;
  } else {
    const memRepo = Object.create(MemoryRepository.prototype) as MemoryRepository;
    // @ts-expect-error — inject underlying TypeORM repo directly
    memRepo["memories"] = db.ds.getRepository(Memory);
    retriever = new MemoryRetriever(memRepo);
  }

  // Task repo adapter: wraps em.findOneOrFail
  const taskRepository = {
    findOneOrFail: async (criteria: unknown) => {
      return em.findOneOrFail(Task, criteria as any);
    },
  };

  // Document repo adapter: wraps em.find
  const documentRepository = {
    find: async (where?: unknown, _opts?: unknown) => {
      // Ignore MikroORM $or — just find by projectId + not archived
      const w: any = { archived: false };
      if (where && typeof where === "object") {
        const criteria = where as any;
        if (criteria.org?.id) w.org = { id: criteria.org.id };
        if (criteria.projectId) w.projectId = criteria.projectId;
      }
      return em.find(Document, { where: w, order: { updatedAt: "DESC" } });
    },
  };

  // Run repo adapter: wraps em.find
  const runRepository = {
    find: async (_where?: unknown, _opts?: unknown) => {
      return [];
    },
  };

  // Repo repo adapter
  const repoRepository = {
    findOne: async () => null,
  };

  // Skill repo adapter
  const skillRepository = {
    find: async () => [],
  };

  return new ContextAssembler(
    retriever,
    taskRepository as any,
    documentRepository as any,
    runRepository as any,
    em, // snapshotWriterOrEm — EntityManager is accepted directly
    repoRepository as any,
    skillRepository as any,
  );
}
