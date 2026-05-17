import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: string[] = [];

mock.module("$lib/server/request-service-scope", () => ({
  requestServiceScope: async (_locals: unknown, projectId: string | null) => {
    calls.push(`scope:${projectId ?? ""}`);
    return { em: {}, ctx: { orgId: "org-1", userId: "user-1", projectId } };
  },
}));

mock.module("@planning-review/interface/project-review-reports.ts", () => ({
  buildReviewWorkbenchModel: async (input: { projectId?: string; traceId?: string; reviewId?: string; selectedFilePath?: string }) => {
    calls.push(`model:${input.projectId ?? ""}:${input.traceId ?? ""}:${input.reviewId ?? ""}:${input.selectedFilePath ?? ""}`);
    return {
      summary: {
        fileCount: 2,
        annotationCount: 3,
        blockingAnnotationCount: 1,
      },
    };
  },
}));

beforeEach(() => {
  calls.splice(0, calls.length);
});

describe("/api/review/stream", () => {
  test("streams review lifecycle events through the planning-review interface", async () => {
    const mod = await import(`./+server.ts?cachebust=${Date.now()}`);
    const response = await mod.GET({
      url: new URL("http://localhost/api/review/stream?projectId=project-1&traceId=trace-1&reviewId=review-1&file=src/app.ts&lineStart=2&lineEnd=4"),
      locals: {},
    } as Parameters<typeof mod.GET>[0]);

    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const body = await response.text();
    expect(body).toContain("event: review-started");
    expect(body).toContain('"projectId":"project-1"');
    expect(body).toContain('"filePath":"src/app.ts"');
    expect(body).toContain("event: review-summary");
    expect(body).toContain('"blockers":1');
    expect(body).toContain("event: done");
    expect(calls).toEqual([
      "scope:project-1",
      "model:project-1:trace-1:review-1:src/app.ts",
    ]);
  });

  test("returns an SSE error when projectId is missing", async () => {
    const mod = await import(`./+server.ts?cachebust=${Date.now() + 1}`);
    const response = await mod.GET({
      url: new URL("http://localhost/api/review/stream"),
      locals: {},
    } as Parameters<typeof mod.GET>[0]);

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("projectId required");
  });
});
