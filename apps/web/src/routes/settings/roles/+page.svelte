<script lang="ts">
  import { cn } from "$lib/utils.js";

  type Role = "owner" | "admin" | "member" | "guest";
  type Scope = "workspace" | "space";

  interface Capability {
    id: string;
    label: string;
    description: string;
    scope: Scope;
    granted: Record<Role, boolean>;
  }

  const ROLES: Role[] = ["owner", "admin", "member", "guest"];

  const CAPABILITIES: Capability[] = [
    {
      id: "manage_workspace",
      label: "Manage workspace settings",
      description: "Edit workspace name, slug lock, branding, and integrations.",
      scope: "workspace",
      granted: { owner: true, admin: true, member: false, guest: false },
    },
    {
      id: "manage_members",
      label: "Manage workspace members",
      description: "Invite, change role, or remove members. Owners cannot be demoted.",
      scope: "workspace",
      granted: { owner: true, admin: true, member: false, guest: false },
    },
    {
      id: "delete_workspace",
      label: "Delete workspace",
      description: "Permanent removal with grace period; only Owner can initiate.",
      scope: "workspace",
      granted: { owner: true, admin: false, member: false, guest: false },
    },
    {
      id: "create_space",
      label: "Create space",
      description: "Spin up a new collaboration space within the workspace.",
      scope: "workspace",
      granted: { owner: true, admin: true, member: true, guest: false },
    },
    {
      id: "edit_doc",
      label: "Edit document",
      description: "Author and revise content inside a space.",
      scope: "space",
      granted: { owner: true, admin: true, member: true, guest: false },
    },
    {
      id: "comment",
      label: "Comment on documents",
      description: "Add review comments without modifying content.",
      scope: "space",
      granted: { owner: true, admin: true, member: true, guest: true },
    },
    {
      id: "delete_doc",
      label: "Delete documents",
      description: "Soft-delete and restore documents inside a space.",
      scope: "space",
      granted: { owner: true, admin: true, member: false, guest: false },
    },
  ];

  const ROLE_LABEL: Record<Role, string> = {
    owner: "Owner",
    admin: "Admin",
    member: "Member",
    guest: "Guest",
  };

  const INHERITS: Record<Role, Role[]> = {
    owner: ["admin", "member", "guest"],
    admin: ["member", "guest"],
    member: ["guest"],
    guest: [],
  };

  function capabilitiesForRole(role: Role): Capability[] {
    return CAPABILITIES.filter((cap) => cap.granted[role]);
  }

  function downloadMatrix(): void {
    const header = ["capability", "scope", ...ROLES];
    const rows = CAPABILITIES.map((cap) => [
      cap.label,
      cap.scope,
      ...ROLES.map((role) => (cap.granted[role] ? "yes" : "no")),
    ]);
    const csv = [header, ...rows].map((line) => line.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fulcrum-permission-matrix.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<svelte:head>
  <title>Settings · Role definitions | Fulcrum</title>
</svelte:head>

<section data-settings-roles class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
  <header class="flex flex-col gap-1 border-b border-border pb-3">
    <h1 data-settings-roles-header class="text-2xl font-semibold tracking-tight">Role definitions</h1>
    <p class="text-sm text-muted-foreground">What each role can do across the workspace and individual spaces.</p>
    <div>
      <button
        type="button"
        data-download-matrix
        class="mt-2 inline-flex h-8 rounded-md border border-border px-3 text-xs font-medium"
        onclick={downloadMatrix}
      >Download permission matrix (CSV)</button>
    </div>
  </header>

  <section data-roles-grid class="grid gap-3 sm:grid-cols-2">
    {#each ROLES as role (role)}
      <article data-role-card={role} class="flex flex-col gap-2 rounded-md border border-border p-4">
        <header class="flex items-baseline gap-2">
          <h2 class="text-base font-semibold">{ROLE_LABEL[role]}</h2>
          {#if INHERITS[role].length > 0}
            <span data-role-inherits={role} class="text-xs text-muted-foreground">
              inherits {INHERITS[role].map((entry) => ROLE_LABEL[entry]).join(", ")}
            </span>
          {/if}
        </header>
        <ul class="flex flex-col gap-1 text-sm">
          {#each capabilitiesForRole(role) as capability (capability.id)}
            <li data-role-capability={`${role}-${capability.id}`} class="flex flex-col">
              <span class="font-medium">{capability.label}</span>
              <span class="text-xs text-muted-foreground">{capability.description}</span>
              <span class="text-[10px] font-mono uppercase text-muted-foreground">{capability.scope}</span>
            </li>
          {/each}
        </ul>
      </article>
    {/each}
  </section>

  <section data-roles-matrix class="overflow-x-auto rounded-md border border-border">
    <table data-permission-matrix class="w-full text-sm">
      <thead class="border-b border-border bg-muted/50">
        <tr>
          <th class="px-3 py-2 text-left font-medium">Capability</th>
          <th class="px-3 py-2 text-left font-medium">Scope</th>
          {#each ROLES as role (role)}
            <th data-matrix-role-header={role} class="px-3 py-2 text-left font-medium capitalize">{ROLE_LABEL[role]}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each CAPABILITIES as cap (cap.id)}
          <tr data-matrix-row={cap.id} class="border-b border-border last:border-0">
            <td class="px-3 py-2">{cap.label}</td>
            <td data-matrix-scope={cap.id} class="px-3 py-2 text-xs text-muted-foreground">{cap.scope}</td>
            {#each ROLES as role (role)}
              <td data-matrix-cell={`${cap.id}-${role}`} class="px-3 py-2 text-xs">
                {cap.granted[role] ? "✓" : ""}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
</section>
