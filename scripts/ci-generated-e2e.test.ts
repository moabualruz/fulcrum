import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("ci generated E2E runner", () => {
  test("runs generated tests and writes trace-linked report", async () => {
    const root = await makeTempRoot();
    const specPath = join(root, "generated-pass.test.ts");
    const reportPath = join(root, "report.json");
    await writeFile(specPath, generatedSpec({ shouldPass: true }), "utf8");

    const result = await runGeneratedE2e(specPath, reportPath);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("generated:e2e report=");
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    expect(report.status).toBe("passed");
    expect(report.traceLinks[0]).toMatchObject({
      traceId: "trace-generated-ci",
      projectId: "project-generated-ci",
      taskIds: ["task-generated-ci"],
      runIds: ["run-generated-ci"],
      artifactIds: ["artifact-generated-ci"],
      criteria: ["accepted workflow executes with real trace data"],
    });
  });

  test("reports actionable failure output for broken criteria", async () => {
    const root = await makeTempRoot();
    const specPath = join(root, "generated-fail.test.ts");
    const reportPath = join(root, "report.json");
    await writeFile(specPath, generatedSpec({ shouldPass: false }), "utf8");

    const result = await runGeneratedE2e(specPath, reportPath);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("generated:e2e failed exit=1");
    expect(result.stderr).toContain("next: open report, inspect traceLinks");
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    expect(report.status).toBe("failed");
    expect(report.exitCode).toBe(1);
    expect(report.traceLinks[0].criteria).toEqual(["accepted workflow executes with real trace data"]);
  });
});

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fulcrum-generated-e2e-test-"));
  tempRoots.push(root);
  return root;
}

async function runGeneratedE2e(specPath: string, reportPath: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "run", "scripts/ci-generated-e2e.ts"], {
    env: {
      ...process.env,
      FULCRUM_GENERATED_E2E_RUNNER: "bun",
      FULCRUM_GENERATED_E2E_FILES: specPath,
      FULCRUM_GENERATED_E2E_REPORT: reportPath,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

function generatedSpec(input: { shouldPass: boolean }): string {
  const expectedCriteria = input.shouldPass
    ? '["accepted workflow executes with real trace data"]'
    : '["different criterion"]';
  return [
    'import { describe, expect, test } from "bun:test";',
    "",
    `const acceptedTrace = ${JSON.stringify({
      traceId: "trace-generated-ci",
      projectId: "project-generated-ci",
      task: {
        id: "task-generated-ci",
        title: "Generated CI proof",
        successCriteria: ["accepted workflow executes with real trace data"],
        artifactIds: ["artifact-generated-ci"],
        runIds: ["run-generated-ci"],
      },
      coverageCases: [{
        id: "task-generated-ci:1",
        taskId: "task-generated-ci",
        taskTitle: "Generated CI proof",
        criterion: "accepted workflow executes with real trace data",
        artifactIds: ["artifact-generated-ci"],
        runIds: ["run-generated-ci"],
        latestReviewEventId: "event-generated-ci",
      }],
      manualSimulationChecklist: {
        status: "approved",
        steps: [{ expectedObservation: "accepted workflow executes with real trace data" }],
      },
      scenarioData: {
        evidenceArtifactIds: ["artifact-generated-ci"],
        evidenceRunIds: ["run-generated-ci"],
      },
      mockPolicy: { usesMocks: false, impossibilityReason: null },
    }, null, 2)} as const;`,
    "",
    'describe("generated proof", () => {',
    '  test("covers accepted criteria", () => {',
    `    expect(acceptedTrace.coverageCases.map((coverage) => coverage.criterion)).toEqual(${expectedCriteria});`,
    "  });",
    "});",
    "",
  ].join("\n");
}
