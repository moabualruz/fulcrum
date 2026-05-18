<script lang="ts">
  import type { PageData, ActionData } from "./$types";
  import { cn } from "$lib/utils.js";
  import { buttonVariants } from "@fulcrum/ui-kit";

  interface Props {
    data: PageData;
    form: ActionData;
  }

  let { data, form }: Props = $props();

  const retainDays = $derived(form?.retainDays ?? data.retainDays ?? 0);
  const saved = $derived(form?.saved ?? false);
</script>

<header
  data-settings-notifications-header
  class={cn("border-b border-border pb-4 mb-6")}
>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Notification settings</h1>
</header>

<section data-retention-settings class={cn("max-w-lg")}>
  <h2 class={cn("text-lg font-medium mb-2")}>Audit log retention</h2>
  <p class={cn("text-sm text-muted-foreground mb-4")}>
    Set how many days to retain audit events. 0 = keep forever.
  </p>

  <form method="POST" action="?/retention" class={cn("flex items-end gap-3")}>
    <div>
      <label for="retain_days" class={cn("text-sm font-medium")}>Retain days</label>
      <input
        data-retain-days-input
        id="retain_days"
        name="retain_days"
        type="number"
        min="0"
        value={retainDays}
        class={cn("border-input bg-background flex h-9 w-28 rounded-md border px-3 py-1 text-sm shadow-xs mt-1")}
      />
    </div>
    <button
      data-save-retention
      type="submit"
      class={cn(buttonVariants({ variant: "default" }))}
    >Save</button>
  </form>

  {#if saved}
    <p data-retention-saved class={cn("mt-2 text-sm text-green-600")}>Retention policy saved.</p>
  {/if}
</section>
