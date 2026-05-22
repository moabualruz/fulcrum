<script lang="ts">
  import { Select } from "@fulcrum/ui-kit";
  import { enhance } from "$app/forms";
  import type { PageData, ActionData } from "./$types";

  interface Props {
    data: PageData;
    form?: ActionData;
  }

  let { data, form }: Props = $props();

  const localeLabels: Record<string, string> = {
    en: "English",
    ar: "العربية (Arabic)",
  };
</script>

<div class="mx-auto max-w-lg py-8">
  <h1 class="mb-6 text-2xl font-semibold">Language &amp; Region</h1>

  {#if form?.success}
    <div class="mb-4 rounded-md bg-green-50 p-3 text-green-800 dark:bg-green-900/20 dark:text-green-200">
      Locale saved successfully.
    </div>
  {/if}

  {#if form?.error}
    <div class="mb-4 rounded-md bg-red-50 p-3 text-red-800 dark:bg-red-900/20 dark:text-red-200">
      {form.error}
    </div>
  {/if}

  <form method="POST" use:enhance class="space-y-4">
    <div>
      <label for="locale-select" class="mb-1 block text-sm font-medium">Language</label>
      <select
        id="locale-select"
        name="locale"
        value={data.locale}
        class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {#each data.supportedLocales as loc (loc)}
          <option value={loc} selected={data.locale === loc}>
            {localeLabels[loc] ?? loc}
          </option>
        {/each}
      </select>
    </div>

    <button
      type="submit"
      class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
    >
      Save
    </button>
  </form>
</div>
