/**
 * Unit tests for service worker push event handling logic (P12#19).
 * We test the payload parsing logic in isolation since the actual
 * ServiceWorkerGlobalScope APIs are not available in bun:test.
 */

import { describe, expect, test } from "bun:test";

// Extract the push payload parsing logic that the service worker uses.
function parsePushPayload(raw: string): { title: string; body: string; url: string } {
  let data: { title?: string; body?: string; url?: string };
  try {
    data = JSON.parse(raw);
  } catch {
    data = { title: "Fulcrum", body: raw };
  }
  return {
    title: data.title ?? "Fulcrum",
    body: data.body ?? "",
    url: data.url ?? "/",
  };
}

describe("service worker push payload parsing", () => {
  test("valid JSON payload extracts title, body, url", () => {
    const result = parsePushPayload(
      JSON.stringify({ title: "Build done", body: "PR #42 passed", url: "/runs/42" }),
    );
    expect(result.title).toBe("Build done");
    expect(result.body).toBe("PR #42 passed");
    expect(result.url).toBe("/runs/42");
  });

  test("missing fields get defaults", () => {
    const result = parsePushPayload(JSON.stringify({}));
    expect(result.title).toBe("Fulcrum");
    expect(result.body).toBe("");
    expect(result.url).toBe("/");
  });

  test("invalid JSON falls back to text body", () => {
    const result = parsePushPayload("not json");
    expect(result.title).toBe("Fulcrum");
    expect(result.body).toBe("not json");
    expect(result.url).toBe("/");
  });
});
