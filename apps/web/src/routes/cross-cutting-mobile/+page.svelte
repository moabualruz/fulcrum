<script lang="ts">
  import { cn } from "$lib/utils.js";
</script>

<main
  data-cross-cutting-mobile
  class={cn("min-h-screen overflow-x-hidden bg-background text-foreground")}
>
  <section
    data-android-safe-area-frame
    class={cn("relative mx-auto flex min-h-screen max-w-md flex-col border-x border-border bg-card")}
    style:padding-top="var(--fulcrum-safe-area-top)"
    style:padding-bottom="calc(var(--fulcrum-gesture-zone-bottom) + 72px)"
    style:padding-left="var(--fulcrum-gesture-zone-inline)"
    style:padding-right="var(--fulcrum-gesture-zone-inline)"
  >
    <header data-android-status-header class={cn("sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur")}>
      <p class={cn("text-xs font-medium uppercase text-muted-foreground")}>Android safe area</p>
      <h1 class={cn("mt-1 text-lg font-semibold")}>Gesture-safe mobile shell</h1>
    </header>

    <div class={cn("grid flex-1 gap-3 p-4")}>
      <section class={cn("rounded-md border border-border bg-background p-3 text-sm")}>
        <h2 class={cn("font-medium")}>Status bar clearance</h2>
        <p class={cn("mt-1 text-muted-foreground")}>Top chrome starts after the 24 px minimum status-bar safe area.</p>
      </section>
      <section class={cn("rounded-md border border-border bg-background p-3 text-sm")}>
        <h2 class={cn("font-medium")}>Gesture zone clearance</h2>
        <p class={cn("mt-1 text-muted-foreground")}>Bottom actions stay above the 48 px gesture navigation zone.</p>
      </section>
      <section class={cn("rounded-md border border-border bg-background p-3 text-sm")}>
        <h2 class={cn("font-medium")}>Landscape edges</h2>
        <p class={cn("mt-1 text-muted-foreground")}>Short landscape viewports reserve inline gesture margins instead of squeezing content under edge gestures.</p>
      </section>
    </div>

    <nav
      data-android-bottom-nav
      aria-label="Mobile navigation"
      class={cn("fixed inset-x-0 mx-auto grid max-w-md grid-cols-3 gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur")}
      style:bottom="var(--fulcrum-gesture-zone-bottom)"
      style:padding-left="calc(1rem + var(--fulcrum-gesture-zone-inline))"
      style:padding-right="calc(1rem + var(--fulcrum-gesture-zone-inline))"
    >
      <button class={cn("h-11 rounded-md bg-muted text-sm")}>Capture</button>
      <button class={cn("h-11 rounded-md bg-primary text-sm text-primary-foreground")}>Build</button>
      <button class={cn("h-11 rounded-md bg-muted text-sm")}>AI Assist</button>
    </nav>
  </section>
</main>
