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
