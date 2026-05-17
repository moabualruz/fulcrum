import {
  buildFileTree,
  getVisualFileOrder,
  type FileTreeNode,
  type ReviewTreeDiffFile,
} from "@planning-review/application/reviews/file-tree/build-file-tree.ts";
import {
  exportReviewFeedback,
  formatConventionalPrefix,
  type CodeReviewAnnotation,
} from "@planning-review/application/reviews/shared/review-feedback.ts";
import {
  findReviewSearchMatches,
  groupReviewSearchMatches,
  type ReviewSearchFileGroup,
  type ReviewSearchMatch,
} from "@planning-review/application/reviews/shared/review-search.ts";

export type ReviewWorkbenchDiffFile = ReviewTreeDiffFile;

export interface ReviewWorkbenchEditorAnnotation {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  comment?: string;
  selectedText?: string;
}

export interface ReviewWorkbenchPullRequestMeta {
  number: number;
  title: string;
  repo: string;
}

export interface ReviewWorkbenchInput {
  projectId?: string;
  traceId?: string;
  reviewId?: string;
  files: ReviewWorkbenchDiffFile[];
  annotations: CodeReviewAnnotation[];
  selectedFilePath?: string | null;
  viewedFilePaths?: Iterable<string>;
  hideViewedFiles?: boolean;
  searchQuery?: string;
  activeSearchMatchId?: string | null;
  liveLog?: {
    content: string;
    isLive?: boolean;
    maxRenderSize?: number;
  };
  editorAnnotations?: ReviewWorkbenchEditorAnnotation[];
  currentPrUrl?: string;
  currentPrMeta?: ReviewWorkbenchPullRequestMeta;
}

export interface ReviewWorkbenchFileState extends ReviewWorkbenchDiffFile {
  index: number;
  viewed: boolean;
  active: boolean;
  annotationCount: number;
  searchMatchCount: number;
}

export interface ReviewWorkbenchTreeStats {
  annotationCount: number;
  searchMatchCount: number;
  viewed: boolean;
}

export interface ReviewWorkbenchAnnotationGroup {
  filePath: string;
  annotations: CodeReviewAnnotation[];
  blockingCount: number;
  suggestionCount: number;
}

export interface ReviewWorkbenchSuggestion {
  annotationId: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  canApply: boolean;
  originalCode?: string;
  suggestedCode: string;
}

export interface ReviewWorkbenchSubmissionTarget {
  prUrl: string;
  prNumber: number;
  prTitle: string;
  prRepo: string;
  fileComments: Array<{
    path: string;
    line: number;
    side: "LEFT" | "RIGHT";
    body: string;
    start_line?: number;
    start_side?: "LEFT" | "RIGHT";
  }>;
  fileScopedBody: string;
  fileCount: number;
  annotationCount: number;
  status: "pending" | "success" | "failed";
  error?: string;
}

export interface ReviewWorkbenchOrphanedFindings {
  reason: "full-stack" | "unmapped";
  annotations: CodeReviewAnnotation[];
  markdown: string;
}

export interface ReviewWorkbenchSubmission {
  targets: ReviewWorkbenchSubmissionTarget[];
  orphans: ReviewWorkbenchOrphanedFindings[];
}

export interface ReviewWorkbenchLiveLog {
  displayText: string;
  fullText: string;
  isLive: boolean;
  hasOutput: boolean;
  isWaiting: boolean;
  truncated: boolean;
}

