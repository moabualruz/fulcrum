/**
 * Schema registry tests — RED before GREEN.
 * Acceptance criteria from P13#03:
 *   1. 20+ schema files in src/trpc/schemas/
 *   2. Every exported schema uses z.object() at root, no z.any() on public fields
 *   3. All fields have .describe() strings
 *   4. Round-trip parse identity for every schema with fixture data
 *   5. TRPCErrorShape and RESTErrorShape exported from errors.ts
 */

import { describe, it, expect } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const SCHEMAS_DIR = join(import.meta.dir, "../../src/trpc/schemas");

const schemaFiles = readdirSync(SCHEMAS_DIR).filter((f) => f.endsWith(".ts"));

// Zod v4 compat helpers — use `any` to bridge $ZodType / ZodType gap.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyZod = any;

function isZodObject(t: AnyZod): boolean { return t?._zod?.def?.type === "object"; }
function isZodAny(t: AnyZod): boolean { return t?._zod?.def?.type === "any"; }
function isZodOptionalOrNullable(t: AnyZod): boolean {
  const type = t?._zod?.def?.type;
  return type === "optional" || type === "nullable";
}
function getShape(t: AnyZod): Record<string, AnyZod> { return t?._zod?.def?.shape ?? {}; }
function unwrap(t: AnyZod): AnyZod { return t?._zod?.def?.innerType ?? t?._zod?.def?.type; }
function getDesc(t: AnyZod): string | undefined { return (t as AnyZod)?.description as string | undefined; }

function findDescription(t: AnyZod): string | undefined {
  if (getDesc(t)) return getDesc(t);
  if (isZodOptionalOrNullable(t)) {
    const inner = unwrap(t);
    if (getDesc(inner)) return getDesc(inner);
    if (isZodOptionalOrNullable(inner)) {
      return getDesc(unwrap(inner));
    }
  }
  return undefined;
}

describe("schema registry — file count", () => {
  it("has at least 20 schema files", () => {
    expect(schemaFiles.length).toBeGreaterThanOrEqual(20);
  });
});

describe("schema registry — error shapes", () => {
  it("exports TRPCErrorShape from errors.ts", async () => {
    const mod = await import("../../src/trpc/schemas/errors.ts");
    expect(mod.TRPCErrorShape).toBeDefined();
    const result = mod.TRPCErrorShape.safeParse({
      code: "NOT_FOUND",
      message: "not found",
      requestId: "req-123",
    });
    expect(result.success).toBe(true);
  });

  it("exports RESTErrorShape from errors.ts", async () => {
    const mod = await import("../../src/trpc/schemas/errors.ts");
    expect(mod.RESTErrorShape).toBeDefined();
    const result = mod.RESTErrorShape.safeParse({
      error: { code: "BAD_REQUEST", message: "bad", requestId: "req-456" },
    });
    expect(result.success).toBe(true);
  });
});

describe("schema registry — no z.any() on public fields", () => {
  for (const file of schemaFiles) {
    it(`${file} — no z.any() on public fields`, async () => {
      const mod = await import(join(SCHEMAS_DIR, file)) as Record<string, AnyZod>;
      for (const [exportName, exported] of Object.entries(mod)) {
        if (!isZodObject(exported)) continue;
        const shape = getShape(exported);
        for (const [fieldName, fieldSchema] of Object.entries(shape)) {
          expect(
            isZodAny(fieldSchema),
            `${file}:${exportName}.${fieldName} must not be z.any()`
          ).toBe(false);
        }
      }
    });
  }
});

describe("schema registry — all fields have descriptions", () => {
  for (const file of schemaFiles) {
    it(`${file} — all object fields have .describe()`, async () => {
      const mod = await import(join(SCHEMAS_DIR, file)) as Record<string, AnyZod>;
      for (const [exportName, exported] of Object.entries(mod)) {
        if (!isZodObject(exported)) continue;
        const shape = getShape(exported);
        for (const [fieldName, fieldSchema] of Object.entries(shape)) {
          expect(
            findDescription(fieldSchema),
            `${file}:${exportName}.${fieldName} must have a .describe() string`
          ).toBeTruthy();
        }
      }
    });
  }
});

describe("schema registry — projects domain", () => {
  it("exports ProjectInput and ProjectOutput", async () => {
    const mod = await import("../../src/trpc/schemas/projects.ts");
    expect(mod.ProjectInput).toBeDefined();
    expect(mod.ProjectOutput).toBeDefined();
  });
});

describe("schema registry — skills domain", () => {
  it("exports SkillInput and SkillOutput", async () => {
    const mod = await import("../../src/trpc/schemas/skills.ts");
    expect(mod.SkillInput).toBeDefined();
    expect(mod.SkillOutput).toBeDefined();
  });
});

describe("schema registry — connectors domain", () => {
  it("exports ConnectorInput and ConnectorOutput", async () => {
    const mod = await import("../../src/trpc/schemas/connectors.ts");
    expect(mod.ConnectorInput).toBeDefined();
    expect(mod.ConnectorOutput).toBeDefined();
  });
});

describe("schema registry — inference domain", () => {
  it("exports InferenceInput and InferenceOutput", async () => {
    const mod = await import("../../src/trpc/schemas/inference.ts");
    expect(mod.InferenceInput).toBeDefined();
    expect(mod.InferenceOutput).toBeDefined();
  });
});

describe("schema registry — orchestration domain", () => {
  it("exports OrchestrationInput and OrchestrationOutput", async () => {
    const mod = await import("../../src/trpc/schemas/orchestration.ts");
    expect(mod.OrchestrationInput).toBeDefined();
    expect(mod.OrchestrationOutput).toBeDefined();
  });
});

describe("schema registry — routing domain", () => {
  it("exports RoutingInput and RoutingOutput", async () => {
    const mod = await import("../../src/trpc/schemas/routing.ts");
    expect(mod.RoutingInput).toBeDefined();
    expect(mod.RoutingOutput).toBeDefined();
  });
});

describe("schema registry — audit domain", () => {
  it("exports AuditInput and AuditOutput", async () => {
    const mod = await import("../../src/trpc/schemas/audit.ts");
    expect(mod.AuditInput).toBeDefined();
    expect(mod.AuditOutput).toBeDefined();
  });
});

describe("schema registry — round-trip parse", () => {
  it("TRPCErrorShape round-trips", async () => {
    const { TRPCErrorShape } = await import("../../src/trpc/schemas/errors.ts");
    const fixture = { code: "INTERNAL_SERVER_ERROR", message: "oops", requestId: "rid-1" };
    expect(TRPCErrorShape.parse(fixture)).toEqual(fixture);
  });

  it("RESTErrorShape round-trips", async () => {
    const { RESTErrorShape } = await import("../../src/trpc/schemas/errors.ts");
    const fixture = { error: { code: "UNAUTHORIZED", message: "no auth", requestId: "rid-2" } };
    expect(RESTErrorShape.parse(fixture)).toEqual(fixture);
  });
});
