import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { RoutingDecisionRow, RoutingRuleRow } from "./routing.types";

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/settings/routing"),
    params: {},
    route: { id: null },
    status: 200,
    error: null,
    data: {},
    state: {},
    form: null,
  },
}));

mock.module("$app/navigation", () => ({
  goto: async () => {},
  invalidateAll: async () => {},
}));

mock.module("$app/forms", () => ({
  enhance: () => ({ destroy: () => {} }),
}));

mock.module("$app/environment", () => ({
  browser: false,
  dev: false,
  building: false,
  version: "",
}));

const SAMPLE_RULE: RoutingRuleRow = {
  id: "rule-001",
  orgId: "org-001",
  projectId: null,
  name: "Bug fixer",
  conditionsJson: { all: [{ fact: "task.kind", operator: "equal", value: "bug" }] },
  actionAgent: "claude",
  actionSkillSet: [],
  priority: 100,
  enabled: true,
  source: "manual",
  createdAt: new Date("2024-01-01").toISOString(),
  updatedAt: new Date("2024-01-01").toISOString(),
};

type PageProps = {
  data: {
    projectId: string | null;
    rules: RoutingRuleRow[];
    inheritedRules: RoutingRuleRow[];
    activeProjectId?: string | null;
  };
  form?: {
    createError?: string;
    updateError?: string;
    dryRunError?: string;
    dryRunResult?: RoutingDecisionRow | null;
  };
};

describe("/settings/routing RoutingPage.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./RoutingPage.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  function makeData(rules: RoutingRuleRow[] = [], inherited: RoutingRuleRow[] = []): PageProps["data"] {
    return { projectId: null, rules, inheritedRules: inherited };
  }

  test("renders h1 'Routing Rules'", () => {
    const { body } = render(Page, { props: { data: makeData() } });
    expect(body).toContain("Routing Rules");
  });

  test("renders routing settings container", () => {
    const { body } = render(Page, { props: { data: makeData() } });
    expect(body).toContain("data-routing-settings");
  });

  test("create panel is open when no rules", () => {
    const { body } = render(Page, { props: { data: makeData([]) } });
    expect(body).toContain("data-routing-create-panel");
    // When no rules, details is open
    expect(body).toContain("open");
  });

  test("renders rules table", () => {
    const { body } = render(Page, { props: { data: makeData([SAMPLE_RULE]) } });
    expect(body).toContain("data-routing-rules-table");
    expect(body).toContain(`data-routing-rule="${SAMPLE_RULE.id}"`);
  });

  test("shows rule name and agent in table", () => {
    const { body } = render(Page, { props: { data: makeData([SAMPLE_RULE]) } });
    expect(body).toContain("Bug fixer");
    expect(body).toContain("claude");
  });

  test("shows create error from form", () => {
    const { body } = render(Page, {
      props: { data: makeData(), form: { createError: "Invalid conditions JSON" } },
    });
    expect(body).toContain("data-routing-create-error");
    expect(body).toContain("Invalid conditions JSON");
  });

  test("shows dry run error from form", () => {
    const { body } = render(Page, {
      props: { data: makeData(), form: { dryRunError: "Parse error" } },
    });
    expect(body).toContain("data-routing-dry-run-error");
    expect(body).toContain("Parse error");
  });

  test("shows dry run result with agent badge", () => {
    const decision: RoutingDecisionRow = {
      ruleId: SAMPLE_RULE.id,
      source: "rule",
      agent: "claude",
      confidence: 1.0,
    };
    const { body } = render(Page, {
      props: { data: makeData([SAMPLE_RULE]), form: { dryRunResult: decision } },
    });
    expect(body).toContain("data-routing-dry-run-result");
    expect(body).toContain("claude");
  });

  test("shows dry run result with no rule matched (null ruleId)", () => {
    const decision: RoutingDecisionRow = {
      ruleId: null,
      source: "fallback",
      agent: "default",
      confidence: null,
    };
    const { body } = render(Page, {
      props: { data: makeData([SAMPLE_RULE]), form: { dryRunResult: decision } },
    });
    expect(body).toContain("data-routing-dry-run-result");
    expect(body).toContain("no match");
  });

  test("renders delete button per rule", () => {
    const { body } = render(Page, { props: { data: makeData([SAMPLE_RULE]) } });
    expect(body).toContain(`data-routing-delete="${SAMPLE_RULE.id}"`);
  });

  test("renders enabled toggle per rule", () => {
    const { body } = render(Page, { props: { data: makeData([SAMPLE_RULE]) } });
    expect(body).toContain(`data-routing-enabled-toggle="${SAMPLE_RULE.id}"`);
  });

  test("renders dry run form with taskJson textarea", () => {
    const { body } = render(Page, { props: { data: makeData() } });
    expect(body).toContain("action=\"?/dryRun\"");
    expect(body).toContain("taskJson");
  });

  test("multiple rules render multiple rows", () => {
    const rule2 = { ...SAMPLE_RULE, id: "rule-002", name: "Feature agent", actionAgent: "codex" };
    const { body } = render(Page, { props: { data: makeData([SAMPLE_RULE, rule2]) } });
    const rows = body.match(/data-routing-rule=/g) ?? [];
    expect(rows).toHaveLength(2);
    expect(body).toContain("Feature agent");
    expect(body).toContain("codex");
  });

  test("inherited rules are rendered separately", () => {
    const inherited = { ...SAMPLE_RULE, id: "rule-inherited", name: "Inherited rule" };
    const { body } = render(Page, { props: { data: makeData([], [inherited]) } });
    expect(body).toContain("data-routing-inherited");
    expect(body).toContain("Inherited rule");
  });
});
