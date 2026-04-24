import { expect, test } from "@playwright/test";

test("review and merge readiness queues expose cockpit actions", async ({ page }) => {
  await page.route("**/api/v1/queues/review", async (route) => {
    await route.fulfill({
      json: {
        status: "ok",
        data: [
          {
            taskId: "task_review",
            projectId: "proj_review",
            title: "Review delivery",
            status: "review",
            labels: ["quality"]
          }
        ]
      }
    });
  });
  await page.route("**/api/v1/queues/merge", async (route) => {
    await route.fulfill({
      json: {
        status: "ok",
        data: [
          {
            taskId: "task_merge",
            projectId: "proj_review",
            title: "Merge delivery",
            status: "review",
            labels: ["merge"]
          }
        ]
      }
    });
  });
  await page.route("**/api/v1/tasks/*/transition", async (route) => {
    await route.fulfill({ json: { status: "ok", data: {} } });
  });

  await page.goto("/#/review-queue");

  await expect(page.getByRole("heading", { name: "Review Queue" })).toBeVisible();
  await expect(page.getByLabel("Review readiness")).toContainText("Review delivery");
  await expect(page.getByLabel("Merge readiness")).toContainText("Merge delivery");
  await page.getByRole("button", { name: "Mark merge ready" }).click();
  await expect(page.getByLabel("Review readiness")).toContainText("Status: completed");
});

test("run controls and live activity support supervision", async ({ page }) => {
  await page.route("**/api/v1/runs/run_supervised", async (route) => {
    await route.fulfill({
      json: {
        status: "ok",
        data: {
          runId: "run_supervised",
          taskId: "task_review",
          projectId: "proj_review",
          agentId: "agent_codex",
          status: "running",
          heartbeatState: "fresh",
          artifactIds: [],
          qualityGateIds: [],
          policyDecisionIds: []
        }
      }
    });
  });
  await page.route("**/api/v1/quality/**", async (route) => {
    await route.fulfill({ json: { status: "ok", data: [] } });
  });
  await page.route("**/api/v1/runs", async (route) => {
    await route.fulfill({ json: { status: "ok", data: { runId: "run_new" } } });
  });
  await page.route("**/api/v1/runs/run_supervised/cancel", async (route) => {
    await route.fulfill({ json: { status: "ok", data: { status: "cancel_requested" } } });
  });
  await page.route("**/api/v1/runs/run_supervised/events", async (route) => {
    await route.fulfill({
      json: {
        status: "ok",
        data: [
          {
            eventId: "evt_tail",
            type: "run.heartbeat",
            timestamp: new Date(0).toISOString(),
            payloadSummary: { message: "tail updated" }
          }
        ]
      }
    });
  });

  await page.goto("/#/runs/run_supervised");
  await page.getByRole("button", { name: "Start run" }).click();
  await expect(page.getByText("Run start requested")).toBeVisible();
  await page.getByRole("button", { name: "Cancel run" }).click();
  await expect(page.getByText("Run cancel requested")).toBeVisible();
  await expect(page.getByLabel("Live activity")).toContainText("Activity polling active");
  await expect(page.getByLabel("Live activity")).toContainText("tail updated");
});
