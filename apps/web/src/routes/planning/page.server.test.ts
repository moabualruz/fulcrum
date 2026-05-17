import { describe, expect, mock, test } from "bun:test";

const APPROVED_MARKDOWN = `# Approved Plan

## Tasks
- [T1] Build planning route
  Depends on: none
  Success: Web preserves trace ids.
`;

const BREAKDOWN = {
  title: "Approved Plan",
  docs: [{ clientKey: "plan", input: { title: "Approved Plan", bodyMd: APPROVED_MARKDOWN } }],
  artifacts: [],
  successCriteria: [{ id: "SC1", text: "Web preserves trace ids.", scope: "task", traceId: "trace_1", taskClientKey: "T1" }],
  taskDrafts: [{
    clientKey: "T1",
    input: {
      title: "Build planning route",
      status: "pending",
      projectId: "99999999-9999-4999-8999-999999999999",
      description: "Trace: trace_1",
    },
    blockedByClientKeys: [],
    successCriteria: [],
    artifactPaths: [],
    sourcePlanId: "plan_1",
    traceId: "trace_1",
  }],
  dependencyUpdates: [],
  warnings: ["No prototype artifacts were declared."],
};

function jsonResponse(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function formData(extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("planId", "plan_1");
  fd.set("approvedPlanMarkdown", APPROVED_MARKDOWN);
  fd.set("projectId", "99999999-9999-4999-8999-999999999999");
  fd.set("traceId", "trace_1");
  fd.set("reviewId", "review_1");
  fd.set("cycleId", "cycle_1");
  fd.set("moduleId", "module_1");
  fd.set("sourceDocRefs", "doc:doc_1,doc:doc_2");
  for (const [key, value] of Object.entries(extra)) fd.set(key, value);
  return fd;
}

function event(fetchFn: typeof fetch, fd: FormData, locals: Record<string, unknown> = {}) {
  return {
    locals: { session: { id: "session_1", userId: "user_1" }, ...locals },
    fetch: fetchFn,
    request: {
      headers: new Headers({ cookie: "sid=abc" }),
      formData: async () => fd,
    },
    url: new URL("http://localhost/planning"),
  };
}

function jsonBody(init: unknown): Record<string, unknown> {
  return JSON.parse(((init as { body?: string })?.body ?? "{}")) as Record<string, unknown>;
}

describe("/planning +page.server.ts", () => {
  test("load creates non-static planning defaults for each request", async () => {
    const route = await import(`./+page.server.ts?cachebust=${Date.now() + 101}`);

    const first = await route.load({ locals: { activeProjectId: "project-active" } } as never);
    const second = await route.load({ locals: { activeProjectId: "project-active" } } as never);

    expect(first.defaultProjectId).toBe("project-active");
    expect(first.defaultPlanId).toMatch(/^plan-[0-9a-f-]{36}$/);
    expect(first.defaultTraceId).toMatch(/^trace-[0-9a-f-]{36}$/);
    expect(second.defaultPlanId).toMatch(/^plan-[0-9a-f-]{36}$/);
    expect(second.defaultTraceId).toMatch(/^trace-[0-9a-f-]{36}$/);
    expect(first.defaultPlanId).not.toBe("plan_web");
    expect(first.defaultTraceId).not.toBe("trace_web");
    expect(first.defaultPlanId).not.toBe(second.defaultPlanId);
    expect(first.defaultTraceId).not.toBe(second.defaultTraceId);
  });

  test("preview action calls planning preview public workflow API with trace and source doc refs", async () => {
    const route = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const fetchFn = mock(async () => jsonResponse(BREAKDOWN));

    const result = await route.actions.preview(event(fetchFn as unknown as typeof fetch, formData()) as never);

    expect(result).toMatchObject({ ok: true, mode: "preview", preview: { title: "Approved Plan" } });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(
      "http://localhost/workflows/planning/approved-plan/preview",
      expect.objectContaining({ method: "POST" }),
    );
    expect(jsonBody(fetchFn.mock.calls[0]?.[1])).toMatchObject({
      planId: "plan_1",
      approvedPlanMarkdown: APPROVED_MARKDOWN,
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_1",
      reviewId: "review_1",
      cycleId: "cycle_1",
      moduleId: "module_1",
      sourceDocRefs: [{ kind: "doc", id: "doc_1" }, { kind: "doc", id: "doc_2" }],
    });
  });

  test("materialize action calls planning materialize public workflow API and returns materialization ids", async () => {
    const route = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const materialized = {
      breakdown: BREAKDOWN,
      materialization: {
        docs: [{ clientKey: "plan", id: "doc_1" }],
        tasks: [{ clientKey: "T1", id: "task_1" }],
        dependencyUpdates: [],
      },
    };
    const fetchFn = mock(async () => jsonResponse(materialized));

    const result = await route.actions.materialize(event(fetchFn as unknown as typeof fetch, formData()) as never);

    expect(result).toMatchObject({
      ok: true,
      mode: "materialize",
      materialized: { materialization: { docs: [{ id: "doc_1" }], tasks: [{ id: "task_1" }] } },
    });
    expect(fetchFn).toHaveBeenCalledWith(
      "http://localhost/workflows/planning/approved-plan/materialize",
      expect.objectContaining({ method: "POST" }),
    );
    expect(jsonBody(fetchFn.mock.calls[0]?.[1])).toMatchObject({
      workspaceId: "local-workspace",
      workspaceSlug: "local-workspace",
      workspaceName: "local-workspace",
      projectSlug: "99999999-9999-4999-8999-999999999999",
      projectName: "99999999-9999-4999-8999-999999999999",
      projectId: "99999999-9999-4999-8999-999999999999",
      planId: "plan_1",
      traceId: "trace_1",
      approvedPlanMarkdown: APPROVED_MARKDOWN,
      sourceDocRefs: [{ kind: "doc", id: "doc_1" }, { kind: "doc", id: "doc_2" }],
    });
  });

  test("materialize action fails before workflow API when project id is missing", async () => {
    const route = await import(`./+page.server.ts?cachebust=${Date.now() + 21}`);
    const fetchFn = mock(async () => jsonResponse(BREAKDOWN));

    const result = await route.actions.materialize(
      event(fetchFn as unknown as typeof fetch, formData({ projectId: "" })) as never,
    );

    expect(result).toMatchObject({
      status: 400,
      data: { ok: false, mode: "materialize", error: "projectId is required" },
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("invalid source doc refs fail before calling workflow API", async () => {
    const route = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const fetchFn = mock(async () => jsonResponse(BREAKDOWN));

    const result = await route.actions.preview(
      event(fetchFn as unknown as typeof fetch, formData({ sourceDocRefs: "doc_without_kind" })) as never,
    );

    expect(result).toMatchObject({ status: 400 });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("workflow API failures preserve response status for planning actions", async () => {
    const route = await import(`./+page.server.ts?cachebust=${Date.now() + 31}`);
    const fetchFn = mock(async () => jsonResponse({ message: "not allowed" }, { status: 403 }));

    const result = await route.actions.preview(event(fetchFn as unknown as typeof fetch, formData()) as never);

    expect(result).toMatchObject({
      status: 403,
      data: { ok: false, mode: "preview", error: "not allowed" },
    });
  });

  test("freeformPrompt action calls planning freeform-doc public workflow API with selected docs and trace", async () => {
    const route = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const response = {
      context: {
        traceId: "trace_freeform",
        sourceRefs: [{ kind: "doc", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
        selectedDocs: [],
        contextMarkdown: "## Freeform Document: Brief",
      },
      prompt: "ACP prompt with submit_plan",
    };
    const fetchFn = mock(async () => jsonResponse(response));
    const fd = new FormData();
    fd.set("freeformUserPrompt", "Plan from freeform docs");
    fd.set("selectedDocIds", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa,bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    fd.set("projectId", "99999999-9999-4999-8999-999999999999");
    fd.set("traceId", "trace_freeform");
    fd.set("maxDocChars", "2400");

    const result = await route.actions.freeformPrompt(event(fetchFn as unknown as typeof fetch, fd) as never);

    expect(result).toMatchObject({ ok: true, mode: "freeformPrompt", freeformPrompt: response });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(
      "http://localhost/workflows/planning/freeform/prompt",
      expect.objectContaining({ method: "POST" }),
    );
    expect(jsonBody(fetchFn.mock.calls[0]?.[1])).toEqual({
      userPrompt: "Plan from freeform docs",
      selectedDocIds: [
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ],
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_freeform",
      maxDocChars: 2400,
    });
  });

  test("freeformStart action creates a trace-linked freeform work doc through planning public workflow API", async () => {
    const route = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const response = {
      status: "ready_for_planning",
      eventId: "event-freeform-start",
      document: {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        title: "New work brief",
        bodyMd: "Prototype first.",
      },
      context: {
        traceId: "trace_freeform_start",
        sourceRefs: [{ kind: "doc", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }],
        selectedDocs: [],
        contextMarkdown: "## Freeform Document: New work brief",
      },
      prompt: "ACP prompt with submit_plan",
    };
    const fetchFn = mock(async () => jsonResponse(response));
    const fd = new FormData();
    fd.set("freeformTitle", "New work brief");
    fd.set("freeformBodyMd", "Prototype first.");
    fd.set("freeformUserPrompt", "Plan this from the intake doc");
    fd.set("projectId", "99999999-9999-4999-8999-999999999999");
    fd.set("parentId", "parent-doc-web");
    fd.set("traceId", "trace_freeform_start");
    fd.set("acpSessionId", "acp-session-web");
    fd.set("modeId", "planning");
    fd.set("modelId", "gpt-5.4");
    fd.set("maxDocChars", "2400");

    const result = await route.actions.freeformStart(event(fetchFn as unknown as typeof fetch, fd) as never);

    expect(result).toMatchObject({ ok: true, mode: "freeformStart", freeformStart: response });
    expect(fetchFn).toHaveBeenCalledWith(
      "http://localhost/workflows/planning/freeform/start",
      expect.objectContaining({ method: "POST" }),
    );
    expect(jsonBody(fetchFn.mock.calls[0]?.[1])).toEqual({
      workspaceId: "local-workspace",
      workspaceSlug: "local-workspace",
      workspaceName: "local-workspace",
      projectSlug: "99999999-9999-4999-8999-999999999999",
      projectName: "99999999-9999-4999-8999-999999999999",
      title: "New work brief",
      bodyMd: "Prototype first.",
      userPrompt: "Plan this from the intake doc",
      projectId: "99999999-9999-4999-8999-999999999999",
      parentId: "parent-doc-web",
      traceId: "trace_freeform_start",
      acpSessionId: "acp-session-web",
      modeId: "planning",
      modelId: "gpt-5.4",
      maxDocChars: 2400,
    });
  });

  test("guidedAcpStart action starts an ACP guided planning session through planning public workflow API", async () => {
    const route = await import(`./+page.server.ts?cachebust=${Date.now() + 5}`);
    const response = {
      status: "ready_for_acp_prompt",
      eventId: "event-guided-acp",
      session: {
        acpSessionId: "acp-guided-web",
        agentName: "codex",
        cwd: "/repo",
        promptTemplateId: "prototype-first",
        traceId: "trace_guided_acp",
        modeId: "planning",
        modelId: "gpt-5.5",
        permissionMode: "review_each_tool",
      },
      permissionOptions: [{ optionId: "allow_once", kind: "allow", name: "Allow once" }],
      traffic: { entries: [{ method: "session/new" }, { method: "session/prompt" }] },
      context: {
        traceId: "trace_guided_acp",
        sourceRefs: [{ kind: "doc", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
        selectedDocs: [],
        contextMarkdown: "## Freeform Document: Brief",
      },
      prompt: "ACP guided session with submit_plan",
    };
    const fetchFn = mock(async () => jsonResponse(response));
    const fd = new FormData();
    fd.set("acpSessionId", "acp-guided-web");
    fd.set("acpAgentName", "codex");
    fd.set("acpCwd", "/repo");
    fd.set("acpUserPrompt", "Plan with ACP");
    fd.set("acpPromptTemplateId", "prototype-first");
    fd.set("selectedDocIds", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    fd.set("projectId", "99999999-9999-4999-8999-999999999999");
    fd.set("traceId", "trace_guided_acp");
    fd.set("modeId", "planning");
    fd.set("modelId", "gpt-5.5");
    fd.set("acpPermissionMode", "review_each_tool");
    fd.set("maxDocChars", "2400");

    const result = await route.actions.guidedAcpStart(event(fetchFn as unknown as typeof fetch, fd) as never);

    expect(result).toMatchObject({ ok: true, mode: "guidedAcpStart", guidedAcpStart: response });
    expect(fetchFn).toHaveBeenCalledWith(
      "http://localhost/workflows/planning/guided-acp/start",
      expect.objectContaining({ method: "POST" }),
    );
    expect(jsonBody(fetchFn.mock.calls[0]?.[1])).toEqual({
      workspaceId: "local-workspace",
      workspaceSlug: "local-workspace",
      workspaceName: "local-workspace",
      projectSlug: "99999999-9999-4999-8999-999999999999",
      projectName: "99999999-9999-4999-8999-999999999999",
      acpSessionId: "acp-guided-web",
      agentName: "codex",
      cwd: "/repo",
      userPrompt: "Plan with ACP",
      promptTemplateId: "prototype-first",
      selectedDocIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_guided_acp",
      modeId: "planning",
      modelId: "gpt-5.5",
      permissionMode: "review_each_tool",
      maxDocChars: 2400,
    });
  });

  test("guidedAcpStart action generates a session id when the form omits one", async () => {
    const route = await import(`./+page.server.ts?cachebust=${Date.now() + 51}`);
    const fetchFn = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = jsonBody(init);
      return jsonResponse({
        status: "ready_for_acp_prompt",
        session: { acpSessionId: body["acpSessionId"] },
        traffic: { entries: [] },
        context: { sourceRefs: [], selectedDocs: [], contextMarkdown: "" },
        prompt: "ACP guided session",
      });
    });
    const fd = new FormData();
    fd.set("acpAgentName", "codex");
    fd.set("acpCwd", "/repo");
    fd.set("acpUserPrompt", "Plan with ACP");
    fd.set("projectId", "99999999-9999-4999-8999-999999999999");
    fd.set("traceId", "trace_guided_generated");

    const result = await route.actions.guidedAcpStart(event(fetchFn as unknown as typeof fetch, fd) as never);

    expect(result).toMatchObject({ ok: true, mode: "guidedAcpStart" });
    const body = jsonBody(fetchFn.mock.calls[0]?.[1]);
    expect(body["acpSessionId"]).toMatch(/^acp-[0-9a-f-]{36}$/);
    expect(body).toMatchObject({
      agentName: "codex",
      cwd: "/repo",
      userPrompt: "Plan with ACP",
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_guided_generated",
    });
  });

  test("guidedAcpSessionAction action records session controls through planning public workflow API", async () => {
    const route = await import(`./+page.server.ts?cachebust=${Date.now() + 52}`);
    const response = {
      status: "session_action_recorded",
      session: {
        acpSessionId: "acp-guided-web",
        projectId: "99999999-9999-4999-8999-999999999999",
        traceId: "trace_guided_acp",
        agentName: "codex",
        modeId: "review",
        modelId: "gpt-5.5",
        sessionStatus: "selector_updated",
      },
      action: { type: "set_mode", method: "session/set_mode", modeId: "review" },
      traffic: { entries: [{ method: "session/new" }, { method: "session/set_mode" }] },
    };
    const fetchFn = mock(async () => jsonResponse(response));
    const fd = new FormData();
    fd.set("acpSessionId", "acp-guided-web");
    fd.set("projectId", "99999999-9999-4999-8999-999999999999");
    fd.set("traceId", "trace_guided_acp");
    fd.set("acpSessionAction", "set_mode");
    fd.set("modeId", "review");

    const result = await route.actions.guidedAcpSessionAction(event(fetchFn as unknown as typeof fetch, fd) as never);

    expect(result).toMatchObject({ ok: true, mode: "guidedAcpSessionAction", guidedAcpSessionAction: response });
    expect(fetchFn).toHaveBeenCalledWith(
      "http://localhost/workflows/planning/guided-acp/session-action",
      expect.objectContaining({ method: "POST" }),
    );
    expect(jsonBody(fetchFn.mock.calls[0]?.[1])).toEqual({
      acpSessionId: "acp-guided-web",
      action: "set_mode",
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_guided_acp",
      modeId: "review",
    });
  });

  test("continuousUpdate action restarts the cycle from edited freeform docs through planning public workflow API", async () => {
    const route = await import(`./+page.server.ts?cachebust=${Date.now() + 6}`);
    const response = {
      status: "ready_for_replanning",
      trigger: "manual_doc_edit",
      eventId: "event-continuous-update",
      traceId: "trace_continuous_web",
      acpSessionId: "acp-session-web",
      modeId: "planning",
      modelId: "gpt-5.5",
      targetTaskIds: ["task-alpha", "task-beta"],
      changedDocs: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        title: "Updated web brief",
        bodyMd: "Updated context.",
      }],
      context: {
        traceId: "trace_continuous_web",
        sourceRefs: [{ kind: "doc", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
        selectedDocs: [],
        contextMarkdown: "## Freeform Document: Updated web brief",
      },
      prompt: "Continue the Fulcrum workflow cycle\n\nsubmit_plan",
    };
    const fetchFn = mock(async () => jsonResponse(response));
    const fd = new FormData();
    fd.set("continuousTrigger", "manual_doc_edit");
    fd.set("continuousUserPrompt", "Replan from the updated web brief.");
    fd.set("continuousDocId", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    fd.set("continuousTitle", "Updated web brief");
    fd.set("continuousBodyMd", "Updated context.");
    fd.set("selectedDocIds", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    fd.set("targetTaskIds", "task-alpha,task-beta");
    fd.set("projectId", "99999999-9999-4999-8999-999999999999");
    fd.set("traceId", "trace_continuous_web");
    fd.set("acpSessionId", "acp-session-web");
    fd.set("modeId", "planning");
    fd.set("modelId", "gpt-5.5");
    fd.set("maxDocChars", "2400");

    const result = await route.actions.continuousUpdate(event(fetchFn as unknown as typeof fetch, fd) as never);

    expect(result).toMatchObject({ ok: true, mode: "continuousUpdate", continuousUpdate: response });
    expect(fetchFn).toHaveBeenCalledWith(
      "http://localhost/workflows/planning/continuous-update/restart",
      expect.objectContaining({ method: "POST" }),
    );
    expect(jsonBody(fetchFn.mock.calls[0]?.[1])).toEqual({
      workspaceId: "local-workspace",
      workspaceSlug: "local-workspace",
      workspaceName: "local-workspace",
      projectSlug: "99999999-9999-4999-8999-999999999999",
      projectName: "99999999-9999-4999-8999-999999999999",
      trigger: "manual_doc_edit",
      userPrompt: "Replan from the updated web brief.",
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_continuous_web",
      acpSessionId: "acp-session-web",
      modeId: "planning",
      modelId: "gpt-5.5",
      selectedDocIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      targetTaskIds: ["task-alpha", "task-beta"],
      changedDocs: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        title: "Updated web brief",
        bodyMd: "Updated context.",
      }],
      maxDocChars: 2400,
    });
  });

  test("generate action creates a technical planning cycle through planning public workflow API", async () => {
    const route = await import(`./+page.server.ts?cachebust=${Date.now() + 7}`);
    const response = {
      status: "ready_for_plan_review",
      eventId: "event-technical-planning",
      context: {
        traceId: "trace_technical_web",
        sourceRefs: [{ kind: "doc", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
        selectedDocs: [],
        contextMarkdown: "## Freeform Document: Brief",
      },
      prompt: "Generate a technical plan with submit_plan",
      reviewPrompt: "Review this generated technical plan",
      plan: {
        planId: "technical-plan-web",
        reviewId: "technical-review-web",
        title: "Plan from web context",
        traceId: "trace_technical_web",
        source: "freeform_docs",
        markdown: "# Plan from web context",
        prototypePaths: ["apps/web/src/routes/planning/workbench-prototype.tsx"],
        boilerplatePaths: ["services/planning-review/src/application/technical-planning-cycle.ts"],
        sourceDocRefs: [{ kind: "doc", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
      },
      breakdown: {
        title: "Plan from web context",
        docs: [],
        artifacts: [],
        successCriteria: [],
        taskDrafts: [{ clientKey: "T1", input: { title: "Generate plan" }, blockedByClientKeys: [] }],
        dependencyUpdates: [],
        warnings: [],
      },
    };
    const fetchFn = mock(async () => jsonResponse(response));
    const fd = new FormData();
    fd.set("technicalSource", "freeform_docs");
    fd.set("technicalUserPrompt", "Plan from web context");
    fd.set("selectedDocIds", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    fd.set("projectId", "99999999-9999-4999-8999-999999999999");
    fd.set("traceId", "trace_technical_web");
    fd.set("planId", "technical-plan-web");
    fd.set("reviewId", "technical-review-web");
    fd.set("prototypePaths", "apps/web/src/routes/planning/workbench-prototype.tsx");
    fd.set("boilerplatePaths", "services/planning-review/src/application/technical-planning-cycle.ts");
    fd.set("successCriteria", "Prototype and boilerplate artifacts are visible before approval.");
    fd.set("maxDocChars", "2400");

    const result = await route.actions.generate(event(fetchFn as unknown as typeof fetch, fd) as never);

    expect(result).toMatchObject({ ok: true, mode: "generate", technicalPlanning: response });
    expect(fetchFn).toHaveBeenCalledWith(
      "http://localhost/workflows/planning/technical-cycle/generate",
      expect.objectContaining({ method: "POST" }),
    );
    expect(jsonBody(fetchFn.mock.calls[0]?.[1])).toEqual({
      source: "freeform_docs",
      userPrompt: "Plan from web context",
      selectedDocIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      projectId: "99999999-9999-4999-8999-999999999999",
      traceId: "trace_technical_web",
      maxDocChars: 2400,
      planId: "technical-plan-web",
      reviewId: "technical-review-web",
      prototypePaths: ["apps/web/src/routes/planning/workbench-prototype.tsx"],
      boilerplatePaths: ["services/planning-review/src/application/technical-planning-cycle.ts"],
      successCriteria: ["Prototype and boilerplate artifacts are visible before approval."],
    });
  });

  test("runArtifactExecution action delegates artifact runs through planning public workflow API", async () => {
    const route = await import(`./+page.server.ts?cachebust=${Date.now() + 17}`);
    const response = {
      planId: "technical-plan-web",
      artifactPath: "apps/web/src/routes/planning/workbench-prototype.tsx",
      status: "passed",
      prototypeStatus: "validated",
      traceId: "trace_technical_web",
      command: "bun",
      args: ["-e", 'await import("./apps/web/src/routes/planning/workbench-prototype.tsx")'],
      runner: "sandbox-agent",
      runId: "artifact-run-web",
      exitCode: 0,
      durationMs: 25,
      summary: "Artifact command completed in the sandbox runner.",
      outputRef: "/tmp/fulcrum-agent-run/transcripts/artifact-run.jsonl",
      history: [{
        status: "passed",
        prototypeStatus: "validated",
        command: "bun",
        args: ["-e", 'await import("./apps/web/src/routes/planning/workbench-prototype.tsx")'],
        summary: "Artifact command completed in the sandbox runner.",
        outputRef: "/tmp/fulcrum-agent-run/transcripts/artifact-run.jsonl",
        executedAt: "2026-05-15T12:00:00.000Z",
      }],
    };
    const fetchFn = mock(async () => jsonResponse(response));
    const fd = new FormData();
    fd.set("artifactPlanId", "technical-plan-web");
    fd.set("artifactPath", "apps/web/src/routes/planning/workbench-prototype.tsx");
    fd.set("artifactTraceId", "trace_technical_web");
    fd.set("artifactCommand", "bun");
    fd.set("artifactArgs", JSON.stringify(["-e", 'await import("./apps/web/src/routes/planning/workbench-prototype.tsx")']));
    fd.set("artifactChecks", JSON.stringify(["Prototype demonstrates the intended user flow before task materialization."]));
    fd.set("artifactTimeoutMs", "30000");

    const result = await route.actions.runArtifactExecution(event(fetchFn as unknown as typeof fetch, fd) as never);

    expect(result).toEqual({ ok: true, mode: "artifactExecution", artifactExecution: response });
    expect(fetchFn).toHaveBeenCalledWith(
      "http://localhost/workflows/planning/artifact-execution/run",
      expect.objectContaining({ method: "POST" }),
    );
    expect(jsonBody(fetchFn.mock.calls[0]?.[1])).toEqual({
      planId: "technical-plan-web",
      artifactPath: "apps/web/src/routes/planning/workbench-prototype.tsx",
      traceId: "trace_technical_web",
      command: "bun",
      args: ["-e", 'await import("./apps/web/src/routes/planning/workbench-prototype.tsx")'],
      checks: ["Prototype demonstrates the intended user flow before task materialization."],
      timeoutMs: 30000,
    });
  });

  test("workflowCycle action delegates full-cycle payload through workflows public API", async () => {
    const route = await import(`./+page.server.ts?cachebust=${Date.now() + 9}`);
    const response = {
      traceId: "trace_web_cycle",
      finalQa: { status: "passed" },
      generatedE2e: {
        status: "planned",
        testFiles: ["tests/e2e/generated/web-cycle.test.ts"],
      },
    };
    const fetchFn = mock(async () => jsonResponse(response));
    const payload = {
      workspace: { id: "workspace-web-cycle", slug: "web-cycle", name: "Web Cycle" },
      project: {
        id: "project-web-cycle",
        slug: "web-cycle",
        name: "Web Cycle",
        traceId: "trace_web_cycle",
      },
      freeform: {
        documentId: "doc-web-cycle",
        title: "Web cycle brief",
        bodyMd: "Start from freeform docs and run through generated E2E.",
        userPrompt: "Plan and execute this workflow.",
      },
      guidedPlanning: {
        acpSessionId: "acp-web-cycle",
        agentName: "codex",
        cwd: "/repo",
        permissionMode: "review_each_tool",
      },
      approvedPlan: {
        planId: "plan-web-cycle",
        reviewId: "review-web-cycle",
        markdown: "# Plan",
      },
      execution: {
        agent: "codex",
        prompt: "Run dependencies.",
        lifecycleSummary: "Runs complete.",
        qaReviewText: "### Verdict: APPROVE\nApproved.",
      },
      uat: {
        decision: "approve_without_manual_review",
        reviewType: "uat",
        e2eRunner: "bun",
      },
    };
    const fd = new FormData();
    fd.set("workflowCycleJson", JSON.stringify(payload));

    const result = await route.actions.workflowCycle(event(fetchFn as unknown as typeof fetch, fd) as never);

    expect(result).toEqual({ ok: true, mode: "workflowCycle", workflowCycle: response });
    expect(fetchFn).toHaveBeenCalledWith(
      "http://localhost/workflows/cycles/acceptance-cycle/run",
      expect.objectContaining({ method: "POST" }),
    );
    expect(jsonBody(fetchFn.mock.calls[0]?.[1])).toEqual(payload);
  });

  test("workflowCycle action supplies workspace and project metadata when omitted", async () => {
    const route = await import(`./+page.server.ts?cachebust=${Date.now() + 109}`);
    const response = { traceId: "trace_enriched_cycle", finalQa: { status: "passed" } };
    const fetchFn = mock(async () => jsonResponse(response));
    const payload = {
      traceId: "trace_enriched_cycle",
      freeform: {
        documentId: "doc-enriched-cycle",
        title: "Enriched cycle brief",
        bodyMd: "Run a workflow cycle without duplicated form metadata.",
        userPrompt: "Plan and execute this workflow.",
      },
      guidedPlanning: {
        acpSessionId: "acp-enriched-cycle",
        agentName: "codex",
        cwd: "/repo",
      },
      approvedPlan: {
        planId: "plan-enriched-cycle",
        reviewId: "review-enriched-cycle",
        markdown: "# Plan",
      },
      execution: {
        agent: "codex",
        prompt: "Run dependencies.",
        lifecycleSummary: "Runs complete.",
        qaReviewText: "### Verdict: APPROVE\nApproved.",
      },
      uat: {
        decision: "approve_without_manual_review",
        reviewType: "uat",
      },
    };
    const fd = new FormData();
    fd.set("workflowCycleJson", JSON.stringify(payload));

    const result = await route.actions.workflowCycle(event(fetchFn as unknown as typeof fetch, fd, {
      activeProjectId: "project-enriched-cycle",
      workspaceId: "workspace-enriched-cycle",
      workspaceSlug: "enriched-cycle",
      workspaceName: "Enriched Cycle",
    }) as never);

    expect(result).toEqual({ ok: true, mode: "workflowCycle", workflowCycle: response });
    expect(jsonBody(fetchFn.mock.calls[0]?.[1])).toMatchObject({
      workspace: {
        id: "workspace-enriched-cycle",
        slug: "enriched-cycle",
        name: "Enriched Cycle",
      },
      project: {
        id: "project-enriched-cycle",
        slug: "project-enriched-cycle",
        name: "project-enriched-cycle",
        traceId: "trace_enriched_cycle",
      },
      freeform: payload.freeform,
      guidedPlanning: payload.guidedPlanning,
    });
  });
});
