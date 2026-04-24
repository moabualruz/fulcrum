import { expect, test } from "@playwright/test";

test("release acceptance operator review captures evidence and next action recognition", async ({
  page
}) => {
  await page.route("**/api/v1/runs/run_release", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "ok",
        data: {
          runId: "run_release",
          taskId: "task_release_validation",
          projectId: "proj_release",
          agentId: "adapter_validation",
          status: "completed",
          heartbeatState: "fresh",
          summary: "Release validation completed with next action: merge after operator approval",
          artifactIds: ["art_changed_files", "art_context_pack"],
          qualityGateIds: ["gate_fast"],
          policyDecisionIds: ["pol_sensitive_export_approved"]
        }
      })
    });
  });
  await page.route("**/api/v1/quality/gates?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "ok",
        data: [
          {
            gateId: "gate_fast",
            projectId: "proj_release",
            name: "fast",
            command: "pnpm test",
            required: true,
            createdAt: new Date(0).toISOString(),
            updatedAt: new Date(0).toISOString(),
            schemaVersion: "1.0"
          }
        ]
      })
    });
  });
  await page.route("**/api/v1/quality/results?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "ok",
        data: [
          {
            qualityGateResultId: "gate_result_fast",
            gateId: "gate_fast",
            projectId: "proj_release",
            runId: "run_release",
            status: "passed",
            parsedSummary: { exitCode: 0, stdoutLines: 1, stderrLines: 0, timedOut: false },
            redactionStatus: "not_applicable",
            createdAt: new Date(0).toISOString(),
            updatedAt: new Date(0).toISOString(),
            schemaVersion: "1.0"
          }
        ]
      })
    });
  });
  await page.route("**/api/v1/runs/run_release/events", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "ok",
        data: [
          {
            eventId: "evt_next_action",
            type: "run.completed",
            timestamp: new Date(0).toISOString(),
            severity: "info",
            payloadSummary: { message: "merge after operator approval" }
          }
        ]
      })
    });
  });

  await page.goto("/#/runs/run_release");

  await expect(page.getByRole("heading", { name: "Run Detail" })).toBeVisible();
  await expect(page.getByLabel("Run state")).toContainText("task_release_validation");
  await expect(page.getByLabel("Run state")).toContainText("adapter_validation");
  await expect(page.getByLabel("Run state")).toContainText("2");
  await expect(page.getByLabel("Run state")).toContainText("1");
  await expect(page.getByLabel("Quality gates")).toContainText("fast");
  await expect(page.getByLabel("Quality gates")).toContainText("passed");
  await expect(page.getByLabel("Live activity")).toContainText("merge after operator approval");
});
