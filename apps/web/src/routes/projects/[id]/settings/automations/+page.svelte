<script lang="ts">
  import type { PageData } from "./$types";
  import { cn } from "$lib/utils.js";
  import AutomationRuleList from "$lib/components/tasks/AutomationRuleList.svelte";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<header class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-6")}>
  <div class={cn("flex items-baseline gap-3")}>
    <a href="/projects/{data.projectId}/settings" class={cn("text-sm text-muted-foreground hover:underline")}>← Settings</a>
    <h1 class={cn("text-2xl font-semibold tracking-tight")}>Automations</h1>
  </div>
</header>

<AutomationRuleList projectId={data.projectId} orgId={data.orgId} currentUserId={data.currentUserId} />
