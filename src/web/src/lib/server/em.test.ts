import { describe, expect, mock, test } from "bun:test";

describe("server entity manager helpers", () => {
  test("resolveDefaultOrgId delegates default org resolution to application auth", async () => {
    const candidates: Array<string | null | undefined> = [];

    mock.module("../../../../application/auth/org-context.ts", () => ({
      resolveOrgId: async (_manager: unknown, candidate: string | null | undefined) => {
        candidates.push(candidate);
        return "org-delegated";
      },
    }));

    const { resolveDefaultOrgId } = await import("./em.ts");

    await expect(resolveDefaultOrgId({} as never)).resolves.toBe("org-delegated");
    expect(candidates).toEqual(["default"]);
  });
});
