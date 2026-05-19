<script lang="ts">
  type SubsystemStatus = "ok" | "warn" | "fail";
  type Subsystem = { name: string; status: SubsystemStatus; lastCheck: string };

  const SUBSYSTEMS: Subsystem[] = [
    { name: "database", status: "ok", lastCheck: "30s ago" },
    { name: "queue", status: "warn", lastCheck: "1m ago" },
    { name: "inference", status: "ok", lastCheck: "15s ago" },
    { name: "search", status: "fail", lastCheck: "5m ago" },
  ];

  const ICONS: Record<SubsystemStatus, string> = { ok: "✓", warn: "⚠", fail: "✗" };
</script>

<svelte:head><title>Mobile doctor | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-md space-y-3 p-4" data-mobile-doctor-page>
  <h1 class="text-xl font-semibold">Doctor</h1>

  <ul class="space-y-2" data-mobile-subsystems>
    {#each SUBSYSTEMS as s}
      <li
        data-mobile-subsystem={s.name}
        data-mobile-status={s.status}
        class="flex items-center justify-between rounded-md border border-border p-3"
      >
        <span class="flex items-center gap-2 text-sm">
          <span data-mobile-status-icon aria-hidden="true">{ICONS[s.status]}</span>
          {s.name}
        </span>
        <span data-mobile-last-check class="text-xs text-muted-foreground">{s.lastCheck}</span>
      </li>
    {/each}
  </ul>
</main>
