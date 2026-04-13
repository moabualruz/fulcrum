"""
OpenTelemetry spans for PI Agent OS.

Uses GenAI semantic conventions (OTel semconv v1.37.0+):
  gen_ai.provider.name  — provider name (replaces deprecated gen_ai.system)
                          values: "anthropic" | "gcp.gemini" | "pi" | "openai" | ...
  gen_ai.request.model  — model name
  gen_ai.agent.name     — profile / role
  gen_ai.operation.name — "invoke_agent" | "chat"
  gen_ai.usage.input_tokens
  gen_ai.usage.output_tokens

Note: gen_ai.system was renamed gen_ai.provider.name in semconv v1.37.0 (Aug 2025).
Both are emitted for backwards compatibility with older collectors.

Usage:
    from pi_agent_os.telemetry.spans import agent_span

    with agent_span(provider="anthropic", model="claude-sonnet-4-6", profile="tester") as s:
        run_id = adapter.spawn_agent(config)
        result = adapter.wait_for_run(run_id)
        s.set_token_usage(input_tokens=512, output_tokens=128)
"""
from __future__ import annotations

from contextlib import contextmanager

from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode


class _AgentSpanContext:
    """Thin wrapper around an OTel span with helper methods."""

    def __init__(self, span: trace.Span):
        self._span = span

    def set_token_usage(
        self,
        input_tokens: int = 0,
        output_tokens: int = 0,
        cache_creation_tokens: int = 0,
        cache_read_tokens: int = 0,
    ) -> None:
        self._span.set_attribute("gen_ai.usage.input_tokens", input_tokens)
        self._span.set_attribute("gen_ai.usage.output_tokens", output_tokens)
        if cache_creation_tokens:
            self._span.set_attribute(
                "gen_ai.usage.cache_creation.input_tokens", cache_creation_tokens
            )
        if cache_read_tokens:
            self._span.set_attribute(
                "gen_ai.usage.cache_read.input_tokens", cache_read_tokens
            )

    def set_run_id(self, run_id: str) -> None:
        self._span.set_attribute("gen_ai.agent.run_id", run_id)

    def set_error(self, message: str) -> None:
        self._span.set_status(Status(StatusCode.ERROR, message))


@contextmanager
def agent_span(
    provider: str,
    model: str,
    profile: str,
    operation: str = "invoke_agent",
    tracer_provider=None,
):
    """
    Context manager that wraps an agent invocation in an OTel span.

    provider:         "anthropic" | "gcp.gemini" | "pi" | "openai" | "aws.bedrock" | ...
                      (semconv v1.37.0 values for gen_ai.provider.name)
    model:            model name (e.g. "claude-sonnet-4-6")
    profile:          agent role / profile_id (e.g. "chief_of_staff")
    operation:        "invoke_agent" (default) or "chat"
    tracer_provider:  optional TracerProvider; pass in tests for isolation

    Yields an _AgentSpanContext for setting token usage / run_id.
    Automatically records exceptions and sets ERROR status.
    """
    tracer = trace.get_tracer("pi_agent_os", "0.1.0", tracer_provider=tracer_provider)
    span_name = f"{operation} {profile}"
    with tracer.start_as_current_span(span_name) as span:
        # semconv v1.37.0: gen_ai.system → gen_ai.provider.name
        # Emit both for backwards compatibility with collectors using older semconv.
        span.set_attribute("gen_ai.provider.name", provider)
        span.set_attribute("gen_ai.system", provider)  # deprecated but still consumed
        span.set_attribute("gen_ai.request.model", model)
        span.set_attribute("gen_ai.agent.name", profile)
        span.set_attribute("gen_ai.operation.name", operation)

        ctx = _AgentSpanContext(span)
        try:
            yield ctx
        except Exception as exc:
            span.set_status(Status(StatusCode.ERROR, str(exc)))
            span.record_exception(exc)
            raise
