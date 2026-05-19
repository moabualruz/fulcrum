<script lang="ts">
  type Token = { id: string; name: string; createdAt: string; lastUsed: string | null; scopes: string[]; revoked: boolean; secretPreview: string };

  let tokens = $state<Token[]>([
    { id: "tk1", name: "ci-deploy", createdAt: "2026-04-01", lastUsed: "2026-05-18", scopes: ["read", "write"], revoked: false, secretPreview: "tok_…aB12" },
  ]);
  let newName = $state("");
  let newScopes = $state<string[]>(["read"]);
  let revealed = $state<{ name: string; secret: string } | null>(null);
  let error = $state<string | null>(null);

  function toggleScope(scope: string): void {
    newScopes = newScopes.includes(scope) ? newScopes.filter((s) => s !== scope) : [...newScopes, scope];
  }

  function create(event: Event): void {
    event.preventDefault();
    if (!newName.trim()) { error = "Token name is required."; return; }
    if (tokens.some((t) => t.name === newName.trim())) { error = "Token name already exists."; return; }
    error = null;
    const secret = `tok_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    revealed = { name: newName.trim(), secret };
    tokens = [
      ...tokens,
      { id: `tk${tokens.length + 1}`, name: newName.trim(), createdAt: "2026-05-19", lastUsed: null, scopes: [...newScopes], revoked: false, secretPreview: `${secret.slice(0, 4)}…${secret.slice(-4)}` },
    ];
    newName = "";
  }

  function revoke(id: string): void {
    tokens = tokens.map((t) => (t.id === id ? { ...t, revoked: true } : t));
  }

  function dismissReveal(): void { revealed = null; }
</script>

<svelte:head><title>API tokens | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-4 p-6" data-api-tokens-page>
  <h1 class="text-2xl font-semibold">API tokens</h1>

  <form onsubmit={create} class="space-y-2 rounded-md border border-border p-4">
    <label class="flex flex-col gap-1 text-xs">
      Token name
      <input data-token-name bind:value={newName} aria-required="true" class="rounded-md border border-border bg-background px-2 py-1 text-sm" />
    </label>
    <fieldset class="space-y-1 text-xs">
      <legend>Scopes</legend>
      {#each ["read", "write", "admin"] as scope}
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            data-token-scope={scope}
            checked={newScopes.includes(scope)}
            onchange={() => toggleScope(scope)}
          />
          {scope}
        </label>
      {/each}
    </fieldset>
    {#if error}
      <p data-token-error class="text-xs text-destructive">{error}</p>
    {/if}
    <button type="submit" data-token-create class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Create token</button>
  </form>

  {#if revealed}
    <div data-token-revealed class="space-y-2 rounded-md border border-primary p-3 text-xs">
      <p><strong>Token created.</strong> Copy now — you will not see the full value again.</p>
      <p>Name: <span data-token-revealed-name>{revealed.name}</span></p>
      <pre data-token-revealed-secret class="overflow-auto rounded-md bg-muted p-2">{revealed.secret}</pre>
      <button type="button" data-token-revealed-dismiss onclick={dismissReveal} class="rounded-md border border-border px-3 py-0.5">Dismiss</button>
    </div>
  {/if}

  <table class="w-full text-sm" data-token-table>
    <thead>
      <tr class="text-left text-xs text-muted-foreground">
        <th>Name</th><th>Created</th><th>Last used</th><th>Scopes</th><th>Preview</th><th>State</th><th></th>
      </tr>
    </thead>
    <tbody>
      {#each tokens as t}
        <tr data-token-row={t.id} data-token-revoked={t.revoked}>
          <td data-token-row-name>{t.name}</td>
          <td>{t.createdAt}</td>
          <td>{t.lastUsed ?? "never"}</td>
          <td>{t.scopes.join(", ")}</td>
          <td><code>{t.secretPreview}</code></td>
          <td>{t.revoked ? "revoked" : "active"}</td>
          <td>
            {#if !t.revoked}
              <button type="button" data-token-revoke={t.id} onclick={() => revoke(t.id)} class="rounded-md border border-border px-2 py-0.5 text-xs">Revoke</button>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</main>
