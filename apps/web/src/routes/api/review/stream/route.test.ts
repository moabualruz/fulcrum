import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

// The `/api/review/stream` route is a pure invocation layer: it builds a
// workflow-API client via `createWebWorkflowApiCaller` and streams the review
// workbench model the public API returns. This suite mocks that client seam —
// no in-process database, no service-interface imports.
const calls: string[] = [];
let suiteActive = false;

mock.module("$lib/server/workflow-api", () => ({
  // `mock.module` is process-global; answer only while this suite is active so
  // foreign suites get the real client.
  createWebWorkflowApiCaller: () =>
    suiteActive
      ? {
          reports: {
            loadReviewWorkbenchSession: async (input: {
              projectId?: string;
              traceId?: string;
              reviewId?: string;
              selectedFilePath?: string;
            }) => {
              calls.push(
                `load:${input.projectId ?? ""}:${input.traceId ?? ""}:${input.reviewId ?? ""}:${input.selectedFilePath ?? ""}`,
              );
              if (input.reviewId === "missing-review") throw new Error("Review session not found.");
              return {
                revision: 7,
                model: {
                  summary: { fileCount: 4, annotationCount: 5, blockingAnnotationCount: 2 },
                },
              };
            },
            reviewWorkbench: async (input: {
              projectId?: string;
              traceId?: string;
              reviewId?: string;
              selectedFilePath?: string;
            }) => {
              calls.push(
                `preview:${input.projectId ?? ""}:${input.traceId ?? ""}:${input.reviewId ?? ""}:${input.selectedFilePath ?? ""}`,
              );
              return {
                summary: { fileCount: 2, annotationCount: 3, blockingAnnotationCount: 1 },
              };
            },
          },
        }
      : null,
}));

function reviewEvent(query: string) {
  return {
    url: new URL(`http://localhost/api/review/stream${query}`),
    locals: {},
    fetch,
    request: new Request(`http://localhost/api/review/stream${query}`),
  };
}

beforeEach(() => {
  calls.splice(0, calls.length);
});

describe("/api/review/stream", () => {
  beforeAll(() => {
    suiteActive = true;
  });
  afterAll(() => {
    suiteActive = false;
  });

  test("streams persisted review sessions through the workflow public API", async () => {
    const mod = await import(`./+server.ts?cachebust=${Date.now()}`);
    const response = await mod.GET(
      reviewEvent(
        "?projectId=project-1&traceId=trace-1&reviewId=review-1&file=src/app.ts&lineStart=2&lineEnd=4",
      ) as Parameters<typeof mod.GET>[0],
    );

    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const body = await response.text();
    expect(body).toContain("event: review-started");
    const firstEvent = JSON.parse(body.match(/^data: (.*)$/m)?.[1] ?? "{}");
    expect(firstEvent).toMatchObject({
      type: "review-started",
      traceId: "trace-1",
      payload: { projectId: "project-1", traceId: "trace-1", persisted: true },
    });
    expect(body).toContain('"projectId":"project-1"');
    expect(body).toContain('"filePath":"src/app.ts"');
    expect(body).toContain('"persisted":true');
    expect(body).toContain('"revision":7');
    expect(body).toContain("event: review-summary");
    expect(body).toContain('"files":4');
    expect(body).toContain('"annotations":5');
    expect(body).toContain('"blockers":2');
    expect(body).toContain("event: done");
    expect(calls).toEqual(["load:project-1:trace-1:review-1:src/app.ts"]);
  });

  test("streams draft previews when no persisted session is requested", async () => {
    const mod = await import(`./+server.ts?cachebust=${Date.now() + 1}`);
    const response = await mod.GET(
      reviewEvent("?projectId=project-1&file=src/app.ts") as Parameters<typeof mod.GET>[0],
    );

    const body = await response.text();
    expect(body).toContain('"persisted":false');
    expect(body).toContain('"blockers":1');
    expect(calls).toEqual(["preview:project-1:::src/app.ts"]);
  });

  test("returns an SSE error when a requested persisted session is missing", async () => {
    const mod = await import(`./+server.ts?cachebust=${Date.now() + 2}`);
    const response = await mod.GET(
      reviewEvent("?projectId=project-1&reviewId=missing-review") as Parameters<typeof mod.GET>[0],
    );

    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).toContain("event: error");
    expect(body).toContain('"type":"error"');
    expect(body).toContain("Review session not found.");
    expect(calls).toEqual(["load:project-1::missing-review:"]);
  });

  test("returns an SSE error when projectId is missing", async () => {
    const mod = await import(`./+server.ts?cachebust=${Date.now() + 3}`);
    const response = await mod.GET(reviewEvent("") as Parameters<typeof mod.GET>[0]);

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("projectId required");
  });
});
