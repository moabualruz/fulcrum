<script lang="ts">
  type SpaceRole = "viewer" | "editor" | "admin";
  type Assignment = { id: string; principal: string; role: SpaceRole };

  let assignments = $state<Assignment[]>([
    { id: "a1", principal: "engineering@team", role: "editor" },
    { id: "a2", principal: "alice", role: "admin" },
  ]);
  let newPrincipal = $state("");
  let newRole = $state<SpaceRole>("viewer");
  let inheritFromWorkspace = $state(true);
  let lastAction = $state<string | null>(null);

  function add(event: Event): void {
    event.preventDefault();
    if (!newPrincipal.trim()) return;
    assignments = [...assignments, { id: `a${assignments.length + 1}`, principal: newPrincipal.trim(), role: newRole }];
    newPrincipal = "";
    lastAction = "added";
  }

  function changeRole(id: string, role: SpaceRole): void {
    assignments = assignments.map((a) => (a.id === id ? { ...a, role } : a));
    lastAction = "role-changed";
  }

  function remove(id: string): void {
    assignments = assignments.filter((a) => a.id !== id);
    lastAction = "removed";
  }
</script>

<svelte:head><title>Space permissions | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-2xl space-y-4 p-6" data-space-permissions-page>
  <h1 class="text-2xl font-semibold">Space permissions</h1>

  <label class="flex items-center gap-2 text-sm">
    <input type="checkbox" data-space-inherit bind:checked={inheritFromWorkspace} />
    Inherit from workspace
  </label>
  <p data-space-inherit-state class="text-xs text-muted-foreground">Inheritance: {inheritFromWorkspace ? "on" : "off"} (off → only members below have access)</p>

  <form onsubmit={add} class="flex flex-wrap items-end gap-2 rounded-md border border-border p-3">
    <label class="flex flex-col gap-1 text-xs">
      Principal
      <input data-space-new-principal bind:value={newPrincipal} class="rounded-md border border-border bg-background px-2 py-1 text-sm" />
    </label>
    <label class="flex flex-col gap-1 text-xs">
      Role
      <select data-space-new-role bind:value={newRole} class="rounded-md border border-border bg-background px-2 py-1 text-sm">
        <option value="viewer">viewer</option>
        <option value="editor">editor</option>
        <option value="admin">admin</option>
      </select>
    </label>
    <button type="submit" data-space-add class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Add</button>
  </form>

  <ul class="space-y-2" data-space-table>
    {#each assignments as a}
      <li data-space-row={a.id} data-space-role={a.role} class="flex items-center justify-between rounded-md border border-border p-2">
        <span class="text-sm">{a.principal}</span>
        <div class="flex items-center gap-2">
          <select data-space-row-role={a.id} value={a.role} onchange={(e) => changeRole(a.id, (e.target as HTMLSelectElement).value as SpaceRole)} class="rounded-md border border-border bg-background px-2 py-1 text-xs">
            <option value="viewer">viewer</option>
            <option value="editor">editor</option>
            <option value="admin">admin</option>
          </select>
          <button type="button" data-space-row-remove={a.id} onclick={() => remove(a.id)} class="rounded-md border border-border px-2 py-0.5 text-xs">Remove</button>
        </div>
      </li>
    {/each}
  </ul>

  {#if lastAction}
    <p data-space-last-action class="text-xs text-muted-foreground">Last action: {lastAction}</p>
  {/if}
</main>
