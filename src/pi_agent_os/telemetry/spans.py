"""
OpenTelemetry spans for PI Agent OS.

Uses GenAI semantic conventions:
  gen_ai.system         — provider name (anthropic, google_gemini, pi, openai, ...)
  gen_ai.request.model  — model name
  gen_ai.agent.name     — profile / role
  gen_ai.operation.name — "invoke_agent" | "chat"
  gen_ai.usage.input_tokens
  gen_ai.usage.output_tokens

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


def _get_tracer():
    return trace.get_tracer("pi_agent_os", "0.1.0")


class _AgentSpanContext:
    """Thin wrapper around an OTel span with helper methods."""

    def __init__(self, span: trace.Span):
        self._span = span

    def set_token_usage(self, input_tokens: int = 0, output_tokens: int = 0) -> None:
        self._span.set_attribute("gen_ai.usage.input_tokens", input_tokens)
        self._span.set_attribute("gen_ai.usage.output_tokens", output_tokens)

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
):
    """
    Context manager that wraps an agent invocation in an OTel span.

    provider:  "anthropic" | "google_gemini" | "pi" | "openai" | ...
    model:     model name (e.g. "claude-sonnet-4-6")
    profile:   agent role / profile_id (e.g. "chief_of_staff")
    operation: "invoke_agent" (default) or "chat"

    Yields an _AgentSpanContext for setting token usage / run_id.
    Automatically records exceptions and sets ERROR status.
    """
    span_name = f"{operation} {profile}"
    with _get_tracer().start_as_current_span(span_name) as span:
        span.set_attribute("gen_ai.system", provider)
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
