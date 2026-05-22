<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { cn } from "@fulcrum/ui-kit";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  // Live preview of prompt template
  let previewText = $state("");

  function renderPromptPreview(template: string): string {
    // Simple mustache-style variable replacement for preview
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => `[${key}]`);
  }
</script>

{#await data.streamed.data}
  <RouteSkeleton kind="detail" />
{:then payload}
  {@const wf = payload.workflow}
  <header
    data-workflow-editor-header
    class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}
  >
    <div class={cn("flex items-baseline gap-3")}>
      <a href="/settings/orchestration" class={cn("text-sm text-muted-foreground hover:underline")}>← Settings</a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>{wf.name}</h1>
    </div>
  </header>

  <form method="POST" action="?/save" use:enhance data-workflow-editor-form class={cn("flex flex-col gap-4 max-w-2xl")}>
    <label class={cn("flex flex-col gap-1")}>
      <span class={cn("text-sm font-medium")}>Name</span>
      <input
        type="text"
        name="name"
        value={wf.name}
        class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
      />
    </label>

    <label class={cn("flex flex-col gap-1")}>
      <span class={cn("text-sm font-medium")}>Description</span>
      <input
        type="text"
        name="description"
        value={wf.description ?? ""}
        class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
      />
    </label>

    <label class={cn("flex flex-col gap-1")}>
      <span class={cn("text-sm font-medium")}>YAML config</span>
      <textarea
        name="yaml_config"
        rows="10"
        class={cn("border-input bg-background rounded-md border px-3 py-2 text-sm font-mono shadow-xs")}
      >{wf.yaml_config}</textarea>
    </label>

    <label class={cn("flex flex-col gap-1")}>
      <span class={cn("text-sm font-medium")}>Prompt template</span>
      <textarea
        name="prompt_template"
        rows="6"
        oninput={(e) => { previewText = (e.target as HTMLTextAreaElement).value; }}
        class={cn("border-input bg-background rounded-md border px-3 py-2 text-sm font-mono shadow-xs")}
      >{wf.prompt_template}</textarea>
    </label>

    <!-- Prompt preview -->
    <div data-prompt-preview class={cn("rounded-md border border-border bg-muted/30 p-3")}>
      <div class={cn("text-xs text-muted-foreground mb-1")}>Preview</div>
      <pre class={cn("text-sm whitespace-pre-wrap")}>{renderPromptPreview(previewText || wf.prompt_template)}</pre>
    </div>

    <button type="submit" data-save-workflow class={cn("inline-flex h-9 w-fit items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90")}>
      Save workflow
    </button>
  </form>
{/await}
