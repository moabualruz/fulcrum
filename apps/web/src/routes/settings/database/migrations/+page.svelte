<script lang="ts">
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
    form?: { ok?: boolean; message?: string };
  }

  const { data, form }: Props = $props();

  const connectionLabel = $derived(
    data.database.connection.type === "postgres"
      ? data.database.connection.url
      : data.database.connection.dataDir,
  );
</script>

<div class="migrations-page">
  <div class="heading-row">
    <div>
      <h1>Database Migrations</h1>
      <p>{data.database.backend}</p>
    </div>
    <form method="POST" action="?/migrate">
      <button type="submit">Run migrations</button>
    </form>
  </div>

  {#if form?.message}
    <p class="form-message">{form.message}</p>
  {/if}

  <section class="summary-grid" aria-label="Database status">
    <div>
      <span>Connection</span>
      <strong>{connectionLabel}</strong>
    </div>
    <div>
      <span>Current</span>
      <strong>{data.status.current ?? "none"}</strong>
    </div>
    <div>
      <span>Pending</span>
      <strong>{data.status.pending.length}</strong>
    </div>
    <div>
      <span>Past due</span>
      <strong>{data.status.pastDue}</strong>
    </div>
  </section>

  <table>
    <thead>
      <tr>
        <th>Version</th>
        <th>Name</th>
        <th>Direction</th>
        <th>Applied</th>
      </tr>
    </thead>
    <tbody>
      {#each data.history as migration}
        <tr>
          <td>{migration.version}</td>
          <td>{migration.name}</td>
          <td>{migration.direction}</td>
          <td>{migration.appliedAt}</td>
        </tr>
      {:else}
        <tr>
          <td colspan="4" class="empty">No applied migrations</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .migrations-page {
    display: grid;
    gap: 1.5rem;
    padding: 2rem;
  }

  .heading-row {
    align-items: end;
    display: flex;
    gap: 1rem;
    justify-content: space-between;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 650;
    line-height: 1.2;
    margin: 0;
  }

  p {
    color: var(--color-muted, #6b7280);
    margin: 0.25rem 0 0;
  }

  button {
    background: var(--color-primary, #111827);
    border: 0;
    border-radius: 0.375rem;
    color: var(--color-primary-foreground, #ffffff);
    cursor: pointer;
    font: inherit;
    min-height: 2.5rem;
    padding: 0 0.875rem;
  }

  .form-message {
    background: var(--color-warning-muted, #fef3c7);
    border: 1px solid var(--color-warning-border, #f59e0b);
    border-radius: 0.375rem;
    color: var(--color-warning-foreground, #92400e);
    padding: 0.75rem 1rem;
  }

  .summary-grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  }

  .summary-grid div {
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 0.5rem;
    display: grid;
    gap: 0.375rem;
    min-width: 0;
    padding: 0.875rem;
  }

  span {
    color: var(--color-muted, #6b7280);
    font-size: 0.8125rem;
  }

  strong {
    font-size: 0.9375rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  table {
    border-collapse: collapse;
    width: 100%;
  }

  th,
  td {
    border-bottom: 1px solid var(--color-border, #e5e7eb);
    padding: 0.75rem;
    text-align: left;
    vertical-align: top;
  }

  th {
    color: var(--color-muted, #6b7280);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .empty {
    color: var(--color-muted, #6b7280);
    text-align: center;
  }

  @media (max-width: 640px) {
    .heading-row {
      align-items: stretch;
      flex-direction: column;
    }

    button {
      width: 100%;
    }
  }
</style>