export interface ReviewWorkbenchModel {
  projectId?: string;
  traceId?: string;
  reviewId?: string;
  files: ReviewWorkbenchFileState[];
  visibleFiles: ReviewWorkbenchFileState[];
  selectedFile: ReviewWorkbenchFileState | null;
  fileTree: FileTreeNode[];
  visualFileOrder: number[];
  fileTreeStats: Map<string, ReviewWorkbenchTreeStats>;
  annotationGroups: ReviewWorkbenchAnnotationGroup[];
  search: {
    query: string;
    matches: ReviewSearchMatch[];
    groups: ReviewSearchFileGroup[];
    activeMatch: ReviewSearchMatch | null;
    previousMatchId: string | null;
    nextMatchId: string | null;
  };
  suggestions: ReviewWorkbenchSuggestion[];
  feedbackMarkdown: string;
  submission: ReviewWorkbenchSubmission;
  liveLog: ReviewWorkbenchLiveLog;
  summary: {
    fileCount: number;
    visibleFileCount: number;
    viewedFileCount: number;
    annotationCount: number;
    blockingAnnotationCount: number;
    suggestionCount: number;
    searchMatchCount: number;
    hasLiveOutput: boolean;
  };
}

const FILE_SCOPE_FIRST = { file: 0, line: 1 } as const;

function getAnnotationScope(annotation: CodeReviewAnnotation): "line" | "file" {
  return annotation.scope ?? "line";
}

function isBlockingAnnotation(annotation: CodeReviewAnnotation): boolean {
  return annotation.type === "concern" ||
    annotation.severity === "important" ||
    annotation.decorations?.includes("blocking") === true;
}

function compareCodeAnnotations(a: CodeReviewAnnotation, b: CodeReviewAnnotation): number {
  const aScope = getAnnotationScope(a);
  const bScope = getAnnotationScope(b);

  if (aScope !== bScope) {
    return FILE_SCOPE_FIRST[aScope] - FILE_SCOPE_FIRST[bScope];
  }

  return aScope === "file" ? b.createdAt - a.createdAt : a.lineStart - b.lineStart;
}

function groupAnnotations(annotations: CodeReviewAnnotation[]): ReviewWorkbenchAnnotationGroup[] {
  const grouped = new Map<string, CodeReviewAnnotation[]>();
  for (const annotation of annotations) {
    const existing = grouped.get(annotation.filePath) ?? [];
    existing.push(annotation);
    grouped.set(annotation.filePath, existing);
  }

  return Array.from(grouped.entries()).map(([filePath, fileAnnotations]) => {
    const sorted = [...fileAnnotations].sort(compareCodeAnnotations);
    return {
      filePath,
      annotations: sorted,
      blockingCount: sorted.filter(isBlockingAnnotation).length,
      suggestionCount: sorted.filter((annotation) => annotation.suggestedCode).length,
    };
  });
}

function buildAnnotationCountMap(annotations: CodeReviewAnnotation[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const annotation of annotations) {
    map.set(annotation.filePath, (map.get(annotation.filePath) ?? 0) + 1);
  }
  return map;
}

function buildSearchCountMap(matches: ReviewSearchMatch[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const match of matches) {
    map.set(match.filePath, (map.get(match.filePath) ?? 0) + 1);
  }
  return map;
}

function collectTreeStats(
  nodes: FileTreeNode[],
  annotationCounts: Map<string, number>,
  searchCounts: Map<string, number>,
  viewedFilePaths: Set<string>,
  stats: Map<string, ReviewWorkbenchTreeStats>,
): ReviewWorkbenchTreeStats {
  let annotationCount = 0;
  let searchMatchCount = 0;
  let viewed = true;

  for (const node of nodes) {
    if (node.type === "file") {
      const fileAnnotationCount = annotationCounts.get(node.path) ?? 0;
      const fileSearchMatchCount = searchCounts.get(node.path) ?? 0;
      const fileViewed = viewedFilePaths.has(node.path);
      stats.set(node.path, {
        annotationCount: fileAnnotationCount,
        searchMatchCount: fileSearchMatchCount,
        viewed: fileViewed,
      });
      annotationCount += fileAnnotationCount;
      searchMatchCount += fileSearchMatchCount;
      viewed = viewed && fileViewed;
      continue;
    }

    const childStats = collectTreeStats(
      node.children ?? [],
      annotationCounts,
      searchCounts,
      viewedFilePaths,
      stats,
    );
    stats.set(node.path, childStats);
    annotationCount += childStats.annotationCount;
    searchMatchCount += childStats.searchMatchCount;
    viewed = viewed && childStats.viewed;
  }

  return { annotationCount, searchMatchCount, viewed };
}

