import { describe, expect, mock, test } from "bun:test";

// `phase-09.5` removed the web-local `lib/server/em.ts` shim; the default-org
// resolver it exposed now lives in the identity-access service as
// `resolveDefaultOrgId` (`@identity-access/application/auth/default-org.ts`).
// This test pins the same delegation contract against the real module.

describe("identity-access default-org resolver", () => {
  test("resolveDefaultOrgId delegates default org resolution to org-context", async () => {
    const candidates: Array<string | null | undefined> = [];

    mock.module("@identity-access/application/auth/org-context.ts", () => ({
      resolveOrgId: async (_manager: unknown, candidate: string | null | undefined) => {
        candidates.push(candidate);
        return "org-delegated";
      },
    }));

    const { resolveDefaultOrgId } = await import(
      `@identity-access/application/auth/default-org.ts?cachebust=${Date.now()}`
    );

    await expect(resolveDefaultOrgId({} as never)).resolves.toBe("org-delegated");
    expect(candidates).toEqual(["default"]);
  });
});
