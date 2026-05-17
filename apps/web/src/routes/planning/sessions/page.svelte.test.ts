import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync(new URL("./+page.svelte", import.meta.url), "utf8");

describe("/planning/sessions +page.svelte source", () => {
  test("renders guided ACP session controls for agent, context, permissions, model, and trace", () => {
    expect(source).toContain("data-sessions-page");
    expect(source).toContain("data-guided-session-form");
    expect(source).toContain('action="?/guidedAcpStart"');
    expect(source).toContain('name="acpAgentName"');
    expect(source).toContain('name="acpCwd"');
    expect(source).toContain('name="acpUserPrompt"');
    expect(source).toContain('name="selectedDocIds"');
    expect(source).toContain('name="traceId"');
    expect(source).toContain('name="modeId"');
    expect(source).toContain('name="modelId"');
    expect(source).toContain('name="acpPermissionMode"');
  });

  test("renders freeform document intake controls that feed ACP planning", () => {
    expect(source).toContain("data-freeform-session-form");
    expect(source).toContain('action="?/freeformStart"');
    expect(source).toContain('name="freeformTitle"');
    expect(source).toContain('name="freeformBodyMd"');
    expect(source).toContain('name="freeformUserPrompt"');
    expect(source).toContain('name="parentId"');
    expect(source).toContain('name="acpSessionId"');
  });

  test("renders guided and freeform result panels with persisted session and prompt outputs", () => {
    expect(source).toContain("data-guided-session-result");
    expect(source).toContain("guidedAcpStart.session?.acpSessionId");
    expect(source).toContain("guidedAcpStart.session?.agentName");
    expect(source).toContain("guidedAcpStart.session?.modeId");
    expect(source).toContain("guidedAcpStart.session?.modelId");
    expect(source).toContain("guidedAcpStart.session?.permissionMode");
    expect(source).toContain("guidedAcpStart.prompt");
    expect(source).toContain("data-freeform-session-result");
    expect(source).toContain("freeformStart.document?.title");
    expect(source).toContain("freeformStart.prompt");
  });
});
