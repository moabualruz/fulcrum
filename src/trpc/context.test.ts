import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";

import { createContext, requireTrpcEntityManager } from "./context.ts";

describe("tRPC context EntityManager resolver", () => {
  test("returns EntityManager from context", () => {
    const manager = { marker: "trpc-em" } as never;

    const ctx = createContext({
      session: null,
      orgId: null,
      userId: null,
      em: manager,
      container: null,
    });

    expect(requireTrpcEntityManager(ctx)).toBe(manager);
  });

  test("throws an internal tRPC error when EntityManager is missing", () => {
    const ctx = createContext({
      session: null,
      orgId: null,
      userId: null,
      em: null,
      container: null,
    });

    expect(() => requireTrpcEntityManager(ctx)).toThrow(TRPCError);
    expect(() => requireTrpcEntityManager(ctx)).toThrow("EntityManager could not be resolved.");
  });
});
