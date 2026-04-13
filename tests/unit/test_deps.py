def test_mcp_importable():
    import mcp.server.fastmcp  # noqa: F401

def test_otel_importable():
    from opentelemetry import trace  # noqa: F401
    from opentelemetry.sdk.trace import TracerProvider  # noqa: F401
    from opentelemetry.semconv._incubating.attributes.gen_ai_attributes import (
        GEN_AI_SYSTEM,
    )  # noqa: F401