function getWrappedMatchId(
  matches: ReviewSearchMatch[],
  activeMatchId: string | null | undefined,
  direction: 1 | -1,
): string | null {
  if (matches.length === 0) return null;

  const currentIndex = activeMatchId
    ? matches.findIndex((match) => match.id === activeMatchId)
    : -1;
  const nextIndex = currentIndex === -1
    ? 0
    : (currentIndex + direction + matches.length) % matches.length;
  return matches[nextIndex]?.id ?? null;
}

function buildSuggestions(annotations: CodeReviewAnnotation[]): ReviewWorkbenchSuggestion[] {
  return annotations
    .filter((annotation): annotation is CodeReviewAnnotation & { suggestedCode: string } =>
      typeof annotation.suggestedCode === "string" && annotation.suggestedCode.length > 0
    )
    .sort(compareCodeAnnotations)
    .map((annotation) => ({
      annotationId: annotation.id,
      filePath: annotation.filePath,
      lineStart: annotation.lineStart,
      lineEnd: annotation.lineEnd,
      canApply: getAnnotationScope(annotation) === "line" &&
        typeof annotation.originalCode === "string" &&
        annotation.originalCode.length > 0,
      ...(annotation.originalCode ? { originalCode: annotation.originalCode } : {}),
      suggestedCode: annotation.suggestedCode,
    }));
}

function buildAnnotationFileComments(
  annotations: CodeReviewAnnotation[],
): ReviewWorkbenchSubmissionTarget["fileComments"] {
  return annotations
    .filter((annotation) => getAnnotationScope(annotation) === "line")
    .sort(compareCodeAnnotations)
    .map((annotation) => {
      const conventionalPrefix = formatConventionalPrefix(annotation.conventionalLabel, annotation.decorations);
      let body = conventionalPrefix + (annotation.text ?? "");
      if (annotation.suggestedCode) {
        body += `\n\n\`\`\`suggestion\n${annotation.suggestedCode}\n\`\`\``;
      }
      const side: "LEFT" | "RIGHT" = annotation.side === "old" ? "LEFT" : "RIGHT";
      const isMultiLine = annotation.lineStart !== annotation.lineEnd;
      return {
        path: annotation.filePath,
        line: annotation.lineEnd,
        side,
        body: body.trim(),
        ...(isMultiLine ? { start_line: annotation.lineStart, start_side: side } : {}),
      };
    })
    .filter((comment) => comment.body.length > 0);
}

function buildFileScopedBody(annotations: CodeReviewAnnotation[]): string {
  return annotations
    .filter((annotation) => getAnnotationScope(annotation) === "file")
    .sort(compareCodeAnnotations)
    .map((annotation) => annotation.text ? `**${annotation.filePath}:** ${annotation.text}` : "")
    .filter(Boolean)
    .join("\n\n");
}

