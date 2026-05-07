<script lang="ts">
  import { cn } from "$lib/utils.js";

  interface BlameLine {
    line_number: number;
    commit_sha: string;
    author: string;
    author_date: string;
    line_content: string;
  }

  interface Props {
    blame: BlameLine[];
    repoId: string;
  }

  let { blame, repoId }: Props = $props();

  function shortSha(sha: string): string {
    return sha.slice(0, 7);
  }

  function relativeDate(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days === 0) return "today";
    if (days === 1) return "1d ago";
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  }
</script>

<div data-blame-view class={cn("overflow-auto rounded-md border border-border bg-muted/20")}>
  <table class={cn("w-full text-xs font-mono")}>
    <tbody>
      {#each blame as line (line.line_number)}
        <tr data-blame-line={line.line_number} class={cn("hover:bg-accent/50")}>
          <td class={cn("px-2 py-0.5 text-right text-muted-foreground select-none whitespace-nowrap border-r border-border w-10")}>
            {line.line_number}
          </td>
          <td class={cn("px-2 py-0.5 whitespace-nowrap border-r border-border")}>
            <a
              href="/repos/{repoId}/commits/{line.commit_sha}"
              data-blame-sha
              class={cn("text-primary hover:underline font-medium")}
            >
              {shortSha(line.commit_sha)}
            </a>
          </td>
          <td class={cn("px-2 py-0.5 whitespace-nowrap border-r border-border text-muted-foreground")}>
            {line.author}
          </td>
          <td class={cn("px-2 py-0.5 whitespace-nowrap border-r border-border text-muted-foreground")}>
            {relativeDate(line.author_date)}
          </td>
          <td class={cn("px-2 py-0.5 whitespace-pre")}>
            {line.line_content}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
