<script lang="ts">
  import type { PageData } from "./$types";

  interface Props { data: PageData; }
  const { data }: Props = $props();

  const doc = data.doc;
  const bodyPreview = doc.bodyMd.length > 500 ? doc.bodyMd.slice(0, 500) + "…" : doc.bodyMd;
</script>

<div data-doc-planning-page class="max-w-2xl mx-auto p-6">
  <header data-doc-planning-header class="mb-4">
    <h1 class="text-xl font-semibold mb-2">Start Planning from Document</h1>
    <p data-doc-planning-context class="text-sm text-muted-foreground">
      Use <strong data-doc-planning-title>{doc.title}</strong> as context for a new planning session.
    </p>
  </header>

  {#if bodyPreview}
    <details data-doc-planning-preview class="mb-6 border rounded p-3">
      <summary class="cursor-pointer text-sm font-medium">Document Preview</summary>
      <pre class="mt-2 text-xs whitespace-pre-wrap text-muted-foreground">{bodyPreview}</pre>
    </details>
  {/if}

  <form method="POST" action="?/startPlanning" data-doc-planning-form>
    {#if doc.projectId}
      <input type="hidden" name="projectId" value={doc.projectId} />
      <p class="text-sm mb-4">
        This document belongs to project <code data-doc-planning-project-id>{doc.projectId}</code>.
        Planning will start in the project context.
      </p>
    {:else}
      <p data-doc-planning-no-project class="text-sm mb-4">
        No project linked. Planning will start as a standalone session.
      </p>
    {/if}

    <button
      type="submit"
      data-doc-planning-submit
      class="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90"
    >
      Start Planning Session
    </button>
    <a href="/docs/{doc.id}" data-doc-planning-back class="ml-3 text-sm text-muted-foreground hover:underline">
      Back to document
    </a>
  </form>
</div>
