<script lang="ts">
  import { cn } from "$lib/utils.js";
  import { Skeleton } from "@fulcrum/ui-kit";
</script>

<main data-cross-cutting-motion class={cn("min-h-screen bg-background p-6 text-foreground")}>
  <section class={cn("mx-auto flex max-w-5xl flex-col gap-6")}>
    <header>
      <p class={cn("text-xs font-medium uppercase text-muted-foreground")}>Reduced motion</p>
      <h1 class={cn("mt-1 text-2xl font-semibold")}>Motion-safe interaction fixture</h1>
      <p class={cn("mt-2 max-w-2xl text-sm text-muted-foreground")}>
        Animated affordances keep normal timing by default and collapse when the browser requests reduced motion.
      </p>
    </header>

    <section class={cn("grid gap-3 md:grid-cols-2")}>
      <article data-motion-card="fade" class={cn("motion-card motion-fade rounded-md border border-border bg-card p-4")}>
        <h2 class={cn("font-medium")}>Fade</h2>
        <p class={cn("mt-1 text-sm text-muted-foreground")}>Opacity-only state confirmation.</p>
      </article>
      <article data-motion-card="slide" class={cn("motion-card motion-slide rounded-md border border-border bg-card p-4")}>
        <h2 class={cn("font-medium")}>Slide</h2>
        <p class={cn("mt-1 text-sm text-muted-foreground")}>Drawer and toast entry motion.</p>
      </article>
      <article data-motion-card="bounce" class={cn("motion-card motion-bounce rounded-md border border-border bg-card p-4")}>
        <h2 class={cn("font-medium")}>Bounce</h2>
        <p class={cn("mt-1 text-sm text-muted-foreground")}>Rejected by reduced-motion guard.</p>
      </article>
      <article data-motion-card="rotate" class={cn("motion-card motion-rotate rounded-md border border-border bg-card p-4")}>
        <h2 class={cn("font-medium")}>Rotate</h2>
        <p class={cn("mt-1 text-sm text-muted-foreground")}>Loading affordance fallback.</p>
      </article>
    </section>

    <section class={cn("grid gap-3 md:grid-cols-2")}>
      <div data-parallax-layer class={cn("rounded-md border border-border bg-surface-elevated p-4")}>
        <h2 class={cn("font-medium")}>Parallax layer</h2>
        <p class={cn("mt-1 text-sm text-muted-foreground")}>Transform is removed when motion reduction is active.</p>
      </div>
      <div data-autoplay-loop class={cn("motion-autoplay rounded-md border border-border bg-surface-elevated p-4")}>
        <h2 class={cn("font-medium")}>Autoplay loop</h2>
        <p class={cn("mt-1 text-sm text-muted-foreground")}>Decorative looping animation pauses for reduced motion.</p>
      </div>
    </section>

    <section data-motion-settings class={cn("rounded-md border border-border bg-card p-4")}>
      <h2 class={cn("font-medium")}>User override</h2>
      <p class={cn("mt-1 text-sm text-muted-foreground")}>
        Settings exposes animationSpeed: normal, reduced, off.
      </p>
      <a class={cn("mt-3 inline-flex rounded-md border border-border px-3 py-2 text-sm")} href="/settings/theme">
        Open theme settings
      </a>
    </section>

    <section data-loading-skeletons class={cn("flex flex-col gap-4 rounded-md border border-border bg-card p-4")}>
      <h2 class={cn("text-lg font-semibold")}>Loading skeleton fixtures</h2>
      <p class={cn("text-sm text-muted-foreground")}>Skeletons match the dimensions of their loaded counterpart and respect prefers-reduced-motion.</p>

      <article data-skeleton-form class={cn("flex flex-col gap-2 rounded-md border border-border p-3")}>
        <h3 class={cn("text-sm font-medium")}>Form skeleton</h3>
        <Skeleton class="h-4 w-24" />
        <Skeleton class="h-9 w-full" />
        <Skeleton class="h-9 w-32" />
      </article>

      <article data-skeleton-list class={cn("flex flex-col gap-2 rounded-md border border-border p-3")}>
        <h3 class={cn("text-sm font-medium")}>List skeleton (5 rows)</h3>
        <div class={cn("flex flex-col gap-2")}>
          {#each Array.from({ length: 5 }, (_, index) => index) as index (index)}
            <Skeleton data-skeleton-list-item={index} class="h-6 w-full" />
          {/each}
        </div>
      </article>

      <article data-skeleton-table class={cn("flex flex-col gap-2 rounded-md border border-border p-3")}>
        <h3 class={cn("text-sm font-medium")}>Table skeleton (3 cols × 4 rows)</h3>
        <div class={cn("grid grid-cols-3 gap-2")}>
          {#each Array.from({ length: 12 }, (_, index) => index) as index (index)}
            <Skeleton data-skeleton-table-cell={index} class="h-5" />
          {/each}
        </div>
      </article>
    </section>
  </section>
</main>

<style>
  :global(html) {
    scroll-behavior: smooth;
  }

  .motion-card {
    transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease;
  }

  .motion-fade {
    animation: motion-fade 220ms ease-out both;
  }

  .motion-slide {
    animation: motion-slide 220ms ease-out both;
  }

  .motion-bounce {
    animation: motion-bounce 600ms ease-out both;
  }

  .motion-rotate {
    animation: motion-rotate 800ms linear infinite;
  }

  [data-parallax-layer] {
    transform: translateY(18px);
    transition: transform 220ms ease;
  }

  .motion-autoplay {
    animation: motion-fade 1200ms ease-in-out infinite alternate;
  }

  @keyframes motion-fade {
    from { opacity: 0.2; }
    to { opacity: 1; }
  }

  @keyframes motion-slide {
    from { opacity: 0.2; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes motion-bounce {
    0% { transform: translateY(0); }
    50% { transform: translateY(-12px); }
    100% { transform: translateY(0); }
  }

  @keyframes motion-rotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
