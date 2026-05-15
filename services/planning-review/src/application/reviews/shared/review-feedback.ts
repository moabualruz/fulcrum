export type CodeAnnotationType = "comment" | "suggestion" | "concern";
export type CodeAnnotationScope = "line" | "file";

export type ConventionalLabel =
  | "praise"
  | "nitpick"
  | "suggestion"
  | "issue"
  | "todo"
  | "question"
  | "thought"
  | "chore"
  | "note"
  | "typo"
  | "polish"
  | (string & {});

export type ConventionalDecoration = "blocking" | "non-blocking" | "if-minor";

export interface CodeReviewAnnotation {
  id: string;
  type: CodeAnnotationType;
  scope?: CodeAnnotationScope;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  side: "old" | "new";
  text?: string;
  suggestedCode?: string;
  originalCode?: string;
  charStart?: number;
  charEnd?: number;
  tokenText?: string;
  createdAt: number;
  author?: string;
  source?: string;
  severity?: "important" | "nit" | "pre_existing";
  reasoning?: string;
  conventionalLabel?: ConventionalLabel;
  decorations?: ConventionalDecoration[];
  prUrl?: string;
  prNumber?: number;
  prTitle?: string;
  prRepo?: string;
  diffScope?: "layer" | "full-stack";
}

export interface PullRequestMetadata {
  platform: string;
  host: string;
  owner: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  baseBranch: string;
  headBranch: string;
  baseSha: string;
  headSha: string;
  url: string;
}

export interface FeedbackDiffContext {
  mode: string;
  base?: string;
  worktreePath?: string | null;
}

export function formatConventionalPrefix(
  label?: ConventionalLabel,
  decorations?: ConventionalDecoration[],
): string {
  if (!label) return "";
  const decorationLabel = decorations?.length ? ` (${decorations.join(", ")})` : "";
  return `**${label}${decorationLabel}:** `;
}

function getMRLabel(metadata: PullRequestMetadata): string {
  return metadata.platform === "gitlab" ? "MR" : "PR";
}

function getMRNumberLabel(metadata: PullRequestMetadata): string {
  return `#${metadata.number}`;
}

function getDisplayRepo(metadata: PullRequestMetadata): string {
  if (metadata.owner) return `${metadata.owner}/${metadata.repo}`;
  return metadata.repo;
}

function describeDiff(context: FeedbackDiffContext): string {
  const { mode, base, worktreePath } = context;
  let label: string;

  switch (mode) {
    case "uncommitted":
      label = "Uncommitted changes";
      break;
    case "staged":
      label = "Staged changes";
      break;
    case "unstaged":
      label = "Unstaged changes";
      break;
    case "last-commit":
      label = "Last commit";
      break;
    case "jj-current":
      label = "Current change";
      break;
    case "jj-last":
      label = "Last change";
      break;
    case "jj-line":
      label = base ? `Line of work vs \`${base}\`` : "Line of work";
      break;
    case "jj-all":
      label = "All files";
      break;
    case "branch":
      label = base ? `Branch diff vs \`${base}\`` : "Branch diff";
      break;
    case "merge-base":
      label = base ? `Committed changes vs \`${base}\`` : "Committed changes";
      break;
    case "all":
      label = "All files";
      break;
    default:
      label = mode;
  }

  return worktreePath ? `${label} _(worktree: ${worktreePath})_` : label;
}

function formatFileAnnotations(fileAnnotations: CodeReviewAnnotation[], headingLevel = "###"): string {
  let output = "";

  const sorted = [...fileAnnotations].sort((a, b) => {
    const aScope = a.scope ?? "line";
    const bScope = b.scope ?? "line";
    if (aScope !== bScope) {
      return aScope === "file" ? -1 : 1;
    }
    return a.lineStart - b.lineStart;
  });

  for (const annotation of sorted) {
    const scope = annotation.scope ?? "line";
    const prefix = formatConventionalPrefix(annotation.conventionalLabel, annotation.decorations);

    if (scope === "file") {
      output += `${headingLevel} File Comment\n`;
      if (annotation.text) {
        output += `${prefix}${annotation.text}\n`;
      } else if (prefix) {
        output += `${prefix.trimEnd()}\n`;
      }
      if (annotation.suggestedCode) {
        output += `\n**Suggested code:**\n\`\`\`\n${annotation.suggestedCode}\n\`\`\`\n`;
      }
      output += "\n";
      continue;
    }

    const lineRange = annotation.lineStart === annotation.lineEnd
      ? `Line ${annotation.lineStart}`
      : `Lines ${annotation.lineStart}-${annotation.lineEnd}`;
    const tokenSuffix = annotation.tokenText
      ? ` -- \`\`${annotation.tokenText.replace(/`/g, "\\`")}\`\`${annotation.charStart != null ? ` (chars ${annotation.charStart}-${annotation.charEnd})` : ""}`
      : "";
    output += `${headingLevel} ${lineRange} (${annotation.side})${tokenSuffix}\n`;

    if (annotation.text) {
      output += `${prefix}${annotation.text}\n`;
    } else if (prefix) {
      output += `${prefix.trimEnd()}\n`;
    }
    if (annotation.reasoning) {
      output += `\n**Reasoning:** ${annotation.reasoning}\n`;
    }
    if (annotation.suggestedCode) {
      output += `\n**Suggested code:**\n\`\`\`\n${annotation.suggestedCode}\n\`\`\`\n`;
    }
    output += "\n";
  }

  return output;
}

