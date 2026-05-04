import { describe, expect, test } from "bun:test";

type LoadEvent = Parameters<typeof import("./+page.server.ts").load>[0];

const taskId = "task-123";

function trpcResponse(payload: unknown): Response {
  return new Response(JSON.stringify({ result: { data: { json: payload } } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("/context/preview +page.server.ts load()", () => {
  test("calls context.preview with the task id and returns the bundle", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const preview = {
      bundle: {
        taskId,
        tokenBudget: 100,
        tokenCount: 75,
        slices: {
          memories: { tokenCount: 10, content: "Memory content" },
          linkedDocs: { tokenCount: 20, content: "Linked doc content" },
          recentRuns: { tokenCount: 15, content: "Run content" },
          repoState: { tokenCount: 5, content: "" },
          skillPrompts: { tokenCount: 25, content: "Skill prompt content" },
        },
      },
      snapshotId: null,
    };
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      url: new URL(`http://localhost/context/preview?task=${taskId}`),
      fetch: async (url, init) => {
        calls.push({ url: String(url), init });
        return trpcResponse(preview);
      },
    } as LoadEvent);

    expect(result.taskId).toBe(taskId);
    expect(result.preview).toEqual(preview);
    expect(result.errorMessage).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("/api/trpc/context.preview");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ json: { taskId } }));
  });

  test("returns a missing task error without calling tRPC", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    let called = false;
    const result = await mod.load({
      url: new URL("http://localhost/context/preview"),
      fetch: async () => {
        called = true;
        return trpcResponse({});
      },
    } as LoadEvent);

    expect(called).toBe(false);
    expect(result.taskId).toBeNull();
    expect(result.preview).toBeNull();
    expect(result.errorMessage).toBe("Add ?task=<id> to preview assembled context.");
  });
});
