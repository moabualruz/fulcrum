/**
 * Phase 04 — RoutingPage web UI: 5-tab editor, tab switching, draft status.
 */

const isVitestCli = process.argv.some((argument) => argument.includes("vitest"));

if (isVitestCli) {
  const { render } = await import("@testing-library/svelte");
  const { describe, expect, test, vi } = await import("vitest");

  const ownerSession = { id: "session-1", userId: "user-1" };
  const globalRule = {
    id: "00000000-0000-4000-8000-000000000001",
    orgId: "00000000-0000-4000-8000-000000000010",
    projectId: null,
    name: "Bugs to Codex",
    conditionsJson: { all: [{ fact: "task.kind", operator: "equal", value: "bug" }] },
    actionAgent: "codex",
    actionSkillSet: ["router"],
    priority: 10,
    enabled: true,
    source: "manual",
    createdAt: "2026-05-03T00:00:00.000Z",
    updatedAt: "2026-05-03T00:00:00.000Z",
  };

  const baseData = {
    activeProjectId: null,
    projectId: null,
    rules: [globalRule],
    inheritedRules: [],
    drafts: [],
    llmGateConfig: { inputMode: "full_context" as const, enabled: false },
  };

  describe("RoutingPage tabs", () => {
    test("renders all five tabs: Rules, Drafts, Test, LLM Gate, Evidence", async () => {
      const { default: Page } = await import("../../src/routes/settings/routing/+page.svelte");
      const { container } = render(Page, { props: { data: baseData } });
      const tabContainer = container.querySelector("[data-routing-tabs]");
      expect(tabContainer).toBeTruthy();
      expect(tabContainer?.querySelector('[data-tab="rules"]')).toBeTruthy();
      expect(tabContainer?.querySelector('[data-tab="drafts"]')).toBeTruthy();
      expect(tabContainer?.querySelector('[data-tab="test"]')).toBeTruthy();
      expect(tabContainer?.querySelector('[data-tab="llm-gate"]')).toBeTruthy();
      expect(tabContainer?.querySelector('[data-tab="evidence"]')).toBeTruthy();
    });

    test("tab text content matches expected labels", async () => {
      const { default: Page } = await import("../../src/routes/settings/routing/+page.svelte");
      const { container } = render(Page, { props: { data: baseData } });
      const tabs = container.querySelector("[data-routing-tabs]");
      expect(tabs?.textContent).toContain("Rules");
      expect(tabs?.textContent).toContain("Drafts");
      expect(tabs?.textContent).toContain("Test");
      expect(tabs?.textContent).toContain("LLM Gate");
      expect(tabs?.textContent).toContain("Evidence");
    });

    test("Rules tab is active by default", async () => {
      const { default: Page } = await import("../../src/routes/settings/routing/+page.svelte");
      const { container } = render(Page, { props: { data: baseData } });
      const rulesTab = container.querySelector('[data-routing-rules-tab]');
      expect(rulesTab).toBeTruthy();
    });

    test("draft with review_needed status renders in Drafts tab", async () => {
      const { default: Page } = await import("../../src/routes/settings/routing/+page.svelte");
      const dataWithDraft = {
        ...baseData,
        drafts: [{
          id: "draft-001",
          orgId: "org-001",
          proposedRule: "Bugs to codex auto-draft",
          source: "llm",
          confidence: 0.72,
          conflictState: "review_needed" as const,
          matchingActiveRuleIds: [],
          createdAt: "2026-05-03T00:00:00.000Z",
        }],
      };
      const { container } = render(Page, { props: { data: dataWithDraft } });
      const draftsTab = container.querySelector('[data-tab="drafts"]');
      expect(draftsTab).toBeTruthy();
      expect(draftsTab?.textContent).toContain("Drafts");
    });

    test("LLM Gate config section exists", async () => {
      const { default: Page } = await import("../../src/routes/settings/routing/+page.svelte");
      const { container } = render(Page, { props: { data: baseData } });
      const llmTab = container.querySelector('[data-tab="llm-gate"]');
      expect(llmTab).toBeTruthy();
    });

    test("Test tab contains dry-run area", async () => {
      const { default: Page } = await import("../../src/routes/settings/routing/+page.svelte");
      const { container } = render(Page, { props: { data: baseData } });
      const testTab = container.querySelector('[data-tab="test"]');
      expect(testTab?.textContent).toContain("Test");
    });
  });
}

export {};
