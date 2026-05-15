import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const REQUIRED_SERVER_TRPC_ROUTERS = [
  "notifications",
  "search",
  "orchestration",
  "repos",
  "connectors",
  "webhooks",
] as const;

describe("interface tRPC router completeness", () => {
  test.each([...REQUIRED_SERVER_TRPC_ROUTERS])("%s router exists in server tRPC surface", (domain) => {
    const candidates = [
      join("apps", "server", "src", "router", `${domain}.ts`),
      join("apps", "server", "src", "trpc", "routers", `${domain}.ts`),
      join("apps", "server", "src", "trpc", "routers", `${domain}.index.ts`),
    ];

    expect(candidates.some((candidate) => existsSync(candidate))).toBe(true);
  });
});
