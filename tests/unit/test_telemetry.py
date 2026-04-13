"""Tests for OTel telemetry spans."""
import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.sdk.trace.export import SimpleSpanProcessor


@pytest.fixture
def span_exporter():
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    yield exporter, provider
    exporter.clear()


def test_agent_span_creates_span(span_exporter):
    exporter, provider = span_exporter
    from pi_agent_os.telemetry.spans import agent_span
    with agent_span(provider="anthropic", model="claude-sonnet-4-6", profile="chief_of_staff",
                    tracer_provider=provider):
        pass
    spans = exporter.get_finished_spans()
    assert len(spans) >= 1
    names = [s.name for s in spans]
    assert "invoke_agent chief_of_staff" in names


def test_agent_span_sets_gen_ai_attributes(span_exporter):
    exporter, provider = span_exporter
    from pi_agent_os.telemetry.spans import agent_span
    with agent_span(provider="anthropic", model="claude-sonnet-4-6", profile="chief_of_staff",
                    tracer_provider=provider):
        pass
    span = next(s for s in exporter.get_finished_spans() if s.name == "invoke_agent chief_of_staff")
    attrs = dict(span.attributes)
    assert attrs["gen_ai.system"] == "anthropic"
    assert attrs["gen_ai.request.model"] == "claude-sonnet-4-6"
    assert attrs["gen_ai.agent.name"] == "chief_of_staff"
    assert attrs["gen_ai.operation.name"] == "invoke_agent"


def test_agent_span_records_token_usage(span_exporter):
    exporter, provider = span_exporter
    from pi_agent_os.telemetry.spans import agent_span
    with agent_span(provider="google_gemini", model="gemini-2.5-pro", profile="tester",
                    tracer_provider=provider) as s:
        s.set_token_usage(input_tokens=512, output_tokens=128)
    span = next(s for s in exporter.get_finished_spans() if s.name == "invoke_agent tester")
    attrs = dict(span.attributes)
    assert attrs["gen_ai.usage.input_tokens"] == 512
    assert attrs["gen_ai.usage.output_tokens"] == 128


def test_agent_span_records_error_on_exception(span_exporter):
    exporter, provider = span_exporter
    from pi_agent_os.telemetry.spans import agent_span
    from opentelemetry.trace import StatusCode
    with pytest.raises(ValueError):
        with agent_span(provider="pi", model="opencode/big-pickle", profile="implementer",
                        tracer_provider=provider):
            raise ValueError("model not found")
    span = next(s for s in exporter.get_finished_spans() if s.name == "invoke_agent implementer")
    assert span.status.status_code == StatusCode.ERROR
