<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";
  import { cn, Select } from "@fulcrum/ui-kit";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<header class={cn("mb-4 flex items-baseline gap-3 border-b border-border pb-4")}>
  <a href={`/projects/${data.projectId}/intake`} class={cn("text-sm text-muted-foreground hover:underline")}>← Intake</a>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>{data.intake.title}</h1>
  <span data-intake-trace class={cn("font-mono text-xs text-muted-foreground")}>{data.intake.traceId}</span>
</header>

<form method="POST" action="?/update" use:enhance data-intake-detail-form class={cn("max-w-xl space-y-4")}>
  <label class={cn("block text-sm font-medium")} for="intake-title">Title</label>
  <input id="intake-title" name="title" data-intake-title value={data.intake.title} class={cn("border-input bg-background h-9 w-full rounded-md border px-3 text-sm")} />
  <label class={cn("block text-sm font-medium")} for="intake-status">Status</label>
  <select id="intake-status" name="status" data-intake-status class={cn("border-input bg-background h-9 w-full rounded-md border px-3 text-sm")}>
    {#each ["open", "accepted", "declined", "converted"] as status}
      <option value={status} selected={data.intake.status === status}>{status}</option>
    {/each}
  </select>
  <label class={cn("block text-sm font-medium")} for="intake-description">Description</label>
  <textarea id="intake-description" name="description" data-intake-description class={cn("border-input bg-background min-h-24 w-full rounded-md border px-3 py-2 text-sm")}>{data.intake.description ?? ""}</textarea>
  <button type="submit" data-intake-save class={cn("bg-primary text-primary-foreground h-9 rounded-md px-4 text-sm font-medium")}>Save</button>
</form>
