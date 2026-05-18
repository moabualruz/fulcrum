import { error, fail, redirect } from "@sveltejs/kit";

import { createFeatureExperimentApiCaller } from "@feature-flags/interface/http/feature-experiment-api-client.ts";

interface RouteLocals {
  session: unknown;
}

interface LoadEvent {
  locals: RouteLocals;
  fetch: typeof fetch;
  request: { headers: { get(name: string): string | null } };
  url: URL;
}

interface ActionEvent {
  locals: RouteLocals;
  fetch: typeof fetch;
  request: {
    formData(): Promise<FormData>;
    headers: { get(name: string): string | null };
  };
  url: URL;
}

export interface ExperimentRow {
  id: string;
  name: string;
  description: string;
  variants: string[];
  rolloutPercent: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

interface ExperimentApiRow {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  variants?: unknown;
  rolloutPercent?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  createdAt?: unknown;
}

function createExperimentCaller(event: LoadEvent | ActionEvent) {
  return createFeatureExperimentApiCaller({
    baseUrl: process.env["FULCRUM_SERVER_URL"] ?? process.env["FULCRUM_PUBLIC_API_URL"] ?? `${event.url.protocol}//${event.url.host}`,
    fetch: event.fetch,
    headers: cookieHeaders(event),
  });
}

function cookieHeaders(event: LoadEvent | ActionEvent): Record<string, string> {
  const cookie = event.request.headers.get("cookie");
  return cookie ? { cookie } : {};
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function statusFromMessage(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes("401") || lower.includes("unauthorized")) return 401;
  if (lower.includes("403") || lower.includes("forbidden")) return 403;
  if (lower.includes("404") || lower.includes("not found")) return 404;
  return 500;
}

function normalizeExperiment(row: ExperimentApiRow): ExperimentRow | null {
  if (typeof row.id !== "string" || typeof row.name !== "string") return null;

  return {
    id: row.id,
    name: row.name,
    description: typeof row.description === "string" ? row.description : "",
    variants: Array.isArray(row.variants) ? row.variants.filter((variant): variant is string => typeof variant === "string") : [],
    rolloutPercent: typeof row.rolloutPercent === "number" ? row.rolloutPercent : 100,
    startDate: typeof row.startDate === "string" ? row.startDate : null,
    endDate: typeof row.endDate === "string" ? row.endDate : null,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
  };
}

export async function load(event: LoadEvent) {
  if (!event.locals.session) {
    throw redirect(302, "/auth/login");
  }

  try {
    const rows = await createExperimentCaller(event).flags.experiments.list();
    const experiments = Array.isArray(rows)
      ? rows.map((row) => normalizeExperiment(row as ExperimentApiRow)).filter((row): row is ExperimentRow => row !== null)
      : [];
    return { experiments };
  } catch (cause) {
    const message = errorMessage(cause);
    const status = statusFromMessage(message);
    if (status === 401) throw redirect(302, "/auth/login");
    if (status === 404 || status === 403) {
      error(404, { message: "Experiments feature is not enabled." });
    }
    error(500, { message });
  }
}

export const actions = {
  create: async (event: ActionEvent) => {
    if (!event.locals.session) throw redirect(302, "/auth/login");

    const form = await event.request.formData();
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const variantsRaw = String(form.get("variants") ?? "").trim();
    const rolloutPercent = Number(form.get("rolloutPercent") ?? "100");

    if (!name) return fail(400, { createError: "Name is required." });
    const variants = variantsRaw.split(",").map((variant) => variant.trim()).filter(Boolean);
    if (variants.length < 2) return fail(400, { createError: "At least 2 variants required." });

    const uniqueVariants = new Set(variants);
    if (uniqueVariants.size !== variants.length) {
      return fail(400, { createError: "Variant names must be unique." });
    }

    try {
      await createExperimentCaller(event).flags.experiments.create({
        name,
        description,
        variants,
        rolloutPercent,
      });
      return { ok: true };
    } catch (cause) {
      const message = errorMessage(cause);
      const status = statusFromMessage(message);
      if (status === 401) throw redirect(302, "/auth/login");
      return fail(status === 403 || status === 404 ? 404 : 400, { createError: message });
    }
  },
};
