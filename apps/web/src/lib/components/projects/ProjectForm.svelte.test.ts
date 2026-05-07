import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

// `svelte/server` `render()` needs server-compiled `.svelte` modules; the
// global `[test] preload` plugin (`svelte-ssr-preload.ts`) wires this up.

mock.module("$app/forms", () => ({
  enhance: () => ({ destroy() {} }),
  applyAction: async () => {},
  deserialize: (s: string) => JSON.parse(s),
}));

interface ProjectFormShape {
  id: string;
  valid: boolean;
  posted: boolean;
  errors: Record<string, string[] | undefined>;
  data: { name: string; slug: string; description?: string | null };
  message?: unknown;
  constraints: Record<string, unknown>;
  shape?: unknown;
}

type ProjectFormProps = { form: ProjectFormShape };

function makeForm(overrides: Partial<ProjectFormShape> = {}): ProjectFormShape {
  return {
    id: "test-project-form",
    valid: true,
    posted: false,
    errors: {},
    data: { name: "", slug: "", description: "" },
    constraints: {},
    ...overrides,
  };
}

describe("ProjectForm component (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let ProjectForm: Component<ProjectFormProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./ProjectForm.svelte")) as {
      default: Component<ProjectFormProps>;
    };
    ProjectForm = mod.default;
  });

  test("renders flat shadcn-shape form with required data attributes", () => {
    const { body } = render(ProjectForm, { props: { form: makeForm() } });
    expect(body).toContain("data-project-form");
    expect(body).toContain("data-project-name");
    expect(body).toContain("data-project-slug");
    expect(body).toContain("data-project-description");
    expect(body).toContain("data-project-submit");
  });

  test("form element posts via method=POST", () => {
    const { body } = render(ProjectForm, { props: { form: makeForm() } });
    const formMatch = body.match(/<form\b[^>]*data-project-form[^>]*>/);
    expect(formMatch).not.toBeNull();
    expect(formMatch?.[0]).toContain('method="POST"');
  });

  test("when form.errors.name is set, the error string is rendered", () => {
    const { body } = render(ProjectForm, {
      props: {
        form: makeForm({ errors: { name: ["Name is required"] }, valid: false }),
      },
    });
    expect(body).toContain("data-error-name");
    expect(body).toContain("Name is required");
  });

  test("name input value reflects form.data.name when seeded", () => {
    const { body } = render(ProjectForm, {
      props: {
        form: makeForm({ data: { name: "Demo", slug: "demo", description: null } }),
      },
    });
    const inputs = body.match(/<input\b[^>]*>/g) ?? [];
    const nameInput = inputs.find((i) => i.includes("data-project-name"));
    expect(nameInput).toBeDefined();
    expect(nameInput).toContain('value="Demo"');
  });

  test("submit button label is 'Create project'", () => {
    const { body } = render(ProjectForm, { props: { form: makeForm() } });
    expect(body).toMatch(/<button\b[^>]*data-project-submit[^>]*>[\s\S]*?Create project[\s\S]*?<\/button>/);
  });
});
