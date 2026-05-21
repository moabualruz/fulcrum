import { beforeEach, describe, expect, mock, test } from "bun:test";
import { planningReviewMock } from "$lib/test/planning-review-mock";

const calls: string[] = [];

mock.module("$lib/server/request-service-scope", () => ({
  requestServiceScope: async (_locals: unknown, projectId: string | null) => {
    calls.push(`scope:${projectId ?? ""}`);
    return { em: {}, ctx: { orgId: "org-1", userId: "user-1", projectId } };
  },
}));

mock.module("@planning-review/interface/project-review-reports.ts", () => planningReviewMock({
  buildReviewWorkbenchModel: async (input: { projectId?: string; traceId?: string; reviewId?: string; selectedFilePath?: string }) => {
    calls.push(`preview:${input.projectId ?? ""}:${input.traceId ?? ""}:${input.reviewId ?? ""}:${input.selectedFilePath ?? ""}`);
    return {
      summary: {
        fileCount: 2,
        annotationCount: 3,
        blockingAnnotationCount: 1,
      },
    };
  },
  loadReviewWorkbenchSession: async (_em: unknown, _ctx: unknown, input: { projectId?: string; traceId?: string; reviewId?: string; selectedFilePath?: string }) => {
    calls.push(`load:${input.projectId ?? ""}:${input.traceId ?? ""}:${input.reviewId ?? ""}:${input.selectedFilePath ?? ""}`);
    if (input.reviewId === "missing-review") throw new Error("Review session not found.");
    return {
      revision: 7,
      model: {
        summary: {
          fileCount: 4,
          annotationCount: 5,
          blockingAnnotationCount: 2,
        },
      },
    };
  },
}));

beforeEach(() => {
  calls.splice(0, calls.length);
});

describe("/api/review/stream", () => {
  test("streams persisted review sessions through the planning-review interface", async () => {
    const mod = await import(`./+server.ts?cachebust=${Date.now()}`);
    const response = await mod.GET({
      url: new URL("http://localhost/api/review/stream?projectId=project-1&traceId=trace-1&reviewId=review-1&file=src/app.ts&lineStart=2&lineEnd=4"),
      locals: {},
    } as Parameters<typeof mod.GET>[0]);

    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const body = await response.text();
    expect(body).toContain("event: review-started");
    const firstEvent = JSON.parse(body.match(/^data: (.*)$/m)?.[1] ?? "{}");
    expect(firstEvent).toMatchObject({
      type: "review-started",
      traceId: "trace-1",
      payload: {
        projectId: "project-1",
        traceId: "trace-1",
        persisted: true,
      },
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
    expect(calls).toEqual([
      "scope:project-1",
      "load:project-1:trace-1:review-1:src/app.ts",
    ]);
  });

  test("streams draft previews when no persisted session is requested", async () => {
    const mod = await import(`./+server.ts?cachebust=${Date.now() + 1}`);
    const response = await mod.GET({
      url: new URL("http://localhost/api/review/stream?projectId=project-1&file=src/app.ts"),
      locals: {},
    } as Parameters<typeof mod.GET>[0]);

    const body = await response.text();
    expect(body).toContain('"persisted":false');
    expect(body).toContain('"blockers":1');
    expect(calls).toEqual([
      "scope:project-1",
      "preview:project-1:::src/app.ts",
    ]);
  });

  test("returns an SSE error when a requested persisted session is missing", async () => {
    const mod = await import(`./+server.ts?cachebust=${Date.now() + 2}`);
    const response = await mod.GET({
      url: new URL("http://localhost/api/review/stream?projectId=project-1&reviewId=missing-review"),
      locals: {},
    } as Parameters<typeof mod.GET>[0]);

    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).toContain("event: error");
    expect(body).toContain('"type":"error"');
    expect(body).toContain("Review session not found.");
    expect(calls).toEqual([
      "scope:project-1",
      "load:project-1::missing-review:",
    ]);
  });

  test("returns an SSE error when projectId is missing", async () => {
    const mod = await import(`./+server.ts?cachebust=${Date.now() + 3}`);
    const response = await mod.GET({
      url: new URL("http://localhost/api/review/stream"),
      locals: {},
    } as Parameters<typeof mod.GET>[0]);

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("projectId required");
  });
});
