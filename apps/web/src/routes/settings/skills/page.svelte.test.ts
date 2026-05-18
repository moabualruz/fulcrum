import type { Component } from "svelte";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/settings/skills"),
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

interface SkillItem {
  id: string;
  slug: string;
  version: string;
  source: "local" | "upstream";
  upstream_repo: string | null;
  content_hash: string | null;
  enabled_agents: string[];
  upstream_conflict: {
    local_content: string;
    upstream_content: string;
    installed_skill: string;
    installed_version: string;
    requested_skill: string;
    requested_version: string;
    reason: string;
    alt_versions: string[];
    recommended_resolution: "alt_version" | "skip" | "force" | "keep_local" | "use_upstream" | "upgrade_installed";
    force_safe: boolean;
    session_resolution: "alt_version" | "skip" | "force" | "keep_local" | "use_upstream" | "upgrade_installed" | null;
  } | null;
}

type PageProps = {
  data: {
    streamed: {
      data: Promise<{ skills: SkillItem[] }> | { skills: SkillItem[] };
    };
  };
};

const SAMPLE: SkillItem[] = [
  {
    id: "01SKILL00000000000000000001",
    slug: "jq",
    version: "0.0.1",
    source: "local",
    upstream_repo: null,
    content_hash: "abc123",
    enabled_agents: ["claude", "codex"],
    upstream_conflict: null,
  },
  {
    id: "01SKILL00000000000000000002",
    slug: "bat",
    version: "1.0.0",
    source: "upstream",
    upstream_repo: "https://github.com/ex/bat",
    content_hash: "def456",
    enabled_agents: [],
    upstream_conflict: null,
  },
];

const CONFLICT_SAMPLE: SkillItem[] = [
  {
    id: "01SKILL00000000000000000003",
    slug: "conflicted",
    version: "0.1.0",
    source: "upstream",
    upstream_repo: "https://github.com/ex/conflict",
    content_hash: "old",
    enabled_agents: [],
    upstream_conflict: {
      local_content: "local version content",
      upstream_content: "upstream version content",
      installed_skill: "conflicted",
      installed_version: "v1",
      requested_skill: "conflicted-candidate",
      requested_version: "v2",
      reason: "Incompatible tools/API",
      alt_versions: ["v1.latest", "v2.compat"],
      recommended_resolution: "alt_version",
      force_safe: false,
      session_resolution: null,
    },
  },
];

function pageData(skills: SkillItem[]): PageProps["data"] {
  return { streamed: { data: { skills } } };
}

describe("/settings/skills +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders RouteSkeleton while streamed data is pending", () => {
    const pending = new Promise<{ skills: SkillItem[] }>(() => {});
    const { body } = render(Page, {
      props: { data: { streamed: { data: pending } } },
    });
    expect(body).toContain("data-route-skeleton");
  });

  test("renders empty-state when no skills", () => {
    const { body } = render(Page, { props: { data: pageData([]) } });
    expect(body).toContain("data-empty-skills");
    expect(body).toContain("No skills installed");
  });

  test("renders skills table with correct rows", () => {
    const { body } = render(Page, { props: { data: pageData(SAMPLE) } });
    const rows = body.match(/data-skill-row/g) ?? [];
    expect(rows).toHaveLength(2);
    expect(body).toContain("jq");
    expect(body).toContain("bat");
    expect(body).toContain("0.0.1");
    expect(body).toContain("1.0.0");
    expect(body).toContain("local");
    expect(body).toContain("upstream");
  });

  test("renders install form with slug and repo fields", () => {
    const { body } = render(Page, { props: { data: pageData([]) } });
    expect(body).toContain("data-install-form");
    expect(body).toContain("data-install-slug");
    expect(body).toContain("data-install-repo");
    expect(body).toContain("data-install-submit");
  });

  test("renders upgrade and uninstall buttons per skill", () => {
    const { body } = render(Page, { props: { data: pageData(SAMPLE) } });
    const upgradeButtons = body.match(/data-upgrade-skill/g) ?? [];
    const uninstallButtons = body.match(/data-uninstall-skill/g) ?? [];
    expect(upgradeButtons).toHaveLength(2);
    expect(uninstallButtons).toHaveLength(2);
  });

  test("renders upgrade-all button in header", () => {
    const { body } = render(Page, { props: { data: pageData(SAMPLE) } });
    expect(body).toContain("data-upgrade-all");
    expect(body).toContain("Upgrade all");
  });

  test("renders agent toggle buttons for each skill", () => {
    const { body } = render(Page, { props: { data: pageData(SAMPLE) } });
    const toggles = body.match(/data-agent-toggle/g) ?? [];
    // 5 agents * 2 skills = 10
    expect(toggles).toHaveLength(10);
  });

  test("agent toggle shows pressed state for enabled agents", () => {
    const { body } = render(Page, { props: { data: pageData(SAMPLE) } });
    // jq has claude and codex enabled
    const jqSection = body.slice(body.indexOf('data-skill-slug="jq"'));
    const claudeToggle = jqSection.match(/data-agent="claude"[^>]*aria-pressed="true"/);
    expect(claudeToggle).not.toBeNull();
  });

  test("renders conflict dialog when upstream_conflict present", () => {
    const { body } = render(Page, { props: { data: pageData(CONFLICT_SAMPLE) } });
    const source = readFileSync(new URL("./+page.svelte", import.meta.url), "utf8");
    expect(body).toContain("data-conflict-card");
    expect(body).toContain('data-conflict-slug="conflicted"');
    expect(source).toContain("data-conflict-resolution-dialog");
    expect(source).toContain("installed_version");
    expect(source).toContain("requested_version");
    expect(source).toContain("reason");
    expect(source).toContain("data-recommended-resolution");
    expect(source).toContain('data-conflict-option="alt_version"');
    expect(source).toContain('data-conflict-option="force"');
    expect(source).toContain('data-conflict-option="skip"');
    expect(source).toContain('data-conflict-option="upgrade_installed"');
    expect(source).toContain("data-alt-version-select");
    expect(source).toContain("data-force-warning-ack");
    expect(source).toContain("data-alt-version-confirm");
    expect(source).toContain("data-force-conflict");
    expect(source).toContain("data-skip-conflict");
    expect(source).toContain("data-upgrade-installed-first");
    expect(source).toContain("data-keep-local");
    expect(source).toContain("data-use-upstream");
    expect(source).toContain("Use alt version");
    expect(source).toContain("Upgrade installed first");
  });

  test("does not render conflict card when no conflict", () => {
    const { body } = render(Page, { props: { data: pageData(SAMPLE) } });
    expect(body).not.toContain("data-conflict-card");
  });

  test("header h1 reads 'Skills'", () => {
    const { body } = render(Page, { props: { data: pageData([]) } });
    expect(body).toMatch(/<h1\b[^>]*>\s*Skills\s*<\/h1>/);
  });

  test("side-by-side diff shows Local and Upstream columns", () => {
    const source = readFileSync(new URL("./+page.svelte", import.meta.url), "utf8");
    expect(source).toContain("data-conflict-local");
    expect(source).toContain("data-conflict-upstream");
  });

  test("conflict choices are persisted to session storage", () => {
    const source = readFileSync(new URL("./+page.svelte", import.meta.url), "utf8");
    expect(source).toContain("sessionStorage.setItem");
    expect(source).toContain("fulcrum.skillConflictResolution");
  });
});
