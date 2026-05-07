import { mock } from "bun:test";

export interface RouteAxeViolation {
  id: string;
  impact?: string;
}

export function mockSvelteKitRoute(pathname: string): void {
  mock.module("$app/state", () => ({
    page: {
      url: new URL(`http://localhost${pathname}`),
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

  mock.module("$app/environment", () => ({
    browser: false,
    building: false,
    dev: false,
    version: "test",
  }));
}

export async function auditRoute(
  html: string,
  scope = "body",
): Promise<{ violations: RouteAxeViolation[] }> {
  if (scope !== "body" && scope !== "document") {
    throw new Error(`SSR fallback audit only supports body/document scope: ${scope}`);
  }

  return {
    violations: runSsrA11yFallback(html),
  };
}

function runSsrA11yFallback(html: string): RouteAxeViolation[] {
  const violations: RouteAxeViolation[] = [];

  if ((html.match(/<h1\b/gi) ?? []).length !== 1) {
    violations.push({ id: "page-has-one-h1", impact: "critical" });
  }

  for (const { attrs } of startTags(html, "img")) {
    if (!hasAttr(attrs, "alt")) {
      violations.push({ id: "image-alt", impact: "critical" });
    }
  }

  for (const { attrs } of startTags(html, "*")) {
    if (hasAttr(attrs, "aria-busy") && attrValue(attrs, "role") !== "status") {
      violations.push({ id: "aria-busy-role-status", impact: "serious" });
    }
  }

  const labelTargets = new Set(
    startTags(html, "label")
      .map((tag) => attrValue(tag.attrs, "for"))
      .filter((value): value is string => value !== undefined),
  );

  for (const { attrs } of startTags(html, "input")) {
    const type = attrValue(attrs, "type") ?? "text";
    const id = attrValue(attrs, "id");
    const named =
      hasNonEmptyAttr(attrs, "aria-label") ||
      hasNonEmptyAttr(attrs, "aria-labelledby") ||
      (id !== undefined && labelTargets.has(id));
    if (type !== "hidden" && !named) {
      violations.push({ id: "input-name", impact: "critical" });
    }
  }

  for (const button of buttonTags(html)) {
    if (!hasNonEmptyAttr(button.attrs, "aria-label") && textContent(button.body) === "") {
      violations.push({ id: "button-name", impact: "critical" });
    }
  }

  return violations;
}

function startTags(html: string, tagName: string): Array<{ attrs: string }> {
  const name = tagName === "*" ? "[a-z][\\w:-]*" : tagName;
  const re = new RegExp(`<${name}\\b([^>]*)>`, "gi");
  const tags: Array<{ attrs: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    tags.push({ attrs: match[1] ?? "" });
  }
  return tags;
}

function buttonTags(html: string): Array<{ attrs: string; body: string }> {
  const re = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  const tags: Array<{ attrs: string; body: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    tags.push({ attrs: match[1] ?? "", body: match[2] ?? "" });
  }
  return tags;
}

function hasAttr(attrs: string, name: string): boolean {
  return attrValue(attrs, name) !== undefined;
}

function hasNonEmptyAttr(attrs: string, name: string): boolean {
  return (attrValue(attrs, name) ?? "").trim() !== "";
}

function attrValue(attrs: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}(?:=(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?`, "i");
  const match = attrs.match(re);
  if (!match) return undefined;
  return match[1] ?? match[2] ?? match[3] ?? "";
}

function textContent(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "").trim();
}
