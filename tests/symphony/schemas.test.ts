import { describe, expect, it } from "bun:test";

import {
  AgentRunIssueSchema,
  CandidateIssueSchema,
  FetchCandidateIssuesInputSchema,
  WorkflowConfigSchema,
} from "../../src/orchestration/symphony/schemas.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const RUN_ID = "10000000-0000-0000-0000-000000000001";
const TASK_ID = "20000000-0000-0000-0000-000000000001";

describe("Symphony shared schemas", () => {
  it("applies fetch-candidate defaults and bounds", () => {
    expect(FetchCandidateIssuesInputSchema.parse({ orgId: ORG_ID })).toEqual({
      orgId: ORG_ID,
      limit: 50,
    });

    expect(() =>
      FetchCandidateIssuesInputSchema.parse({ orgId: ORG_ID, limit: 501 }),
    ).toThrow();
    expect(() =>
      FetchCandidateIssuesInputSchema.parse({ orgId: "not-a-uuid" }),
    ).toThrow();
  });

  it("keeps candidate issue rows on the ready-task contract", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");

    expect(
      CandidateIssueSchema.parse({
        id: TASK_ID,
        identifier: "FUL-123",
        title: "Fix login",
        state: "Ready",
        status: "ready",
        priority: null,
        createdAt,
        blockedByIds: [],
        workflowId: null,
      }),
    ).toEqual({
      id: TASK_ID,
      identifier: "FUL-123",
      title: "Fix login",
      state: "Ready",
      status: "ready",
      priority: null,
      createdAt,
      blockedByIds: [],
      workflowId: null,
    });

    expect(() =>
      CandidateIssueSchema.parse({
        id: TASK_ID,
        identifier: "FUL-123",
        title: "Fix login",
        state: "Ready",
        status: "todo",
        priority: null,
        createdAt,
        blockedByIds: [],
        workflowId: null,
      }),
    ).toThrow();
  });

  it("validates agent-run issue state rows", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");

    expect(
      AgentRunIssueSchema.parse({
        id: RUN_ID,
        state: "running",
        orchestrationState: "running",
        task: {
          id: TASK_ID,
          status: "ready",
          priority: 1,
          createdAt: startedAt,
          blockedByIds: [],
          workflowId: null,
        },
        startedAt,
        attemptCount: 1,
        nextRetryAt: null,
        workspacePath: null,
        lastErrorKind: null,
      }),
    ).toMatchObject({
      id: RUN_ID,
      state: "running",
      orchestrationState: "running",
    });

    expect(() =>
      AgentRunIssueSchema.parse({
        id: RUN_ID,
        state: "unknown",
        orchestrationState: "running",
        task: null,
        startedAt,
        attemptCount: 1,
        nextRetryAt: null,
        workspacePath: null,
        lastErrorKind: null,
      }),
    ).toThrow();
  });

  it("keeps workflow config defaults in the shared schema", () => {
    expect(WorkflowConfigSchema.parse({})).toEqual({
      stallTimeoutMs: 300000,
      maxRetryBackoffMs: 3600000,
      keepOnFailure: false,
      maxAttempts: 3,
    });
  });
});
