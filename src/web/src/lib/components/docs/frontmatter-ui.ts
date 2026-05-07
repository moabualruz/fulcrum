import { parse, stringify } from "yaml";
import { z } from "zod";

import { FrontmatterSchemaMap } from "../../../../../docs/frontmatter-schemas.ts";
import type { DocType } from "../../../../../domain/docs/enums.ts";

export type FrontmatterValue = Record<string, unknown>;

export type FrontmatterField =
  | { name: string; type: "string"; required: boolean }
  | { name: string; type: "array"; required: boolean }
  | { name: string; type: "enum"; required: boolean; options: string[] };

export type FrontmatterValidation =
  | { success: true; value: FrontmatterValue; errors: Record<string, string[]>; missingRequired: string[] }
  | { success: false; errors: Record<string, string[]>; missingRequired: string[] };

export type FrontmatterYamlResult =
  | { ok: true; value: FrontmatterValue }
  | { ok: false; value: FrontmatterValue; error: string };

type ZodShape = Record<string, z.ZodType<unknown>>;

function shapeFor(docType: DocType): ZodShape {
  const schema = FrontmatterSchemaMap[docType];
  const def = schema._def as { shape?: ZodShape | (() => ZodShape) };
  return typeof def.shape === "function" ? def.shape() : (def.shape ?? {});
}

function fieldType(schema: z.ZodType<unknown>): FrontmatterField["type"] {
  const def = schema._def as { type?: string };
  if (def.type === "enum") return "enum";
  if (def.type === "array") return "array";
  return "string";
}

function enumOptions(schema: z.ZodType<unknown>): string[] {
  const def = schema._def as { entries?: Record<string, string>; values?: string[] };
  if (def.values) return [...def.values];
  return Object.values(def.entries ?? {});
}

export function getFrontmatterFields(docType: DocType): FrontmatterField[] {
  if (!FrontmatterSchemaMap[docType]) return [];
  return Object.entries(shapeFor(docType)).map(([name, schema]) => {
    const type = fieldType(schema);
    const base = { name, required: !schema.safeParse(undefined).success };
    if (type === "enum") return { ...base, type, options: enumOptions(schema) };
    return { ...base, type };
  });
}

export function validateFrontmatter(docType: DocType, value: FrontmatterValue): FrontmatterValidation {
  if (!FrontmatterSchemaMap[docType]) {
    return { success: true, value, errors: {}, missingRequired: [] };
  }
  const parsed = FrontmatterSchemaMap[docType].safeParse(value);
  if (parsed.success) {
    return { success: true, value: parsed.data as FrontmatterValue, errors: {}, missingRequired: [] };
  }

  const errors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "");
    if (!key) continue;
    errors[key] = [...(errors[key] ?? []), issue.message];
  }

  const missingRequired = getFrontmatterFields(docType)
    .filter((field) => field.required && value[field.name] === undefined)
    .map((field) => field.name);

  return { success: false, errors, missingRequired };
}

export function dumpFrontmatterYaml(value: FrontmatterValue): string {
  return stringify(value, { lineWidth: 80, aliasDuplicateObjects: false }).trimEnd();
}

export function parseFrontmatterYaml(
  docType: DocType,
  yaml: string,
  previousValue: FrontmatterValue,
): FrontmatterYamlResult {
  try {
    const parsed = parse(yaml);
    const value = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as FrontmatterValue)
      : {};
    const validated = validateFrontmatter(docType, value);
    if (!validated.success) {
      return {
        ok: false,
        value: previousValue,
        error: `YAML frontmatter failed validation: ${Object.keys(validated.errors).join(", ")}`,
      };
    }
    return { ok: true, value: validated.value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, value: previousValue, error: `YAML parse error: ${message}` };
  }
}
