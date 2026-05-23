<script lang="ts">
  import { Select } from "@fulcrum/ui-kit";
  import { enhance } from "$app/forms";
  import type { PageData, ActionData } from "./$types";
  import type { MemberRow } from "./+page.server.ts";

  interface Props {
    data: PageData;
    form?: ActionData;
  }

  let { data, form }: Props = $props();

  const ROLES = ["owner", "admin", "member", "guest"] as const;
  type Role = (typeof ROLES)[number];

  const members = $derived(data.members ?? []);
  const sessions = $derived(data.sessions ?? []);
</script>

<svelte:head>
  <title>User Management | Fulcrum Settings</title>
</svelte:head>

<div data-settings-users class="mx-auto flex max-w-3xl flex-col gap-8 py-8 px-4">
  <header>
    <h1 class="text-2xl font-semibold tracking-tight">User Management</h1>
    <p class="mt-1 text-sm text-muted-foreground">
      Manage organisation members, invite new users, and change roles.
    </p>
  </header>

  <!-- ── Invite form ─────────────────────────────────────────────────── -->
  <section data-invite-section class="flex flex-col gap-3">
    <h2 class="text-base font-medium">Invite a new member</h2>

    {#if form?.inviteError}
      <p data-invite-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {form.inviteError}
      </p>
    {/if}

    {#if form?.inviteToken}
      <div data-invite-token class="rounded-md border border-border bg-muted px-3 py-2 text-sm">
        <span class="font-medium">Invitation token:</span>
        <code class="ml-2 break-all">{form.inviteToken}</code>
        <p class="mt-1 text-xs text-muted-foreground">
          Share the link: <code>/auth/invite/{form.inviteToken}</code>
        </p>
      </div>
    {/if}

    <form method="POST" action="?/invite" use:enhance class="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div class="flex flex-col gap-1.5 flex-1">
        <label for="invite-email" class="text-sm font-medium">Email address</label>
        <input
          id="invite-email"
          name="email"
          type="email"
          autocomplete="email"
          placeholder="colleague@example.com"
          required
          class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="invite-role" class="text-sm font-medium">Role</label>
        <select
          id="invite-role"
          name="role"
          class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
        >
          {#each ROLES as role}
            <option value={role} selected={role === "member"}>{role}</option>
          {/each}
        </select>
      </div>

      <button
        type="submit"
        data-invite-submit
        class="h-9 self-end rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs"
      >Send invite</button>
    </form>
  </section>

  <!-- ── Members table ──────────────────────────────────────────────── -->
  <section data-members-section class="flex flex-col gap-3">
    <h2 class="text-base font-medium">Members</h2>

    {#if form?.roleError}
      <p data-role-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {form.roleError}
      </p>
    {/if}

    {#if form?.removeError}
      <p data-remove-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {form.removeError}
      </p>
    {/if}

    {#if members.length === 0}
      <p class="text-sm text-muted-foreground">No members found.</p>
    {:else}
      <div class="overflow-x-auto rounded-md border border-border">
        <table data-members-table class="w-full text-sm">
          <thead class="border-b border-border bg-muted/50">
            <tr>
              <th class="px-4 py-2 text-left font-medium">User ID</th>
              <th class="px-4 py-2 text-left font-medium">Email status</th>
              <th class="px-4 py-2 text-left font-medium">Role</th>
              <th class="px-4 py-2 text-left font-medium">Joined</th>
              <th class="px-4 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each members as member (member.id)}
              <tr class="border-b border-border last:border-0">
                <td class="px-4 py-2 font-mono text-xs text-muted-foreground">{member.userId}</td>
                <td class="px-4 py-2">
                  <span
                    data-member-email-status={member.userId}
                    class={`rounded-sm border px-2 py-1 text-xs font-medium ${member.emailVerified ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning-foreground"}`}
                  >
                    {member.emailVerified ? "verified" : "unverified"}
                  </span>
                </td>

                <!-- Role change dropdown -->
                <td class="px-4 py-2">
                  <form method="POST" action="?/updateRole" use:enhance>
                    <input type="hidden" name="userId" value={member.userId} />
                    <select
                      name="role"
                      data-member-role={member.userId}
                      onchange={(e) => {
                        (e.currentTarget.closest("form") as HTMLFormElement)?.requestSubmit();
                      }}
                      class="h-7 rounded border border-input bg-background px-2 text-xs"
                    >
                      {#each ROLES as role}
                        <option value={role} selected={role === (member.role as Role)}>{role}</option>
                      {/each}
                    </select>
                  </form>
                </td>

                <td class="px-4 py-2 text-xs text-muted-foreground">
                  {new Date(member.joinedAt).toLocaleDateString()}
                </td>

                <!-- Remove button -->
                <td class="px-4 py-2">
                  <form method="POST" action="?/remove" use:enhance>
                    <input type="hidden" name="userId" value={member.userId} />
                    <button
                      type="submit"
                      data-member-remove={member.userId}
                      class="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                    >Remove</button>
                  </form>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <section data-auth-sessions-section class="flex flex-col gap-3">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="text-base font-medium">Login sessions</h2>
        <p class="text-sm text-muted-foreground">Review active devices and revoke remote access.</p>
      </div>
      <form method="POST" action="?/revokeOtherSessions" use:enhance>
        <button
          type="submit"
          data-revoke-other-sessions
          class="h-9 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
        >Revoke all others</button>
      </form>
    </div>

    {#if sessions.length === 0}
      <p class="text-sm text-muted-foreground">No active login sessions found.</p>
    {:else}
      <div class="overflow-x-auto rounded-md border border-border">
        <table data-auth-sessions-table class="w-full text-sm">
          <thead class="border-b border-border bg-muted/50">
            <tr>
              <th class="px-4 py-2 text-left font-medium">Device</th>
              <th class="px-4 py-2 text-left font-medium">IP</th>
              <th class="px-4 py-2 text-left font-medium">Last active</th>
              <th class="px-4 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each sessions as session (session.id)}
              <tr class="border-b border-border last:border-0">
                <td class="px-4 py-2">
                  <div class="font-medium">{session.deviceType} · {session.browser}</div>
                  {#if session.isCurrent}
                    <span data-current-session={session.id} class="text-xs text-success">current session</span>
                  {:else}
                    <span class="font-mono text-xs text-muted-foreground">{session.id}</span>
                  {/if}
                </td>
                <td class="px-4 py-2 font-mono text-xs text-muted-foreground">{session.ipAddress ?? "private"}</td>
                <td class="px-4 py-2 text-xs text-muted-foreground">{new Date(session.lastActiveAt).toLocaleString()}</td>
                <td class="px-4 py-2">
                  {#if session.isCurrent}
                    <button
                      type="button"
                      disabled
                      data-revoke-current-blocked={session.id}
                      class="rounded px-2 py-1 text-xs text-muted-foreground"
                    >Current</button>
                  {:else}
                    <form method="POST" action="?/revokeSession" use:enhance>
                      <input type="hidden" name="sessionId" value={session.id} />
                      <button
                        type="submit"
                        data-revoke-session={session.id}
                        class="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >Revoke</button>
                    </form>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</div>
