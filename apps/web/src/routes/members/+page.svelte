<script lang="ts">
  import { cn } from "$lib/utils.js";

  type Role = "owner" | "admin" | "guest";
  type MemberStatus = "active" | "invited";

  interface Member {
    id: string;
    email: string;
    role: Role;
    status: MemberStatus;
    invitedAt?: string;
  }

  const INITIAL: Member[] = [
    { id: "u_owner", email: "owner@fulcrum.test", role: "owner", status: "active" },
    { id: "u_admin", email: "admin@fulcrum.test", role: "admin", status: "active" },
    { id: "u_guest", email: "guest@fulcrum.test", role: "guest", status: "active" },
    { id: "i_pending", email: "pending@fulcrum.test", role: "guest", status: "invited", invitedAt: "2026-05-18T08:00:00Z" },
  ];

  let members = $state<Member[]>(INITIAL);
  let inviteEmail = $state("");
  let inviteRole = $state<Role>("guest");
  let inviteError = $state<string | null>(null);
  let lastResentId = $state<string | null>(null);

  function sendInvite(event: Event): void {
    event.preventDefault();
    const email = inviteEmail.trim();
    if (!email || !email.includes("@")) { inviteError = "Enter a valid email."; return; }
    if (members.some((m) => m.email === email)) { inviteError = "That email is already a member or invited."; return; }
    inviteError = null;
    members = [
      ...members,
      {
        id: `i_${email.replace(/[^a-z0-9]+/gi, "_")}`,
        email,
        role: inviteRole,
        status: "invited",
        invitedAt: new Date().toISOString(),
      },
    ];
    inviteEmail = "";
  }

  function changeRole(id: string, role: Role): void {
    members = members.map((m) => m.id === id ? { ...m, role } : m);
  }

  function removeMember(id: string): void {
    members = members.filter((m) => m.id !== id);
  }

  function resendInvite(id: string): void {
    members = members.map((m) => m.id === id ? { ...m, invitedAt: new Date().toISOString() } : m);
    lastResentId = id;
  }
</script>

<svelte:head>
  <title>Members | Fulcrum</title>
</svelte:head>

<section data-members class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
  <header class="flex flex-col gap-1 border-b border-border pb-3">
    <h1 data-members-header class="text-2xl font-semibold tracking-tight">Workspace members</h1>
    <p class="text-sm text-muted-foreground">Invite collaborators, change their role, or revoke access.</p>
  </header>

  <form data-invite-form class="flex flex-wrap items-end gap-3 rounded-md border border-border p-4" onsubmit={sendInvite}>
    <label class="flex flex-1 flex-col gap-1 text-sm">
      Email
      <input
        type="text"
        inputmode="email"
        data-invite-email
        bind:value={inviteEmail}
        class="h-9 rounded-md border border-input bg-background px-2"
      />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      Role
      <select
        data-invite-role
        bind:value={inviteRole}
        class="h-9 rounded-md border border-input bg-background px-2"
      >
        <option value="owner">Owner</option>
        <option value="admin">Admin</option>
        <option value="guest">Guest</option>
      </select>
    </label>
    <button
      type="submit"
      data-invite-submit
      class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
    >Send invite</button>
    {#if inviteError}
      <span data-invite-error class="basis-full text-sm text-destructive">{inviteError}</span>
    {/if}
  </form>

  <section data-members-list class="overflow-x-auto rounded-md border border-border">
    <table data-members-table class="w-full text-sm">
      <thead class="border-b border-border bg-muted/50">
        <tr>
          <th class="px-3 py-2 text-left font-medium">Email</th>
          <th class="px-3 py-2 text-left font-medium">Role</th>
          <th class="px-3 py-2 text-left font-medium">Status</th>
          <th class="px-3 py-2 text-right font-medium">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each members as member (member.id)}
          <tr data-member-row={member.id} class="border-b border-border last:border-0">
            <td class="px-3 py-2">{member.email}</td>
            <td class="px-3 py-2">
              <select
                data-member-role={member.id}
                value={member.role}
                onchange={(event) => changeRole(member.id, (event.target as HTMLSelectElement).value as Role)}
                class="h-8 rounded-md border border-border bg-background px-2 text-xs"
                disabled={member.role === "owner"}
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="guest">Guest</option>
              </select>
            </td>
            <td class="px-3 py-2 text-xs" data-member-status={member.id}>
              {#if member.status === "invited"}
                <span class={cn("rounded border border-warning/40 bg-warning/10 px-2 py-0.5 text-warning-foreground")}>invited</span>
                {#if lastResentId === member.id}
                  <span data-resent-confirmation={member.id} class={cn("ml-1 text-success")}>resent</span>
                {/if}
              {:else}
                <span class={cn("rounded border border-success/40 bg-success/10 px-2 py-0.5 text-success")}>active</span>
              {/if}
            </td>
            <td class="px-3 py-2 text-right">
              <div class="flex justify-end gap-1">
                {#if member.status === "invited"}
                  <button
                    type="button"
                    data-resend-invite={member.id}
                    class="rounded border border-border px-2 py-0.5 text-xs"
                    onclick={() => resendInvite(member.id)}
                  >Resend</button>
                {/if}
                {#if member.role !== "owner"}
                  <button
                    type="button"
                    data-remove-member={member.id}
                    class="rounded border border-destructive/40 px-2 py-0.5 text-xs text-destructive"
                    onclick={() => removeMember(member.id)}
                  >Remove</button>
                {/if}
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
</section>
