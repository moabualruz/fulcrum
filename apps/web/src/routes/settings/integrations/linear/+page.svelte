<script lang="ts">
  import type { PageData } from "./$types";
  import { CredentialInput } from "@fulcrum/ui-kit";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const featureEnabled = $derived(data.featureEnabled);
</script>

<svelte:head>
  <title>Linear Integration: Fulcrum</title>
</svelte:head>

<div class="page">
  <h1>Linear Integration</h1>

  {#if !featureEnabled}
    <div class="notice">
      <p>
        The <code>connector-linear</code> feature flag is not enabled.
        Set <code>FULCRUM_FEATURES=connector-linear</code> to activate.
      </p>
    </div>
  {:else}
    {#await data.streamed.data}
      <p>Loading...</p>
    {:then resolved}
      <form method="POST" action="?/save">
        <fieldset>
          <legend>Connection</legend>

          <label>
            API Key
            <CredentialInput
              name="api_key"
              placeholder={resolved.hasApiKey ? "••••••••" : "lin_api_..."}
            />
            <small>Leave blank to keep existing key</small>
          </label>

          <label>
            Team ID
            <input
              type="text"
              name="team_id"
              value={resolved.teamId ?? ""}
              placeholder="team-uuid"
              required
            />
          </label>

          <button type="submit">Save</button>
        </fieldset>
      </form>

      <section>
        <h2>Sync Status</h2>
        {#if resolved.recentRuns.length === 0}
          <p>No sync runs yet. Use <code>fulcrum symphony connector linear sync</code> to trigger.</p>
        {:else}
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Started</th>
                <th>Records</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {#each resolved.recentRuns as run}
                <tr>
                  <td>{run.status}</td>
                  <td>{run.started_at}</td>
                  <td>{run.records_synced}</td>
                  <td>{run.error ?? ""}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>
    {:catch error}
      <p class="error">Failed to load: {error.message}</p>
    {/await}
  {/if}
</div>

<style>
  .page { max-width: 640px; margin: 0 auto; padding: 2rem; }
  .notice { background: var(--bg-warning, #fff3cd); padding: 1rem; border-radius: 4px; }
  fieldset { border: 1px solid var(--border, #ccc); padding: 1rem; border-radius: 4px; }
  label { display: block; margin: 0.5rem 0; }
  input { display: block; width: 100%; margin-top: 0.25rem; padding: 0.375rem; }
  small { color: var(--text-muted, #666); }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid var(--border, #eee); }
  .error { color: var(--text-danger, red); }
</style>
