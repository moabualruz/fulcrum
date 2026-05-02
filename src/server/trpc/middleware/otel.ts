import type { TRPCContext } from "../../../trpc/context.ts";

export interface RecordedTRPCSpan {
  name: string;
  attributes: Record<string, string>;
}

type SpanRecorder = (span: RecordedTRPCSpan) => void;

interface SpanLike {
  setStatus?(status: { code: number; message?: string }): void;
  recordException?(error: unknown): void;
  end?(): void;
}

interface TracerLike {
  startActiveSpan<T>(
    name: string,
    options: { attributes: Record<string, string> },
    callback: (span: SpanLike) => T,
  ): T;
}

interface OTelApiLike {
  trace?: {
    getTracer(name: string): TracerLike;
  };
  SpanStatusCode?: {
    ERROR: number;
  };
}

let spanRecorderForTests: SpanRecorder | null = null;

export function setTRPCSpanRecorderForTests(recorder: SpanRecorder | null): void {
  spanRecorderForTests = recorder;
}

function spanAttributes(ctx: TRPCContext, path: string, type: string): Record<string, string> {
  return {
    "org.id": ctx.orgId ?? "",
    "user.id": ctx.userId ?? "",
    "request.id": ctx.requestId ?? "",
    "trpc.procedure": path,
    "trpc.type": type,
  };
}

async function loadOTelApi(): Promise<OTelApiLike | null> {
  if (!process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] && process.env["FULCRUM_OTEL"] !== "1") {
    return null;
  }

  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<unknown>;
    return await dynamicImport("@opentelemetry/api") as OTelApiLike;
  } catch {
    return null;
  }
}

export async function runWithTRPCSpan<T>(opts: {
  ctx: TRPCContext;
  path: string;
  type: string;
  run: () => Promise<T> | T;
}): Promise<T> {
  const name = `fulcrum.trpc.${opts.path}`;
  const attributes = spanAttributes(opts.ctx, opts.path, opts.type);
  spanRecorderForTests?.({ name, attributes });

  const otel = await loadOTelApi();
  const tracer = otel?.trace?.getTracer("fulcrum");
  if (!tracer) return opts.run();

  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await opts.run();
    } catch (error) {
      span.recordException?.(error);
      span.setStatus?.({
        code: otel?.SpanStatusCode?.ERROR ?? 2,
        message: error instanceof Error ? error.message : "tRPC procedure failed",
      });
      throw error;
    } finally {
      span.end?.();
    }
  });
}
