<script lang="ts">
  import { onMount } from "svelte";

  let reconnecting = $state(false);

  onMount(() => {
    const handleOnline = () => {
      reconnecting = true;
      // Give the SW a moment to sync before navigating back
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  });
</script>

<main class="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
  <div class="flex flex-col items-center gap-4">
    <svg
      aria-hidden="true"
      class="h-16 w-16 text-muted-foreground"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 3l18 18M8.111 8.111A8 8 0 0 0 4.93 14.93M15.89 8.11A8 8 0 0 1 19.07 14.93M12 20.01V20M6.343 6.343A12 12 0 0 0 3.515 12M17.657 6.343A12 12 0 0 1 20.485 12"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>

    <h1 class="text-2xl font-semibold tracking-tight">
      {reconnecting ? "Reconnecting…" : "You're offline"}
    </h1>

    <p class="max-w-sm text-muted-foreground" data-testid="offline-message">
      {reconnecting
        ? "Connection restored — taking you back…"
        : "You're offline, reconnecting… Any changes you make will be saved and synced when you're back online."}
    </p>
  </div>

  {#if !reconnecting}
    <button
      class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      onclick={() => window.location.reload()}
      type="button"
    >
      Try again
    </button>
  {/if}
</main>
