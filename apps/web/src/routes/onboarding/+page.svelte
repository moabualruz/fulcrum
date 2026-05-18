<script lang="ts">
  type StepState = "complete" | "current" | "pending";

  const steps: Array<{ label: string; state: StepState; detail: string }> = [
    { label: "Account", state: "complete", detail: "Email and password accepted" },
    { label: "Verify email", state: "current", detail: "Check inbox before workspace activation" },
    { label: "Workspace", state: "pending", detail: "Create workspace and invite operators" },
  ];

  const invites = [
    { email: "pm@local", role: "Admin", status: "queued" },
    { email: "agent-ops@local", role: "Operator", status: "draft" },
  ];

  const checks = [
    "Verification email sent to ada@local",
    "Workspace slug reserved as fulcrum-lab",
    "Default project will be created after email verification",
    "Audit trace trace-onboard-1842 will link signup and workspace setup",
  ];

  let workspaceName = $state("Fulcrum Lab");
  let workspaceSlug = $state("fulcrum-lab");
  let email = $state("ada@local");
  let role = $state("Owner");

  const slugPreview = $derived(workspaceSlug.trim().toLowerCase() || "workspace-slug");
</script>

<svelte:head>
  <title>Onboarding | Fulcrum</title>
</svelte:head>

<main data-onboarding-page class="min-h-screen bg-background text-foreground">
  <section class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
    <header data-onboarding-header class="flex flex-col gap-3 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
      <div class="space-y-2">
        <p class="text-xs font-medium uppercase text-muted-foreground">Identity access</p>
        <h1 class="text-2xl font-semibold tracking-tight">User signup and workspace setup</h1>
        <p class="max-w-2xl text-sm text-muted-foreground">
          Create the user, verify email ownership, reserve the workspace, then open the first project with the same trace.
        </p>
      </div>
      <div data-onboarding-trace class="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        trace=trace-onboard-1842
      </div>
    </header>

    <div data-onboarding-steps class="grid gap-3 md:grid-cols-3">
      {#each steps as step}
        <article
          data-onboarding-step={step.label}
          class={[
            "rounded-md border bg-card p-4",
            step.state === "current" ? "border-primary/50 ring-1 ring-primary/20" : "border-border",
          ]}
        >
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-sm font-semibold">{step.label}</h2>
            <span
              data-step-state
              class={[
                "rounded-sm px-2 py-0.5 text-xs font-medium",
                step.state === "complete" ? "bg-success/10 text-success" : "",
                step.state === "current" ? "bg-primary/10 text-primary" : "",
                step.state === "pending" ? "bg-muted text-muted-foreground" : "",
              ]}
            >{step.state}</span>
          </div>
          <p class="mt-2 text-sm text-muted-foreground">{step.detail}</p>
        </article>
      {/each}
    </div>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section data-workspace-setup class="rounded-md border border-border bg-card p-5">
        <div class="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold">Workspace setup</h2>
            <p class="text-sm text-muted-foreground">Reserve the workspace before opening the first project.</p>
          </div>
          <span data-verification-status class="rounded-sm bg-warn/10 px-2 py-1 text-xs font-medium text-warn">
            Email verification pending
          </span>
        </div>

        <form class="grid gap-4 md:grid-cols-2">
          <label class="flex flex-col gap-1.5 text-sm font-medium">
            User email
            <input
              data-user-email
              bind:value={email}
              type="email"
              class="h-9 rounded-sm border border-input bg-background px-3 text-sm"
            />
          </label>

          <label class="flex flex-col gap-1.5 text-sm font-medium">
            Initial role
            <select data-user-role bind:value={role} class="h-9 rounded-sm border border-input bg-background px-3 text-sm">
              <option>Owner</option>
              <option>Admin</option>
              <option>Operator</option>
            </select>
          </label>

          <label class="flex flex-col gap-1.5 text-sm font-medium">
            Workspace name
            <input
              data-workspace-name
              bind:value={workspaceName}
              class="h-9 rounded-sm border border-input bg-background px-3 text-sm"
            />
          </label>

          <label class="flex flex-col gap-1.5 text-sm font-medium">
            Workspace slug
            <input
              data-workspace-slug
              bind:value={workspaceSlug}
              class="h-9 rounded-sm border border-input bg-background px-3 text-sm"
            />
          </label>
        </form>

        <div data-slug-preview class="mt-4 rounded-md border border-border bg-muted p-3 text-sm">
          <span class="text-muted-foreground">Reserved URL</span>
          <span class="ml-2 font-mono">/{slugPreview}</span>
        </div>

        <div class="mt-5 flex flex-wrap gap-2">
          <button data-resend-verification type="button" class="rounded-sm border border-border px-3 py-2 text-sm font-medium">
            Resend verification
          </button>
          <button data-create-workspace type="button" class="rounded-sm bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            Create workspace
          </button>
        </div>
      </section>

      <aside class="flex flex-col gap-4">
        <section data-invite-queue class="rounded-md border border-border bg-card p-4">
          <h2 class="text-sm font-semibold">Invite queue</h2>
          <div class="mt-3 divide-y divide-border">
            {#each invites as invite}
              <div data-invite-row class="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <p class="font-medium">{invite.email}</p>
                  <p class="text-xs text-muted-foreground">{invite.role}</p>
                </div>
                <span class="rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground">{invite.status}</span>
              </div>
            {/each}
          </div>
        </section>

        <section data-setup-checklist class="rounded-md border border-border bg-card p-4">
          <h2 class="text-sm font-semibold">Setup checklist</h2>
          <ul class="mt-3 space-y-2 text-sm text-muted-foreground">
            {#each checks as check}
              <li data-check-row class="flex gap-2">
                <span class="mt-1 size-1.5 rounded-full bg-primary"></span>
                <span>{check}</span>
              </li>
            {/each}
          </ul>
        </section>
      </aside>
    </div>
  </section>
</main>
