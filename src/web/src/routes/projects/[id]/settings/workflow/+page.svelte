<script lang="ts">
  import type { PageData } from "./$types";
  import { cn } from "$lib/utils.js";
  import WorkflowEditor from "$lib/components/tasks/WorkflowEditor.svelte";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<header class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-6")}>
  <div class={cn("flex items-baseline gap-3")}>
    <a href="/projects/{data.projectId}/settings" class={cn("text-sm text-muted-foreground hover:underline")}>← Settings</a>
    <h1 class={cn("text-2xl font-semibold tracking-tight")}>Workflow</h1>
  </div>
</header>

<WorkflowEditor projectId={data.projectId} />
