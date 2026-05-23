<script lang="ts">
  import type { PageData, ActionData } from "./$types";
  import { cn, Select } from "@fulcrum/ui-kit";
  import { buttonVariants } from "@fulcrum/ui-kit";

  interface Props {
    data: PageData;
    form: ActionData;
  }

  let { data, form }: Props = $props();

  const retainDays = $derived(form?.retainDays ?? data.retainDays ?? 0);
  const saved = $derived(form?.saved ?? false);

  type DigestMode = "daily" | "weekly" | "never";
  const CATEGORIES = ["mentions", "comments", "page_updates", "subscriptions"] as const;
  type Category = (typeof CATEGORIES)[number];

  let emailEnabled = $state(true);
  let inAppEnabled = $state(true);
  let quietStart = $state("");
  let quietEnd = $state("");
  let categoryEnabled = $state<Record<Category, boolean>>({
    mentions: true,
    comments: true,
    page_updates: true,
    subscriptions: true,
  });
  let mutedPage = $state("");
  let mutedPages = $state<string[]>([]);
  let digest = $state<DigestMode>("daily");
  let validationError = $state<string | null>(null);
  let prefsSaved = $state(false);

  function validHour(value: string): boolean {
    if (value === "") return true;
    const [h, m] = value.split(":").map((part) => Number.parseInt(part, 10));
    return Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h < 24 && m >= 0 && m < 60;
  }

  function muteCurrentPage(): void {
    const trimmed = mutedPage.trim();
    if (!trimmed) return;
    if (mutedPages.includes(trimmed)) return;
    mutedPages = [...mutedPages, trimmed];
    mutedPage = "";
  }

  function unmutePage(name: string): void {
    mutedPages = mutedPages.filter((page) => page !== name);
  }

  function savePreferences(event: Event): void {
    event.preventDefault();
    if (!validHour(quietStart) || !validHour(quietEnd)) {
      validationError = "Quiet hours must use HH:MM in the 0–24 range.";
      prefsSaved = false;
      return;
    }
    if (!(["daily", "weekly", "never"] as DigestMode[]).includes(digest)) {
      validationError = "Email digest must be daily, weekly, or never.";
      prefsSaved = false;
      return;
    }
    validationError = null;
    prefsSaved = true;
  }
</script>

<header
  data-settings-notifications-header
  class={cn("border-b border-border pb-4 mb-6")}
>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Notification settings</h1>
</header>

<section data-notification-preferences class={cn("mb-8 max-w-2xl space-y-6")}>
  <form
    method="dialog"
    data-notification-preferences-form
    class={cn("flex flex-col gap-6")}
    onsubmit={savePreferences}
  >
    <section data-notification-delivery class={cn("rounded-md border border-border p-4")}>
      <h2 class={cn("text-lg font-medium mb-3")}>Delivery</h2>
      <div class={cn("flex flex-col gap-3 text-sm")}>
        <label class={cn("flex items-center justify-between gap-2")}>
          <span>Email notifications</span>
          <input
            type="checkbox"
            data-delivery-email-toggle
            bind:checked={emailEnabled}
          />
        </label>
        <label class={cn("flex items-center justify-between gap-2")}>
          <span>In-app notifications</span>
          <input
            type="checkbox"
            data-delivery-inapp-toggle
            bind:checked={inAppEnabled}
          />
        </label>
        <div class={cn("flex flex-col gap-1")}>
          <span class={cn("text-xs font-medium text-muted-foreground")}>
            Quiet hours (suppress email; in-app still shows)
          </span>
          <div class={cn("flex items-center gap-2")}>
            <input
              type="time"
              data-quiet-hours-start
              bind:value={quietStart}
              class={cn("h-9 rounded-md border border-input bg-background px-2 text-sm")}
              aria-label="Quiet hours start"
            />
            <span class={cn("text-muted-foreground")}>to</span>
            <input
              type="time"
              data-quiet-hours-end
              bind:value={quietEnd}
              class={cn("h-9 rounded-md border border-input bg-background px-2 text-sm")}
              aria-label="Quiet hours end"
            />
          </div>
        </div>
      </div>
    </section>

    <section data-notification-categories class={cn("rounded-md border border-border p-4")}>
      <h2 class={cn("text-lg font-medium mb-3")}>Categories</h2>
      <p class={cn("text-xs text-muted-foreground mb-3")}>
        Muting a category affects both in-app and email delivery.
      </p>
      <div class={cn("flex flex-col gap-2 text-sm")}>
        {#each CATEGORIES as category (category)}
          <label class={cn("flex items-center justify-between gap-2")}>
            <span class={cn("capitalize")}>{category.replace(/_/g, " ")}</span>
            <input
              type="checkbox"
              data-notification-category={category}
              bind:checked={categoryEnabled[category]}
            />
          </label>
        {/each}
      </div>
    </section>

    <section data-notification-per-page class={cn("rounded-md border border-border p-4")}>
      <h2 class={cn("text-lg font-medium mb-3")}>Per-page rules</h2>
      <p class={cn("text-xs text-muted-foreground mb-3")}>
        Page-level mute overrides global category settings.
      </p>
      <div class={cn("flex items-center gap-2")}>
        <input
          type="text"
          data-mute-page-input
          bind:value={mutedPage}
          placeholder="Page name"
          class={cn("h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm")}
        />
        <button
          type="button"
          data-mute-page
          onclick={muteCurrentPage}
          class={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >Mute page</button>
      </div>
      {#if mutedPages.length > 0}
        <ul data-muted-pages class={cn("mt-3 flex flex-wrap gap-2 text-xs")}>
          {#each mutedPages as page (page)}
            <li
              data-muted-page={page}
              class={cn("inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5")}
            >
              <span>{page}</span>
              <button
                type="button"
                data-unmute-page={page}
                onclick={() => unmutePage(page)}
                class={cn("text-destructive")}
                aria-label={`Unmute ${page}`}
              >×</button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section data-notification-digest class={cn("rounded-md border border-border p-4")}>
      <h2 class={cn("text-lg font-medium mb-3")}>Email digest</h2>
      <select
        bind:value={digest}
        data-digest-select
        class={cn("h-9 w-40 rounded-md border border-input bg-background px-2 text-sm")}
      >
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="never">Never</option>
      </select>
    </section>

    <div class={cn("flex items-center gap-3")}>
      <button
        type="submit"
        data-save-preferences
        class={cn(buttonVariants({ variant: "primary" }))}
      >Save preferences</button>
      {#if prefsSaved && !validationError}
        <span data-preferences-saved class={cn("text-sm text-green-600")}>Preferences saved.</span>
      {/if}
      {#if validationError}
        <span data-preferences-error class={cn("text-sm text-destructive")}>{validationError}</span>
      {/if}
    </div>
  </form>
</section>

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
      class={cn(buttonVariants({ variant: "primary" }))}
    >Save</button>
  </form>

  {#if saved}
    <p data-retention-saved class={cn("mt-2 text-sm text-green-600")}>Retention policy saved.</p>
  {/if}
</section>
