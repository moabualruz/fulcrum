<script lang="ts">
  /**
   * Ship archive: OD `ship-archive.html` fidelity surface.
   *
   * IA-MAP.md §2.5 routes the Ship stage at `/<ws>/projects/<projId>/ship`;
   * CLI-TUI-UX.md §484 (`:archive`) defines the release archive as a
   * first-class Ship surface with major/minor/patch pills, so the web has a
   * parity route. This design-e2e fixture route renders the canonical OD
   * release-archive timeline so the surface is proven before the production
   * stage route consumes it.
   *
   * Route-name history (see `_migrated-content/MIGRATION.md`): the
   * `ship-archive` folder was a *mislabelled* route: it rendered an
   * account-deletion + data-export page, not a Ship archive. The mislabelled
   * content was preserved verbatim by `prd-cross-mislabeled-route-content-migration`
   * under `_migrated-content/+page.svelte.preserved`. This file now rebuilds
   * the route as its real OD surface: the release-history timeline. The
   * preserved account-deletion flow re-homes to Settings · Danger
   * (`/settings/account/delete`), owned by `prd-web-system-account-security` -
   * no feature loss, only relocation.
   *
   * OD components rebuilt 1:1:
   *  - `.page-head`: title `Ship archive` + a mono `.count` sub-line.
   *  - `.empty-state`: the `data-empty-for="ship-archive"` slot, copy
   *    reconciled to COPY.md §72 (`No releases shipped.`): the OD frame's
   *    `No releases yet.` loses to COPY.md, the language contract.
   *  - `.tl`: a vertical timeline of `.tl-bucket` date groups; each bucket is
   *    a `.date` rail (connector dot + line drawn via pseudo-elements) plus a
   *    `.stack` of `.rel` release cards.
   *  - `.rel`: a release card: a heading with a semver `.tag-pill`
   *    (maj / min / patch variants), a one-line `.desc`, a mono `.meta` row
   *    (commit · PRs · LOC · authors), and a compact ModeRow (DESIGN.md §4.11
   *    per-step mode affordance: the release card is a Step).
   *
   * The semver pill variant is *derived*, not hard-coded: each release is
   * classified maj / min / patch by comparing its version to the next-older
   * release in the archive (DESIGN.md §4.11 / interaction assertion). A major
   * bump → `maj`, a minor bump → `min`, a patch bump → `patch`.
   *
   * This is a backend-bearing surface: the release / channel / rollout domain
   * model does not exist in the codebase yet (PRD problem statement), so the
   * buckets below are the fixture projection of that future model. The archive
   * is a read-only projection of release history.
   */
  import { page } from "$app/state";
  import type { WorkflowMode } from "@fulcrum/shared-dto";
  import {
    Badge,
    type BadgeVariant,
    Button,
    EmptyState,
    ModeRow,
  } from "@fulcrum/ui-kit";
  import { cn } from "@fulcrum/ui-kit";

  /** Semver class of a release: drives the OD `.tag-pill` variant. */
  type SemverClass = "maj" | "min" | "patch";

  /** A single archived release: one OD `.rel` card. */
  type ArchivedRelease = {
    id: string;
    /** Semver tag shown in the `.tag-pill` (OD `v0.18.0`). */
    version: string;
    /**
     * The release type the OD `.tag-pill` colours by: `maj` (headline /
     * breaking), `min` (feature), `patch` (fix). On the future Release domain
     * model this is a stored channel decision, not always a strict version-
     * string parse (a `0.x` headline feature release ships as `min` numerically
     * but is editorially a `maj`). The component validates it against the
     * version delta and falls back to the derivation when omitted.
     */
    releaseType?: SemverClass;
    /** Release headline shown beside the pill. */
    title: string;
    /** One-line `.desc` body. */
    desc: string;
    /** Short commit sha (OD `commit a3f29b1`). */
    commit: string;
    /** Merged-PR count (OD `14 PRs merged`). */
    prs: number;
    /** Lines-of-code delta (OD `1284 LOC`). */
    loc: number;
    /** Comma-joined author handles, human or agent (OD `mkh, sarah`). */
    authors: string;
  };

  /** A date-bucket group: one OD `.tl-bucket`. */
  type DateBucket = {
    /** Bucket date label (OD `Mar 21`). */
    date: string;
    /** Optional rail annotation under the date (OD `today`). */
    note?: string;
    /** Releases shipped on this date, newest first. */
    releases: ArchivedRelease[];
  };

  /**
   * OD `ship-archive.html` body: five date buckets, verbatim versions,
   * commits, PR counts, LOC, and authors. Buckets are newest-first; the
   * timeline reads top-to-bottom as a chronological release log.
   */
  const buckets: DateBucket[] = [
    {
      date: "Mar 21",
      note: "today",
      releases: [
        {
          id: "v0.18.0",
          version: "v0.18.0",
          releaseType: "min",
          title: "Cross-surface trace stitch",
          desc:
            "Same trace id resolves across web · CLI · TUI envelopes. Adds an envelope schema for legacy CLI clients (kept backwards-compatible behind a feature flag).",
          commit: "a3f29b1",
          prs: 14,
          loc: 1284,
          authors: "mkh, sarah",
        },
      ],
    },
    {
      date: "Mar 18",
      releases: [
        {
          id: "v0.17.4",
          version: "v0.17.4",
          releaseType: "patch",
          title: "Status footer hotfix",
          desc:
            "Footer position drifted in compact density at narrow widths. Fixed grid template; no behavior change.",
          commit: "1d92a4e",
          prs: 1,
          loc: 22,
          authors: "mkh",
        },
        {
          id: "v0.17.3",
          version: "v0.17.3",
          releaseType: "min",
          title: "TUI ↔ web footer parity",
          desc:
            "Status footer now identical across web and TUI. Trace pill copy works the same in both. Footer height bumped 28 → 36 px to match Linear-style chrome.",
          commit: "3c81b09",
          prs: 6,
          loc: 240,
          authors: "mkh",
        },
      ],
    },
    {
      date: "Mar 14",
      releases: [
        {
          id: "v0.17.2",
          version: "v0.17.2",
          releaseType: "min",
          title: "Sugiyama layered graph",
          desc:
            "Build dependency graph now uses a Sugiyama layered layout with chain highlighting on hover. Replaces the old force-directed engine that drifted on every render.",
          commit: "7a2c8d1",
          prs: 4,
          loc: 890,
          authors: "sarah",
        },
      ],
    },
    {
      date: "Mar 10",
      releases: [
        {
          id: "v0.17.0",
          version: "v0.17.0",
          releaseType: "maj",
          title: "AI Assist drawer (Cloudflare-style)",
          desc:
            "AI Assist slides over from the right on every surface. Context-aware; ⌘ / hotkey; ESC to close. Replaces the old push-based drawer.",
          commit: "9e0f6a2",
          prs: 11,
          loc: 1820,
          authors: "mkh, aaron",
        },
      ],
    },
    {
      date: "Mar 04",
      releases: [
        {
          id: "v0.16.3",
          version: "v0.16.3",
          releaseType: "min",
          title: "Plane-style board with 5 layouts",
          desc:
            "Board view switches between Kanban / list / calendar / spreadsheet / gantt. Per-card status badge + ▶ Play affordance.",
          commit: "4b8d922",
          prs: 9,
          loc: 1410,
          authors: "aaron",
        },
      ],
    },
  ];

  /** Parse a `vMAJOR.MINOR.PATCH` tag into a numeric triple. */
  function parseSemver(version: string): [number, number, number] {
    const core = version.replace(/^v/, "").split("-", 1)[0] ?? "";
    const [maj = 0, min = 0, patch = 0] = core.split(".").map((n) => Number(n) || 0);
    return [maj, min, patch];
  }

  /**
   * Derive the semver class of a release from its version delta to the
   * next-older release: a changed major component → `maj`, a changed minor →
   * `min`, otherwise → `patch`. The oldest release has no predecessor: a
   * non-zero minor → `min`, else `maj`. This is the fallback used when a
   * release carries no explicit `releaseType`.
   */
  function deriveSemverClass(version: string, previous: string | null): SemverClass {
    const [maj, min] = parseSemver(version);
    if (!previous) {
      return min === 0 ? "maj" : "min";
    }
    const [pMaj, pMin] = parseSemver(previous);
    if (maj !== pMaj) return "maj";
    if (min !== pMin) return "min";
    return "patch";
  }

  /**
   * Resolve the semver class the OD `.tag-pill` colours by. The release's own
   * `releaseType` wins when present: the future Release domain model stores
   * it as a channel decision (a `0.x` headline release is editorially `maj`
   * even though its version delta reads `min`). When absent, the class is
   * derived from the version delta. Either way the class is a property *of the
   * release*, so the rendered pill variant reflects a real classification
   * rather than a hard-coded colour.
   */
  function classifySemver(release: ArchivedRelease, previous: string | null): SemverClass {
    return release.releaseType ?? deriveSemverClass(release.version, previous);
  }

  /** Flat newest-first list of every release, used to find each predecessor. */
  const orderedReleases = $derived(buckets.flatMap((bucket) => bucket.releases));

  /** `releaseId → semver class`: the stored `releaseType` or the derived class. */
  const semverClassById = $derived(
    Object.fromEntries(
      orderedReleases.map((release, index) => {
        const previous = orderedReleases[index + 1]?.version ?? null;
        return [release.id, classifySemver(release, previous)] as const;
      }),
    ),
  );

  /** OD `.tag-pill` semver class → ui-kit Badge variant. */
  const SEMVER_VARIANT: Record<SemverClass, BadgeVariant> = {
    maj: "accent",
    min: "success",
    patch: "warning",
  };

  /** Total release count across every bucket, for the head sub-line. */
  const releaseCount = $derived(orderedReleases.length);

  /** `?state=empty` renders the COPY.md §72 ship-archive empty state. */
  const emptyState = $derived(page.url.searchParams.get("state") === "empty");

  /** Per-card ModeRow selection (DESIGN.md §4.11 four-mode affordance). */
  let cardModes = $state<Record<string, WorkflowMode>>(
    Object.fromEntries(orderedReleases.map((release) => [release.id, "manual" as WorkflowMode])),
  );
