import { randomUUID } from "node:crypto";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { EntityManager } from "typeorm";

import { assertArtifactPathInRoot, resolveArtifactStoreRoot } from "@workflow-coordination/infrastructure/artifacts/storage.ts";
import { AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import { appendEventOrm } from "@platform-core/application/orm-helpers.ts";
import type {
  AppContext,
  GeneratedE2eRegressionRunner,
  GeneratedE2eRegressionRunOutput,
  RunGeneratedE2eRegressionTestsInput,
} from "@planning-review/domain/review-acceptance.ts";

interface GeneratedE2eArtifactRow {
  id: string;
  path: string | null;
  body_path: string | null;
}

interface GeneratedE2eRunnerPlan {
  runner: GeneratedE2eRegressionRunner;
  command: string[];
  cwd?: string;
  ciCommand: string[];
  ciEnv: Record<string, string>;
}

export async function runGeneratedE2eRegressionTests(
  em: EntityManager,
  ctx: AppContext,
  input: RunGeneratedE2eRegressionTestsInput,
): Promise<GeneratedE2eRegressionRunOutput> {
  const runner = input.runner ?? "bun";
  const rows = await loadGeneratedE2eArtifacts(em, ctx, input);
  if (rows.length === 0) {
    throw new AppNotFoundError("No accepted generated UAT E2E regression tests were found.");
  }

  const artifactRoot = resolveArtifactStoreRoot();
  const traceId = input.traceId ?? null;
  const runId = generatedE2eRunId(input.projectId, traceId, runner);
  const testFiles = await materializeGeneratedE2eRunSpecs(artifactRoot, runId, rows);
  const plan = buildGeneratedE2eRunnerPlan(runner, testFiles);
  let stdout = "";
  let stderr = "";
  let exitCode: number | null = null;
  let status: GeneratedE2eRegressionRunOutput["status"] = "planned";
  if (!input.planOnly) {
    const proc = Bun.spawn(plan.command, { stdout: "pipe", stderr: "pipe", cwd: plan.cwd });
    [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    status = exitCode === 0 ? "passed" : "failed";
  }
  await upsertGeneratedE2eRun(em, ctx, input, runId, runner, status);
  const generatedSpecArtifactIds = await insertGeneratedE2eSpecArtifacts(
    em,
    ctx,
    input,
    runId,
    runner,
    rows,
    testFiles,
  );
  const event = await appendEventOrm(em, {
    orgId: ctx.orgId,
    projectId: input.projectId,
    actor: ctx.userId ?? "system",
    subjectKind: "project",
    subjectId: input.projectId,
    verb: "generated_e2e_regression_run_completed",
    payload: {
      traceId: input.traceId ?? null,
      runner,
      status,
      command: plan.command,
      cwd: plan.cwd ?? null,
      testFiles,
      artifactIds: rows.map((row) => row.id),
      exitCode,
      ciCommand: plan.ciCommand,
      ciEnv: plan.ciEnv,
      runId,
      generatedSpecArtifactIds,
    },
  });
  await appendEventOrm(em, {
    orgId: ctx.orgId,
    projectId: input.projectId,
    actor: ctx.userId ?? "system",
    subjectKind: "agent_run",
    subjectId: runId,
    verb: "generated_e2e_regression_run_completed",
    payload: {
      traceId,
      runner,
      status,
      command: plan.command,
      cwd: plan.cwd ?? null,
      testFiles,
      artifactIds: rows.map((row) => row.id),
      generatedSpecArtifactIds,
      exitCode,
      ciCommand: plan.ciCommand,
      ciEnv: plan.ciEnv,
    },
  });
  return {
    projectId: input.projectId,
    ...(input.traceId ? { traceId: input.traceId } : {}),
    runId,
    runner,
    status,
    command: plan.command,
    ...(plan.cwd ? { cwd: plan.cwd } : {}),
    testFiles,
    artifactIds: rows.map((row) => row.id),
    generatedSpecArtifactIds,
    stdout,
    stderr,
    exitCode,
    ciCommand: plan.ciCommand,
    ciEnv: plan.ciEnv,
    eventId: event.id,
  };
}

export function buildGeneratedE2eRunnerPlan(
  runner: GeneratedE2eRegressionRunner,
  testFiles: string[],
): GeneratedE2eRunnerPlan {
  const ciCommand = ["bun", "run", "scripts/ci-generated-e2e.ts"];
  const ciEnv = {
    FULCRUM_GENERATED_E2E_RUNNER: runner,
    FULCRUM_GENERATED_E2E_FILES: testFiles.join(":"),
  };
  if (runner === "playwright") {
    return {
      runner,
      command: ["bun", "run", "web:e2e:generated", "--", ...testFiles],
      cwd: "apps/web",
      ciCommand,
      ciEnv,
    };
  }
  return {
    runner,
    command: ["bun", "test", ...testFiles],
    ciCommand,
    ciEnv,
  };
}

export interface GeneratedE2eRunHistoryEntry {
  eventId: string;
  createdAt: string;
  runner: string;
  status: string;
  testFileCount: number;
  exitCode: number | null;
  traceId: string | null;
  durationMs?: number;
}

export async function listGeneratedE2eRunHistory(
  em: EntityManager,
  ctx: AppContext,
  input: { projectId: string; limit?: number },
): Promise<GeneratedE2eRunHistoryEntry[]> {
  const limit = input.limit ?? 20;
  const rows = await em.query(
    `select id as "eventId", created_at as "createdAt", payload_json as payload
       from audit_events
      where org_id = ?
        and payload_json->>'verb' = 'generated_e2e_regression_run_completed'
        and (subject_id = ? or payload_json->>'projectId' = ?)
      order by created_at desc
      limit ?`,
    [ctx.orgId, input.projectId, input.projectId, limit],
  );
  return rows.map((row: { eventId: string; createdAt: string; payload: string | Record<string, unknown> }) => {
    const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    return {
      eventId: row.eventId,
      createdAt: row.createdAt,
      runner: payload.runner ?? "bun",
      status: payload.status ?? "unknown",
      testFileCount: Array.isArray(payload.testFiles) ? payload.testFiles.length : 0,
      exitCode: payload.exitCode ?? null,
      traceId: payload.traceId ?? null,
    };
  });
}

async function loadGeneratedE2eArtifacts(
  em: EntityManager,
  ctx: AppContext,
  input: RunGeneratedE2eRegressionTestsInput,
): Promise<GeneratedE2eArtifactRow[]> {
  const runner = input.runner ?? "bun";
  const params: string[] = [ctx.orgId, input.projectId];
  const traceFilter = input.traceId ? "and metadata_json->>'traceId' = ?" : "";
  if (input.traceId) params.push(input.traceId);
  const runnerFilter = runner === "bun"
    ? "and coalesce(metadata_json->>'runner', 'bun') = 'bun'"
    : "and metadata_json->>'runner' = 'playwright'";
  return await em.query(`select id, path, body_path
       from artifacts
      where org_id = ?
        and project_id = ?
        and metadata_json->>'generatedBy' = 'uat_code_review_approval'
        and metadata_json->>'lifecycleState' = 'accepted'
        ${runnerFilter}
        ${traceFilter}
      order by created_at asc, id asc`, params, );
}

function generatedE2eRunId(
  _projectId: string,
  _traceId: string | null,
  _runner: GeneratedE2eRegressionRunner,
): string {
  return randomUUID();
}

async function materializeGeneratedE2eRunSpecs(
  artifactRoot: string,
  runId: string,
  rows: GeneratedE2eArtifactRow[],
): Promise<string[]> {
  const directory = join(artifactRoot, "generated-e2e-runs", runId);
  await mkdir(directory, { recursive: true });
  const testFiles: string[] = [];
  for (const row of rows) {
    if (!row.body_path) {
      throw new AppValidationError(`Generated E2E artifact ${row.id} has no body_path.`);
    }
    const sourcePath = assertArtifactPathInRoot(artifactRoot, row.body_path);
    const filename = safeGeneratedE2eFilename(row.path ?? row.body_path ?? `${row.id}.spec.ts`);
    const destinationPath = join(directory, filename);
    await copyFile(sourcePath, destinationPath);
    testFiles.push(destinationPath);
  }
  return testFiles;
}

async function upsertGeneratedE2eRun(
  em: EntityManager,
  ctx: AppContext,
  input: RunGeneratedE2eRegressionTestsInput,
  runId: string,
  runner: GeneratedE2eRegressionRunner,
  status: GeneratedE2eRegressionRunOutput["status"],
): Promise<void> {
  const runStatus = status === "passed" ? "succeeded" : status === "failed" ? "failed" : "queued";
  const columns = await tableColumns(em, "agent_runs");
  const names = ["id", "org_id"];
  const values: unknown[] = [runId, ctx.orgId];
  if (columns.has("project_id")) {
    names.push("project_id");
    values.push(input.projectId);
  }
  names.push(columns.has("agent") ? "agent" : "agent_name");
  values.push("generated-e2e");
  if (columns.has("model")) {
    names.push("model");
    values.push(runner);
  } else if (columns.has("agent_version")) {
    names.push("agent_version");
    values.push(runner);
  }
  if (columns.has("prompt")) {
    names.push("prompt");
    values.push("Generated UAT regression E2E");
  } else if (columns.has("thread_id")) {
    names.push("thread_id");
    values.push(`generated-e2e:${runId}`);
  }
  names.push("status");
  values.push(runStatus);
  if (columns.has("started_at")) {
    names.push("started_at");
    values.push(new Date());
  }
  if (columns.has("created_at")) {
    names.push("created_at");
    values.push(new Date());
  }
  if (columns.has("ended_at")) {
    names.push("ended_at");
    values.push(runStatus === "queued" ? null : new Date());
  }
  const placeholders = names.map(() => "?").join(", ");
  const updates = [
    "status = excluded.status",
    ...(columns.has("ended_at") ? ["ended_at = excluded.ended_at"] : []),
  ].join(", ");
  await em.query(
    `insert into agent_runs (${names.join(", ")})
     values (${placeholders})
     on conflict (id) do update set ${updates}`,
    values,
  );
}

async function insertGeneratedE2eSpecArtifacts(
  em: EntityManager,
  ctx: AppContext,
  input: RunGeneratedE2eRegressionTestsInput,
  runId: string,
  runner: GeneratedE2eRegressionRunner,
  rows: GeneratedE2eArtifactRow[],
  testFiles: string[],
): Promise<string[]> {
  const generatedSpecArtifactIds: string[] = [];
  for (const [index, filePath] of testFiles.entries()) {
    const fileStat = await stat(filePath);
    const artifactId = randomUUID();
    await em.query(
      `insert into artifacts
        (id, org_id, project_id, run_id, kind, title, filename, path, body_path, mime, size_bytes, metadata_json, created_at)
       values (?, ?, ?, ?, 'generated-e2e-spec', ?, ?, ?, ?, 'text/typescript', ?, ?::jsonb, now())
       on conflict (id) do update set
         path = excluded.path,
         body_path = excluded.body_path,
         size_bytes = excluded.size_bytes,
         metadata_json = excluded.metadata_json`,
      [
        artifactId,
        ctx.orgId,
        input.projectId,
        runId,
        `Generated E2E spec ${index + 1}`,
        basename(filePath),
        filePath,
        filePath,
        fileStat.size,
        JSON.stringify({
          lifecycleState: "created",
          previewKind: "playwright-spec",
          runner,
          traceId: input.traceId ?? null,
          sourceArtifactId: rows[index]?.id ?? null,
          sourceArtifactIds: rows.map((row) => row.id),
        }),
      ],
    );
    generatedSpecArtifactIds.push(artifactId);
  }
  return generatedSpecArtifactIds;
}

function safeGeneratedE2eFilename(value: string): string {
  const safe = basename(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!safe) return "generated.spec.ts";
  return safe.endsWith(".ts") ? safe : `${safe}.ts`;
}

async function tableColumns(em: EntityManager, tableName: string): Promise<Set<string>> {
  const rows = await em.query(
    `select column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = ?`,
    [tableName],
  ) as Array<{ column_name: string }>;
  return new Set(rows.map((row) => row.column_name));
}