function buildReviewSubmission(input: {
  annotations: CodeReviewAnnotation[];
  editorAnnotations: ReviewWorkbenchEditorAnnotation[];
  currentPrUrl?: string;
  currentDiffPaths: Set<string>;
  currentPrMeta?: ReviewWorkbenchPullRequestMeta;
}): ReviewWorkbenchSubmission {
  const targets: ReviewWorkbenchSubmissionTarget[] = [];
  const orphanAnnotations: Array<{ reason: "full-stack" | "unmapped"; annotation: CodeReviewAnnotation }> = [];
  const layerAnnotations: CodeReviewAnnotation[] = [];

  for (const annotation of input.annotations) {
    if (annotation.diffScope === "full-stack") {
      orphanAnnotations.push({ reason: "full-stack", annotation });
    } else {
      layerAnnotations.push(annotation);
    }
  }

  const byPr = new Map<string, CodeReviewAnnotation[]>();
  const hasMultiplePrs = new Set(layerAnnotations.map((annotation) => annotation.prUrl).filter(Boolean)).size > 1;

  for (const annotation of layerAnnotations) {
    const key = annotation.prUrl ?? input.currentPrUrl ?? "_current";
    if (!annotation.prUrl && hasMultiplePrs) {
      orphanAnnotations.push({ reason: "unmapped", annotation });
      continue;
    }
    const group = byPr.get(key) ?? [];
    group.push(annotation);
    byPr.set(key, group);
  }

  const editorFileComments: ReviewWorkbenchSubmissionTarget["fileComments"] = [];
  const editorFiles = new Set<string>();
  for (const editorAnnotation of input.editorAnnotations) {
    if (!input.currentDiffPaths.has(editorAnnotation.filePath)) continue;

    const selectedText = editorAnnotation.selectedText ?? "";
    const body = editorAnnotation.comment
      ? `> ${selectedText}\n\n${editorAnnotation.comment}`
      : `> ${selectedText}`;
    if (!body.trim()) continue;

    const isMultiLine = editorAnnotation.lineStart !== editorAnnotation.lineEnd;
    editorFileComments.push({
      path: editorAnnotation.filePath,
      line: editorAnnotation.lineEnd,
      side: "RIGHT",
      body,
      ...(isMultiLine ? { start_line: editorAnnotation.lineStart, start_side: "RIGHT" as const } : {}),
    });
    editorFiles.add(editorAnnotation.filePath);
  }

  const currentKey = input.currentPrUrl ?? "_current";
  let editorCommentsAttached = false;

  for (const [prUrl, annotations] of byPr) {
    const sortedAnnotations = [...annotations].sort(compareCodeAnnotations);
    const sample = sortedAnnotations[0];
    const fileComments = buildAnnotationFileComments(sortedAnnotations);
    const fileScopedBody = buildFileScopedBody(sortedAnnotations);
    const uniqueFiles = new Set(sortedAnnotations.map((annotation) => annotation.filePath));

    if (prUrl === currentKey && editorFileComments.length > 0) {
      fileComments.push(...editorFileComments);
      for (const file of editorFiles) uniqueFiles.add(file);
      editorCommentsAttached = true;
    }

    targets.push({
      prUrl: prUrl === "_current" ? (input.currentPrUrl ?? "") : prUrl,
      prNumber: sample?.prNumber ?? input.currentPrMeta?.number ?? 0,
      prTitle: sample?.prTitle ?? input.currentPrMeta?.title ?? "",
      prRepo: sample?.prRepo ?? input.currentPrMeta?.repo ?? "",
      fileComments,
      fileScopedBody,
      fileCount: uniqueFiles.size,
      annotationCount: sortedAnnotations.length,
      status: "pending",
    });
  }

  if (!editorCommentsAttached && editorFileComments.length > 0) {
    targets.push({
      prUrl: input.currentPrUrl ?? "",
      prNumber: input.currentPrMeta?.number ?? 0,
      prTitle: input.currentPrMeta?.title ?? "",
      prRepo: input.currentPrMeta?.repo ?? "",
      fileComments: editorFileComments,
      fileScopedBody: "",
      fileCount: editorFiles.size,
      annotationCount: 0,
      status: "pending",
    });
  }

  const orphans: ReviewWorkbenchOrphanedFindings[] = [];
  for (const reason of ["full-stack", "unmapped"] as const) {
    const annotationsForReason = orphanAnnotations
      .filter((orphan) => orphan.reason === reason)
      .map((orphan) => orphan.annotation);
    if (annotationsForReason.length === 0) continue;
    orphans.push({
      reason,
      annotations: annotationsForReason,
      markdown: exportReviewFeedback(annotationsForReason),
    });
  }

  return { targets, orphans };
}

function buildLiveLog(input?: ReviewWorkbenchInput["liveLog"]): ReviewWorkbenchLiveLog {
  const content = input?.content ?? "";
  const isLive = input?.isLive ?? false;
  const maxRenderSize = input?.maxRenderSize ?? 50_000;
  let displayText = content;
  let truncated = false;

  if (content.length > maxRenderSize) {
    const sliceFrom = content.indexOf("\n", content.length - maxRenderSize);
    displayText = `[earlier output truncated]\n${content.slice(sliceFrom === -1 ? content.length - maxRenderSize : sliceFrom + 1)}`;
    truncated = true;
  }

  return {
    displayText,
    fullText: content,
    isLive,
    hasOutput: content.length > 0,
    isWaiting: content.length === 0 && isLive,
    truncated,
  };
}