function groupByFile(annotations: CodeReviewAnnotation[]): Map<string, CodeReviewAnnotation[]> {
  const grouped = new Map<string, CodeReviewAnnotation[]>();
  for (const annotation of annotations) {
    const existing = grouped.get(annotation.filePath) ?? [];
    existing.push(annotation);
    grouped.set(annotation.filePath, existing);
  }
  return grouped;
}

function renderFileGroups(grouped: Map<string, CodeReviewAnnotation[]>, headingLevel: string): string {
  const annotationHeading = `${headingLevel}#`;
  let output = "";
  for (const [filePath, fileAnnotations] of grouped) {
    output += `${headingLevel} ${filePath}\n\n`;
    output += formatFileAnnotations(fileAnnotations, annotationHeading);
  }
  return output;
}

function scopeDisplayLabel(scope: string): string {
  if (scope === "layer") return "Layer";
  if (scope === "full-stack") return "Full-stack";
  return scope;
}

function renderScopedGroups(annotations: CodeReviewAnnotation[], headingLevel: string): string {
  const scopes = new Set(annotations.map((annotation) => annotation.diffScope).filter(Boolean));
  if (scopes.size <= 1) return renderFileGroups(groupByFile(annotations), headingLevel);

  let output = "";
  for (const scope of scopes) {
    if (!scope) continue;
    const scopeAnnotations = annotations.filter((annotation) => annotation.diffScope === scope);
    output += `${headingLevel} ${scopeDisplayLabel(scope)}\n\n`;
    output += renderFileGroups(groupByFile(scopeAnnotations), `${headingLevel}#`);
  }

  const unscopedAnnotations = annotations.filter((annotation) => !annotation.diffScope);
  if (unscopedAnnotations.length > 0) {
    output += renderFileGroups(groupByFile(unscopedAnnotations), headingLevel);
  }

  return output;
}

export function exportReviewFeedback(
  annotations: CodeReviewAnnotation[],
  prMeta?: PullRequestMetadata | null,
  diffContext?: FeedbackDiffContext,
  prReviewScope?: string,
): string {
  if (annotations.length === 0) {
    return "# Code Review\n\nNo feedback provided.";
  }

  const prUrls = new Set(annotations.map((annotation) => annotation.prUrl).filter(Boolean));
  const isMultiPR = prUrls.size > 1;
  const singlePrUrl = prUrls.size === 1 ? (Array.from(prUrls)[0] ?? null) : null;
  const prMismatch = singlePrUrl && prMeta && singlePrUrl !== prMeta.url;

  if (!isMultiPR && !prMismatch) {
    const scopes = new Set(annotations.map((annotation) => annotation.diffScope).filter(Boolean));
    const derivedScope = scopes.size === 1 ? Array.from(scopes)[0] : undefined;
    const scopeLabel = derivedScope ?? (scopes.size === 0 ? prReviewScope : undefined);

    let output = prMeta
      ? `# ${getMRLabel(prMeta)} Review: ${getDisplayRepo(prMeta)}${getMRNumberLabel(prMeta)}\n\n` +
        `**${prMeta.title}**\n` +
        `Branch: \`${prMeta.headBranch}\` -> \`${prMeta.baseBranch}\`\n` +
        `${scopeLabel ? `Review scope: ${scopeLabel}\n` : ""}` +
        `${prMeta.url}\n\n`
      : `# Code Review Feedback\n\n${diffContext ? `**Diff:** ${describeDiff(diffContext)}\n\n` : ""}`;

    output += renderScopedGroups(annotations, "##");
    return output;
  }

  let output = isMultiPR ? "# Multi-PR Review\n\n" : "# Code Review\n\n";
  const byPR = new Map<string, CodeReviewAnnotation[]>();

  for (const annotation of annotations) {
    const key = annotation.prUrl ?? "_none";
    const existing = byPR.get(key) ?? [];
    existing.push(annotation);
    byPR.set(key, existing);
  }

  for (const [prUrl, prAnnotations] of byPR) {
    const sample = prAnnotations[0];
    if (!sample) continue;

    if (prUrl === "_none") {
      output += "## Local Changes\n\n";
    } else {
      const repo = sample.prRepo ?? "";
      const number = sample.prNumber != null ? `#${sample.prNumber}` : "";
      const title = sample.prTitle ?? "";
      output += `## ${repo}${number}${title ? ` -- ${title}` : ""}\n\n`;
    }

    const scopes = new Set(prAnnotations.map((annotation) => annotation.diffScope).filter(Boolean));
    if (scopes.size === 1) {
      output += `Review scope: ${Array.from(scopes)[0]}\n\n`;
    }

    output += renderScopedGroups(prAnnotations, "###");
  }

  return output;
}
