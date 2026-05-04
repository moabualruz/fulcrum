<script lang="ts">
  /**
   * Settings → Database → Migrations page.
   *
   * ⚠️  STUB (P1#19 round-2 / Pillar 13 / P1#04):
   *     The server load function throws error(501) until Pillar 13 tRPC wiring
   *     and P1#04 SvelteKit locals wiring land. This page will never render
   *     in its current form — the error page is shown instead.
   *
   *     This component is kept as a placeholder so the route exists and the
   *     page.server.ts interface is defined. When Pillar 13 lands:
   *       1. Remove the error() throw from +page.server.ts.
   *       2. Restore the load / action implementation.
   *       3. Restore the template below from git history.
   *
   * C4: Web surface at feature parity with CLI (deferred pending P1#04 + P13).
   */

  // No data/form props needed — load always throws error(501).
</script>

<div class="migrations-page">
  <h1>Database Migrations</h1>
  <p class="not-wired">
    This page requires Pillar 13 tRPC wiring and P1#04 SvelteKit locals
    wiring before it can display data.
    Use <code>fulcrum db status</code> and <code>fulcrum db history</code>
    from the CLI in the meantime.
  </p>
</div>

<style>
  .migrations-page {
    max-width: 900px;
    padding: 2rem;
  }

  .not-wired {
    color: var(--color-muted, #6b7280);
    font-style: italic;
  }

  code {
    font-family: monospace;
    background: var(--color-surface-alt, #f3f4f6);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
  }
</style>

