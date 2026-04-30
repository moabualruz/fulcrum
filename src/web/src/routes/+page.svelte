<script lang="ts">
</script>

<div class="grid gap-4 md:grid-cols-2">
  <section class="rounded-lg border border-border p-5">
    <h2 class="font-semibold">Local product kernel</h2>
    <p class="text-xs text-muted-foreground mt-1">
      Backed by PGlite at ~/.fulcrum/state/product/db/main
    </p>
    <p class="text-sm text-muted-foreground mt-3">
      Initialise the kernel with <code class="font-mono">fulcrum product init</code>. Every view in
      this shell reads the live database; no static fixtures.
    </p>
  </section>
  <section class="rounded-lg border border-border p-5">
    <h2 class="font-semibold">Read-only views</h2>
    <p class="text-xs text-muted-foreground mt-1">Projects · Docs · Boards · Runs</p>
    <p class="text-sm text-muted-foreground mt-3">
      Mutations stay on the CLI for now. The shell exists to prove the kernel surfaces are stable
      before wiring write paths.
    </p>
  </section>
</div>