export function buildReviewWorkbenchModel(input: ReviewWorkbenchInput): ReviewWorkbenchModel {
  const viewedFilePaths = new Set(input.viewedFilePaths ?? []);
  const searchQuery = input.searchQuery ?? "";
  const searchMatches = findReviewSearchMatches(input.files, searchQuery);
  const searchGroups = groupReviewSearchMatches(input.files, searchMatches);
  const activeSearchMatch = input.activeSearchMatchId
    ? searchMatches.find((match) => match.id === input.activeSearchMatchId) ?? null
    : null;
  const annotationCounts = buildAnnotationCountMap(input.annotations);
  const searchCounts = buildSearchCountMap(searchMatches);
  const fileTree = buildFileTree(input.files);
  const fileTreeStats = new Map<string, ReviewWorkbenchTreeStats>();
  collectTreeStats(fileTree, annotationCounts, searchCounts, viewedFilePaths, fileTreeStats);

  const fileStates = input.files.map((file, index) => ({
    ...file,
    index,
    viewed: viewedFilePaths.has(file.path),
    active: file.path === input.selectedFilePath,
    annotationCount: annotationCounts.get(file.path) ?? 0,
    searchMatchCount: searchCounts.get(file.path) ?? 0,
  }));
  const visibleFiles = input.hideViewedFiles
    ? fileStates.filter((file) => !file.viewed)
    : fileStates;
  const selectedFile = visibleFiles.find((file) => file.path === input.selectedFilePath) ?? visibleFiles[0] ?? null;
  const finalFiles = fileStates.map((file) => ({ ...file, active: file.path === selectedFile?.path }));
  const finalVisibleFiles = input.hideViewedFiles
    ? finalFiles.filter((file) => !file.viewed)
    : finalFiles;
  const annotationGroups = groupAnnotations(input.annotations);
  const liveLog = buildLiveLog(input.liveLog);

  return {
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.traceId ? { traceId: input.traceId } : {}),
    ...(input.reviewId ? { reviewId: input.reviewId } : {}),
    files: finalFiles,
    visibleFiles: finalVisibleFiles,
    selectedFile: selectedFile ? { ...selectedFile, active: true } : null,
    fileTree,
    visualFileOrder: getVisualFileOrder(fileTree),
    fileTreeStats,
    annotationGroups,
    search: {
      query: searchQuery,
      matches: searchMatches,
      groups: searchGroups,
      activeMatch: activeSearchMatch,
      previousMatchId: getWrappedMatchId(searchMatches, input.activeSearchMatchId, -1),
      nextMatchId: getWrappedMatchId(searchMatches, input.activeSearchMatchId, 1),
    },
    suggestions: buildSuggestions(input.annotations),
    feedbackMarkdown: exportReviewFeedback(input.annotations),
    submission: buildReviewSubmission({
      annotations: input.annotations,
      editorAnnotations: input.editorAnnotations ?? [],
      currentPrUrl: input.currentPrUrl,
      currentDiffPaths: new Set(input.files.map((file) => file.path)),
      currentPrMeta: input.currentPrMeta,
    }),
    liveLog,
    summary: {
      fileCount: input.files.length,
      visibleFileCount: finalVisibleFiles.length,
      viewedFileCount: fileStates.filter((file) => file.viewed).length,
      annotationCount: input.annotations.length,
      blockingAnnotationCount: input.annotations.filter(isBlockingAnnotation).length,
      suggestionCount: input.annotations.filter((annotation) => annotation.suggestedCode).length,
      searchMatchCount: searchMatches.length,
      hasLiveOutput: liveLog.hasOutput,
    },
  };
}
