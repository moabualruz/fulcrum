<script lang="ts">
  /**
   * Settings → Database → Migrations page.
   *
   * Shows:
   *   - Migration status (current version + pending count).
   *   - Full migration history table (version, name, direction, applied-at).
   *   - Target-version picker form to run `migrate` action.
   *
   * C4: Web surface at feature parity with CLI.
   */

  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let targetVersion = $state("");
  let force = $state(false);
</script>

<div class="migrations-page">
  <h1>Database Migrations</h1>

  {#await data.streamed.migrations}
    <p>Loading migration data…</p>
  {:then migrations}
    <!-- Status card -->
    <section class="status-card">
      <h2>Status</h2>
      <dl>
        <dt>Current version</dt>
        <dd>{migrations.status.current ?? "(none applied)"}</dd>
        <dt>Pending migrations</dt>
        <dd>{migrations.status.pastDue}</dd>
        {#if migrations.status.pending.length > 0}
          <dt>Pending list</dt>
          <dd>
            <ul>
              {#each migrations.status.pending as name}
                <li>{name}</li>
              {/each}
            </ul>
          </dd>
        {/if}
      </dl>
    </section>

    <!-- Migrate form -->
    <section class="migrate-form">
      <h2>Run Migration</h2>
      {#if form?.success === false}
        <p class="error">Error: {form.error}</p>
      {/if}
      {#if form?.success === true}
        <p class="success">Migration completed successfully.</p>
      {/if}
      <form method="POST" action="?/migrate">
        <label>
          Target version
          <input
            name="targetVersion"
            type="text"
            placeholder="Leave blank for latest"
            bind:value={targetVersion}
          />
        </label>
        <label>
          <input name="force" type="checkbox" bind:checked={force} value="true" />
          Force (allow lossy down-migrations)
        </label>
        <button type="submit">Migrate</button>
      </form>
    </section>

    <!-- History table -->
    <section class="history-table">
      <h2>Migration History</h2>
      {#if migrations.history.length === 0}
        <p>No migrations recorded in the Fulcrum ledger yet.</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th>Version</th>
              <th>Name</th>
              <th>Direction</th>
              <th>Applied At</th>
              <th>Checksum</th>
            </tr>
          </thead>
          <tbody>
            {#each migrations.history as row}
              <tr class:down={row.direction === "down"}>
                <td>{row.version}</td>
                <td>{row.name}</td>
                <td>{row.direction}</td>
                <td>{row.appliedAt}</td>
                <td title={row.checksum}>{row.checksum.slice(0, 12)}…</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
  {:catch err}
    <p class="error">Failed to load migration data: {err.message}</p>
  {/await}
</div>

<style>
  .migrations-page {
    max-width: 900px;
    padding: 2rem;
  }

  .status-card,
  .migrate-form,
  .history-table {
    margin-bottom: 2rem;
    padding: 1rem;
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 0.5rem;
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1rem;
  }

  dt {
    font-weight: 600;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  th,
  td {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border, #e2e8f0);
    text-align: left;
  }

  th {
    background: var(--color-surface-alt, #f8fafc);
    font-weight: 600;
  }

  tr.down td {
    opacity: 0.6;
  }

  .error {
    color: var(--color-danger, #dc2626);
  }

  .success {
    color: var(--color-success, #16a34a);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: 400px;
  }

  input[type="text"] {
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 0.25rem;
    width: 100%;
    margin-top: 0.25rem;
  }

  button[type="submit"] {
    padding: 0.5rem 1rem;
    background: var(--color-primary, #3b82f6);
    color: white;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    width: max-content;
  }
</style>