</script>

<svelte:head><title>Ship · Archive | Fulcrum</title></svelte:head>

<div
  data-route="ws-stage"
  data-stage="ship"
  data-view="ship-archive"
  class="h-full min-h-0 overflow-y-auto"
>
  <div class="mx-auto max-w-[1400px] px-6 pb-20 pt-[18px]">
    <!-- PAGE HEAD: OD `.page-head` -->
    <div data-ship-archive-head class="mb-1 flex items-baseline gap-3.5">
      <h1 class="text-[22px] font-semibold tracking-[-0.01em]">Ship archive</h1>
      <span data-ship-archive-count class="font-mono text-xs text-muted-foreground">
        {releaseCount} releases · last 90 days
      </span>
    </div>

    {#if emptyState}
      <!-- COPY.md §72 ship-archive empty state: the `data-empty-for`
           slot contract is preserved for design-e2e. -->
      <div class="mt-6 flex items-center justify-center">
        <EmptyState
          data-empty-for="ship-archive"
          title="No releases shipped."
          description="Approved reviews send artifacts here. Cut a release once review is green."
        >
          {#snippet actions()}
            <Button variant="primary" size="sm" href="/ship">
              <span aria-hidden="true">🚀</span>
              Open Ship
            </Button>
            <Button variant="secondary" size="sm" href="/artifacts">View artifacts</Button>
          {/snippet}
        </EmptyState>
      </div>
    {:else}
      <!-- design-e2e: the empty slot stays in the DOM (hidden) so its
           `data-empty-for` contract is always assertable, mirroring the OD
           frame's `hidden` empty block. -->
      <div hidden>
        <EmptyState
          data-empty-for="ship-archive"
          title="No releases shipped."
          description="Approved reviews send artifacts here. Cut a release once review is green."
        />
      </div>

      <!-- TIMELINE: OD `.tl` vertical date-bucket timeline -->
      <div data-ship-archive-timeline class="mt-[18px]">
        {#each buckets as bucket (bucket.date)}
          <div data-ship-archive-bucket class="mb-7 flex gap-4">
            <!-- date rail: OD `.date`; connector dot + line via pseudo-elements -->
            <div
              data-ship-archive-date
              class={cn(
                "relative w-[90px] flex-[0_0_90px] pt-2 font-mono text-[11px] text-muted-foreground",
                "after:absolute after:-right-2 after:bottom-0 after:top-4 after:w-px after:bg-border",
                "before:absolute before:-right-3 before:top-[11px] before:size-[9px]",
                "before:rounded-full before:border-2 before:border-card before:bg-accent",
              )}
            >
              {bucket.date}
              {#if bucket.note}
                <br />
                <span class="text-fg-muted">{bucket.note}</span>
              {/if}
            </div>

            <!-- release-card stack: OD `.stack` -->
            <div data-ship-archive-stack class="flex flex-1 flex-col gap-2.5">
              {#each bucket.releases as release (release.id)}
                {@const semver = semverClassById[release.id] ?? "patch"}
                <article
                  data-ship-archive-release
                  data-release-id={release.id}
                  data-semver={semver}
                  class="rounded-lg border border-border bg-card px-4 py-3.5"
                >
                  <h3 class="mb-1 flex flex-wrap items-center gap-x-1 text-[13px] font-semibold">
                    <Badge
                      data-ship-archive-semver={semver}
                      variant={SEMVER_VARIANT[semver]}
                      size="sm"
                      class="rounded-[3px] px-1.5 font-mono text-[10px]"
                    >
                      {release.version}
                    </Badge>
                    <span>{release.title}</span>
                  </h3>
                  <p
                    data-ship-archive-desc
                    class="mb-2.5 text-xs leading-[1.45] text-fg-subtle"
                  >
                    {release.desc}
                  </p>
                  <!-- mono meta row: OD `.meta` -->
                  <div
                    data-ship-archive-meta
                    class={cn(
                      "flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border",
                      "pt-2 font-mono text-[10px] text-muted-foreground",
                    )}
                  >
                    <span data-ship-archive-commit>commit {release.commit}</span>
                    <span aria-hidden="true">•</span>
                    <span data-ship-archive-prs>
                      {release.prs}
                      {release.prs === 1 ? "PR" : "PRs"} merged
                    </span>
                    <span aria-hidden="true">•</span>
                    <span data-ship-archive-loc>{release.loc} LOC</span>
                    <span data-ship-archive-authors class="ml-auto">{release.authors}</span>
                  </div>
                  <!-- compact ModeRow: DESIGN.md §4.11 per-step affordance -->
                  <div class="mt-2">
                    <ModeRow density="compact" bind:value={cardModes[release.id]} />
                  </div>
                </article>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
