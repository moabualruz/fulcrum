import { fireEvent, render, waitFor } from "@testing-library/svelte";
import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "vitest";

import {
  applyTemplateSelectionChange,
  createInitialTemplateState,
  markTemplateBodyEdited,
} from "../../src/lib/docs/template-picker";

const templates = {
  spec: "# Spec Title\n\n## Requirements\n",
  adr: "# ADR Title\n\n## Context\n\n## Decision\n\n## Consequences\n",
  wiki: "# Wiki Page\n\n## Details\n",
  runbook: "# Runbook Title\n\n## Steps\n",
  meeting: "# Meeting Notes\n\n## Agenda\n",
  postmortem: "# Postmortem\n\n## Root Cause\n",
  rfc: "# RFC Title\n\n## Proposal\n",
  note: "# Note Title\n\n",
  scratch: "",
};

function formState() {
  return {
    data: {
      title: "",
      kind: "",
      labels: "",
      body: "",
      projectId: null,
    },
    errors: {},
  };
}

describe("/docs/new component template picker", () => {
  let DocsNewPage: Component;

  beforeAll(async () => {
    DocsNewPage = (await import("../../src/routes/docs/new/+page.svelte")).default as Component;
  });

  test("selecting a seeded doc type populates the MarkdownEditor body", async () => {
    const { container, getByLabelText } = render(DocsNewPage, {
      props: {
        data: { form: formState(), templates },
        form: undefined,
      },
    });

    const kind = getByLabelText("Kind") as HTMLSelectElement;
    expect(Array.from(kind.options).map((option) => option.value)).toEqual(Object.keys(templates));

    await fireEvent.change(kind, { target: { value: "adr" } });

    await waitFor(() => {
      const bodyInput = container.querySelector<HTMLInputElement>('input[name="body"]');
      expect(bodyInput?.value).toBe(templates.adr);
    });
    const editorSource = container.querySelector<HTMLTextAreaElement>(
      "[data-markdown-editor-source]",
    );
    expect(editorSource?.value).toBe(templates.adr);
  });

  test("doc type changes do not clobber edited bodies", () => {
    const initial = createInitialTemplateState({
      formKind: "spec",
      formBody: "",
      templates,
    });
    const edited = markTemplateBodyEdited(initial, "User-written body");
    const changed = applyTemplateSelectionChange(edited, "rfc", templates);

    expect(changed.kind).toBe("rfc");
    expect(changed.body).toBe("User-written body");
    expect(changed.lastTemplate).toBe(templates.rfc);
    expect(changed.bodyEdited).toBe(true);
  });
});
