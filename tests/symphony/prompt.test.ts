/**
 * TDD — Symphony strict prompt renderer + workflow definition loader.
 */

import { afterEach, describe, expect, it } from "bun:test";

import { DEFAULT_ORG_ID } from "../../src/db/seed.ts";
import { Org } from "../../src/db/entities/auth/Org.ts";
import { WorkflowDefinition } from "../../src/db/entities/orchestration/WorkflowDefinition.ts";
import {
  createTestCaller,
  createTestContainer,
  createTestOrm,
  type TestOrm,
} from "../../src/test-utils/index.ts";

let db: TestOrm | undefined;

afterEach(async () => {
  await db?.close();
  db = undefined;
});

describe("renderPrompt", () => {
  it("renders issue.title and nullable attempt in liquid strict mode", async () => {
    const { renderPrompt } = await import("../../src/orchestration/symphony/prompt.ts");

    const prompt = await renderPrompt(
      {
        id: "workflow-1",
        promptMd: "Fix {{ issue.title }} on attempt {{ attempt | default: 'first' }}.",
        configYaml: "",
      },
      {
        issue: { id: "task-1", title: "broken login" },
        attempt: null,
      },
    );

    expect(prompt).toBe("Fix broken login on attempt first.");
  });

  it("throws UnknownVariableError when template references unknown variables", async () => {
    const { UnknownVariableError, renderPrompt } = await import(
      "../../src/orchestration/symphony/prompt.ts"
    );

    await expect(
      renderPrompt(
        {
          id: "workflow-1",
          promptMd: "Fix {{ unknown_var }}.",
          configYaml: "",
        },
        {
          issue: { id: "task-1", title: "broken login" },
          attempt: null,
        },
      ),
    ).rejects.toBeInstanceOf(UnknownVariableError);
  });
});

describe("parseWorkflowConfig", () => {
  it("parses empty config as defaults", async () => {
    const { parseWorkflowConfig } = await import("../../src/orchestration/symphony/prompt.ts");

    expect(parseWorkflowConfig("")).toEqual({
      stallTimeoutMs: 300000,
      maxRetryBackoffMs: 300000,
      keepOnFailure: false,
      maxAttempts: 3,
    });
  });

  it("parses valid YAML workflow config", async () => {
    const { parseWorkflowConfig } = await import("../../src/orchestration/symphony/prompt.ts");

    expect(
      parseWorkflowConfig(`
stall_timeout_ms: 120000
max_retry_backoff_ms: 600000
keepOnFailure: true
maxAttempts: 4
`),
    ).toEqual({
      stallTimeoutMs: 120000,
      maxRetryBackoffMs: 600000,
      keepOnFailure: true,
      maxAttempts: 4,
    });
  });

  it("rejects invalid YAML workflow config", async () => {
    const { parseWorkflowConfig } = await import("../../src/orchestration/symphony/prompt.ts");

    expect(() => parseWorkflowConfig("stall_timeout_ms: [")).toThrow();
    expect(() => parseWorkflowConfig("maxAttempts: 0")).toThrow();
  });
});

describe("loadWorkflowDef", () => {
  it("returns org-wide default when project-specific workflow is absent", async () => {
    const { loadWorkflowDef } = await import("../../src/orchestration/symphony/prompt.ts");
    db = await createTestOrm();
    const em = db.em.fork();
    const org = em.getReference(Org, DEFAULT_ORG_ID);

    em.persist(
      em.create(WorkflowDefinition, {
        org,
        projectId: null,
        name: "default",
        configYaml: "maxAttempts: 3",
        promptMd: "Default {{ issue.title }}",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    );
    await em.flush();

    const workflowDef = await loadWorkflowDef(
      db.em,
      DEFAULT_ORG_ID,
      "11111111-1111-1111-1111-111111111111",
    );

    expect(workflowDef?.projectId).toBeNull();
    expect(workflowDef?.promptMd).toBe("Default {{ issue.title }}");
  });
});

describe("orchestration.renderPromptPreview", () => {
  it("renders a strict prompt preview for web workflow editors", async () => {
    db = await createTestOrm();
    const caller = await createTestCaller(createTestContainer(db));

    const result = await caller.orchestration.renderPromptPreview({
      orgId: DEFAULT_ORG_ID,
      promptMd: "Ship {{ issue.title }}.",
      configYaml: "maxAttempts: 2",
      issue: { id: "task-1", title: "prompt preview" },
      attempt: null,
    });

    expect(result).toEqual({
      prompt: "Ship prompt preview.",
      config: {
        stallTimeoutMs: 300000,
        maxRetryBackoffMs: 300000,
        keepOnFailure: false,
        maxAttempts: 2,
      },
    });
  });

  it("propagates strict template errors through tRPC", async () => {
    db = await createTestOrm();
    const caller = await createTestCaller(createTestContainer(db));

    await expect(caller.orchestration.renderPromptPreview({
      orgId: DEFAULT_ORG_ID,
      promptMd: "Ship {{ missing.title }}.",
      configYaml: "",
      issue: { id: "task-1", title: "prompt preview" },
      attempt: null,
    })).rejects.toThrow(/missing/);
  });
});
