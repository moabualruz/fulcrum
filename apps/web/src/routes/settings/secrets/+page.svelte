<script lang="ts">
  import type { PageData } from "./$types";
  import { enhance } from "$app/forms";
  import { cn } from "@fulcrum/ui-kit";
  import { buttonVariants, CredentialInput } from "@fulcrum/ui-kit";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@fulcrum/ui-kit";

  interface Props { data: PageData }
  let { data }: Props = $props();

  let sheetOpen = $state(false);
  let addName = $state("");
  let addValue = $state("");
  let addProvider = $state("");
  let rotateId = $state<string | null>(null);
  let rotateValue = $state("");

  type Credential = { id: string; name: string; provider: string; last_used_at: string | null; archived: boolean; created_at: string };
</script>

<header class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Secrets</h1>
  <button
    data-add-secret
    class={cn(buttonVariants({ variant: "default" }))}
    onclick={() => { sheetOpen = true; }}
  >Add secret</button>
</header>

<Sheet bind:open={sheetOpen}>
  <SheetContent side="right" class="w-96">
    <SheetHeader>
      <SheetTitle>Add secret</SheetTitle>
    </SheetHeader>
    <form
      method="POST"
      action="?/add"
      data-add-secret-form
      use:enhance={() => {
        return ({ result, update }) => {
          if (result.type === "success") {
            sheetOpen = false;
            addName = "";
            addValue = "";
            addProvider = "";
          }
          update();
        };
      }}
      class={cn("flex flex-col gap-4 mt-4 px-4")}
    >
      <label class={cn("flex flex-col gap-1 text-sm font-medium")}>
        Name
        <input name="name" bind:value={addName} required autocomplete="off"
          class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm")} />
      </label>
      <label class={cn("flex flex-col gap-1 text-sm font-medium")}>
        Provider
        <input name="provider" bind:value={addProvider} autocomplete="off"
          class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm")} />
      </label>
      <label class={cn("flex flex-col gap-1 text-sm font-medium")}>
        Value
        <CredentialInput
          name="value"
          bind:value={addValue}
          required
          data-secret-value-input
        />
      </label>
      <button type="submit" class={cn(buttonVariants({ variant: "default" }))}>Save</button>
    </form>
  </SheetContent>
</Sheet>

{#await data.streamed.data}
  <RouteSkeleton kind="list" />
{:then payload}
  {#if payload.credentials.length === 0}
    <div data-empty-secrets class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>
      No secrets yet.
    </div>
  {:else}
    <div class={cn("relative w-full overflow-x-auto")}>
      <table class={cn("w-full caption-bottom text-sm")}>
        <thead class={cn("[&_tr]:border-b")}>
          <tr class={cn("border-b transition-colors")}>
            <th class={cn("h-10 px-2 text-left align-middle font-medium")}>Name</th>
            <th class={cn("h-10 px-2 text-left align-middle font-medium")}>Provider</th>
            <th class={cn("h-10 px-2 text-left align-middle font-medium")}>Value</th>
            <th class={cn("h-10 px-2 text-left align-middle font-medium")}>Last used</th>
            <th class={cn("h-10 px-2 text-left align-middle font-medium")}>Actions</th>
          </tr>
        </thead>
        <tbody class={cn("[&_tr:last-child]:border-0")}>
          {#each payload.credentials as cred (cred.id)}
            <tr
              data-secret-row
              data-secret-id={cred.id}
              class={cn("hover:bg-muted/50 border-b transition-colors", cred.archived && "opacity-50")}
            >
              <td class={cn("p-2 align-middle font-medium")}>{cred.name}</td>
              <td class={cn("p-2 align-middle text-muted-foreground")}>{cred.provider || "-"}</td>
              <td class={cn("p-2 align-middle font-mono text-xs")} data-secret-masked>••••••••</td>
              <td class={cn("p-2 align-middle text-xs text-muted-foreground")}>
                {cred.last_used_at ?? "never"}
              </td>
              <td class={cn("p-2 align-middle flex gap-1")}>
                {#if rotateId === cred.id}
                  <form method="POST" action="?/rotate" use:enhance={() => ({ update }) => { rotateId = null; rotateValue = ""; update(); }}>
                    <input type="hidden" name="id" value={cred.id} />
                    <CredentialInput
                      name="value"
                      placeholder="New value"
                      bind:value={rotateValue}
                      required
                      data-rotate-value-input
                      class="h-7 w-32 mr-1"
                    />
                    <button type="submit" class={cn(buttonVariants({ variant: "default", size: "sm" }))}>Save</button>
                    <button type="button" onclick={() => { rotateId = null; }} class={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>Cancel</button>
                  </form>
                {:else}
                  <button
                    data-rotate-btn
                    class={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                    onclick={() => { rotateId = cred.id; }}
                  >Rotate</button>
                {/if}
                <form method="POST" action="?/archive" use:enhance>
                  <input type="hidden" name="id" value={cred.id} />
                  <button type="submit" data-archive-btn class={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                    {cred.archived ? "Unarchive" : "Archive"}
                  </button>
                </form>
                <form method="POST" action="?/delete" use:enhance>
                  <input type="hidden" name="id" value={cred.id} />
                  <button type="submit" data-delete-btn class={cn(buttonVariants({ variant: "destructive", size: "sm" }))}>Delete</button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/await}
