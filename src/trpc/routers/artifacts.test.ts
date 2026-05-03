import { TRPCError } from "@trpc/server";
import { describe, expect, test } from "bun:test";
import type { Session } from "better-auth";

import { createContext } from "../context.ts";
import { appRouter } from "../router.ts";
import { t } from "../trpc.ts";

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG_ID = "00000000-0000-4000-8000-000000000002";
const USER_ID = "user_1";
const ARTIFACT_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const TASK_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";

type ArtifactRow = {
  id: string;
  orgId: string;
  projectId: string | null;
  runId: string | null;
  taskId: string | null;
  filename: string;
  mime: string | null;
  sizeBytes: bigint;
  path: string;
  checksumSha256: string | null;
  metadataJson: Record<string, unknown>;
  archived: boolean;
  retentionUntil: Date | null;
  createdAt: Date;
};

function row(overrides: Partial<ArtifactRow> = {}): ArtifactRow {
  return {
    id: ARTIFACT_ID,
    orgId: ORG_ID,
    projectId: PROJECT_ID,
    runId: RUN_ID,
    taskId: TASK_ID,
    filename: "report.md",
    mime: "text/markdown",
    sizeBytes: 42n,
    path: "local/proj/run/report.md",
    checksumSha256: null,
    metadataJson: { source: "test" },
    archived: false,
    retentionUntil: null,
    createdAt: new Date("2026-05-01T12:00:00Z"),
    ...overrides,
  };
}

function session(): Session {
  return {
    id: "session_1",
    userId: USER_ID,
    token: "token_1",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ipAddress: null,
    userAgent: null,
  } as Session;
}

function createCaller(deps: {
  repository?: Record<string, unknown>;
  storage?: Record<string, unknown>;
  events?: Record<string, unknown>;
  authenticated?: boolean;
}) {
  const factory = t.createCallerFactory(appRouter);
  return factory(
    {
      ...createContext({
      session: deps.authenticated === false ? null : session(),
      orgId: deps.authenticated === false ? null : ORG_ID,
      userId: deps.authenticated === false ? null : USER_ID,
      em: null,
      container: null,
    }),
      artifacts: {
        repository: deps.repository ?? {},
        storage: deps.storage ?? {},
        events: deps.events ?? {},
      },
    } as ReturnType<typeof createContext> & {
      artifacts: {
        repository: Record<string, unknown>;
        storage: Record<string, unknown>;
        events: Record<string, unknown>;
      };
    },
  );
}

describe("artifacts tRPC router", () => {
  test("list filters artifacts by org/project/run/task/archived/mime/date range", async () => {
    const calls: unknown[] = [];
    const caller = createCaller({
      repository: {
        list(input: unknown) {
          calls.push(input);
          return [row()];
        },
      },
    });

    const result = await caller.artifacts.list({
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      runId: RUN_ID,
      taskId: TASK_ID,
      archived: false,
      mime: "text/markdown",
      createdFrom: new Date("2026-05-01T00:00:00Z"),
      createdTo: new Date("2026-05-02T00:00:00Z"),
    });

    expect(calls).toEqual([{
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      runId: RUN_ID,
      taskId: TASK_ID,
      archived: false,
      mime: "text/markdown",
      createdFrom: new Date("2026-05-01T00:00:00Z"),
      createdTo: new Date("2026-05-02T00:00:00Z"),
    }]);
    expect(result).toEqual([{
      ...row(),
      sizeBytes: "42",
    }]);
  });

  test("get returns one artifact and rejects cross-org access", async () => {
    const caller = createCaller({
      repository: {
        getById() {
          return row({ orgId: OTHER_ORG_ID });
        },
      },
    });

    await expect(caller.artifacts.get({ id: ARTIFACT_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("upload stores metadata, returns row, and emits artifact.uploaded", async () => {
    const events: unknown[] = [];
    const caller = createCaller({
      repository: {
        create(input: unknown) {
          return row({
            filename: (input as { filename: string }).filename,
            mime: (input as { mime: string }).mime,
            path: (input as { path: string }).path,
          });
        },
      },
      storage: {
        reserve(input: unknown) {
          expect(input).toMatchObject({ orgId: ORG_ID, filename: "trace.json" });
          return { path: "local/manual/trace.json" };
        },
      },
      events: {
        record(event: unknown) {
          events.push(event);
        },
      },
    });

    const result = await caller.artifacts.upload({
      filename: "trace.json",
      mime: "application/json",
      sizeBytes: "128",
      runId: RUN_ID,
      taskId: TASK_ID,
      projectId: PROJECT_ID,
      metadataJson: { kind: "trace" },
    });

    expect(result.filename).toBe("trace.json");
    expect(result.sizeBytes).toBe("42");
    expect(events).toMatchObject([{
      orgId: ORG_ID,
      userId: USER_ID,
      verb: "artifact.uploaded",
      subjectKind: "artifact",
      subjectId: ARTIFACT_ID,
    }]);
  });

  test("download returns artifact metadata plus storage path", async () => {
    const caller = createCaller({
      repository: {
        getById() {
          return row();
        },
      },
      storage: {
        url(input: unknown) {
          expect(input).toEqual({ path: "local/proj/run/report.md" });
          return "file:///local/proj/run/report.md";
        },
      },
    });

    const result = await caller.artifacts.download({ id: ARTIFACT_ID });

    expect(result.artifact.id).toBe(ARTIFACT_ID);
    expect(result.url).toBe("file:///local/proj/run/report.md");
  });

  test("delete removes artifact and emits artifact.deleted", async () => {
    const deleted: string[] = [];
    const events: unknown[] = [];
    const caller = createCaller({
      repository: {
        getById() {
          return row();
        },
        delete(input: { id: string }) {
          deleted.push(input.id);
          return true;
        },
      },
      storage: {
        delete(path: string) {
          deleted.push(path);
        },
      },
      events: {
        record(event: unknown) {
          events.push(event);
        },
      },
    });

    const result = await caller.artifacts.delete({ id: ARTIFACT_ID });

    expect(result).toEqual({ ok: true, id: ARTIFACT_ID });
    expect(deleted).toEqual(["local/proj/run/report.md", ARTIFACT_ID]);
    expect(events).toMatchObject([{ verb: "artifact.deleted", subjectId: ARTIFACT_ID }]);
  });

  test("invalid upload input returns BAD_REQUEST-equivalent validation error", async () => {
    const caller = createCaller({ repository: {} });

    await expect(caller.artifacts.upload({
      filename: "",
      mime: "text/plain",
      sizeBytes: "-1",
    })).rejects.toBeInstanceOf(TRPCError);
  });

  test("procedures require authenticated context", async () => {
    const caller = createCaller({ authenticated: false });

    await expect(caller.artifacts.list({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
