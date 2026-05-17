/**
 * Structured log context for Symphony issue/session transitions.
 * Every log entry includes issue_id, issue_identifier, and session_id (SYM-27, §18.1).
 */
export interface SymphonyLogContext {
  issue_id?: string;
  issue_identifier?: string;
  session_id?: string;
  thread_id?: string;
  turn_id?: string;
  run_id?: string;
  org_id?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface SpanRecord {
  name: string;
  attributes: Record<string, string | number>;
}

export type SpanRecorder = (span: SpanRecord) => void;

export interface SpanLike {
  end?: () => void;
}

export interface TracerLike {
  startActiveSpan<T>(
    name: string,
    options: { attributes: Record<string, string | number> },
    callback: (span: SpanLike) => T,
  ): T;
}

export interface InitTracerOptions {
  spanRecorder?: SpanRecorder;
}

const noopTracer: TracerLike = {
  startActiveSpan: (_name, _options, callback) => callback({}),
};

export function initTracer(
  serviceName = "fulcrum",
  options: InitTracerOptions = {},
): TracerLike {
  if (options.spanRecorder) return recorderTracer(options.spanRecorder);

  if (!process.env["OTEL_EXPORTER_OTLP_ENDPOINT"]) return noopTracer;

  const otel = loadOptionalOTelApi();
  const tracer = otel?.trace?.getTracer(serviceName);
  return tracer ?? noopTracer;
}

export function traceTransition(
  tracer: TracerLike,
  from: string,
  to: string,
  attrs: {
    org_id: string;
    run_id: string;
    attempt_count: number;
  },
): void {
  tracer.startActiveSpan(
    "symphony.state_transition",
    {
      attributes: {
        from_state: from,
        to_state: to,
        org_id: attrs.org_id,
        run_id: attrs.run_id,
        attempt_count: attrs.attempt_count,
      },
    },
    (span) => {
      span.end?.();
    },
  );
}

function recorderTracer(record: SpanRecorder): TracerLike {
  return {
    startActiveSpan: (name, options, callback) => {
      record({ name, attributes: options.attributes });
      return callback({ end: () => undefined });
    },
  };
}

function loadOptionalOTelApi(): { trace?: { getTracer(name: string): TracerLike } } | null {
  try {
    const require = new Function("specifier", "return require(specifier)") as (
      specifier: string,
    ) => unknown;
    return require("@opentelemetry/api") as { trace?: { getTracer(name: string): TracerLike } };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Structured logging sink (SYM-27, §17.6)
// ---------------------------------------------------------------------------

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface StructuredLogSink {
  log(level: LogLevel, message: string, ctx: SymphonyLogContext): void;
}

const _consoleSink: StructuredLogSink = {
  log(level, message, ctx) {
    // Failures must not crash orchestration — best-effort JSON line to stdout
    try {
      const entry = { level, message, ...ctx, ts: new Date().toISOString() };
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(entry));
    } catch { /* ignore */ }
  },
};

let _activeSink: StructuredLogSink = _consoleSink;

/** Replace the active log sink (for testing). */
export function setLogSink(sink: StructuredLogSink): void {
  _activeSink = sink;
}

/** Reset the log sink to the default console-based sink. */
export function resetLogSink(): void {
  _activeSink = _consoleSink;
}

/**
 * Emit a structured log entry for a Symphony orchestration event.
 *
 * Guaranteed not to throw — sink failures are caught and silently ignored so
 * orchestration is never blocked by observability infrastructure (§17.6).
 */
export function logSymphonyEvent(
  level: LogLevel,
  message: string,
  ctx: SymphonyLogContext,
): void {
  try {
    _activeSink.log(level, message, ctx);
  } catch { /* logging sink failures MUST NOT crash orchestration */ }
}
