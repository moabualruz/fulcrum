<script lang="ts">
  import { cn, Select } from "@fulcrum/ui-kit";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  interface Props {
    branches: string[];
    activeBranch: string;
  }

  let { branches, activeBranch }: Props = $props();

  function onBranchChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    const newBranch = target.value;
    const url = new URL(page.url);
    url.searchParams.set("branch", newBranch);
    goto(url.toString());
  }
</script>

<div data-branch-selector class={cn("flex items-center gap-2")}>
  <label for="branch-select" class={cn("text-sm text-muted-foreground")}>Branch:</label>
  <select
    id="branch-select"
    data-branch-select
    value={activeBranch}
    onchange={onBranchChange}
    class={cn(
      "h-8 rounded-md border border-input bg-background px-2 text-sm",
    )}
  >
    {#each branches as b (b)}
      <option value={b} selected={b === activeBranch}>{b}</option>
    {/each}
  </select>
</div>
