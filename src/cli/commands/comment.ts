/**
 * fulcrum comment — task comment commands.
 *
 * Usage:
 *   fulcrum comment list <taskId>            — list threaded comments
 *   fulcrum comment add <taskId> "body"      — add comment
 *   fulcrum comment reply <commentId> "body" — reply to comment
 *   fulcrum comment resolve <commentId>      — resolve comment
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => Promise<any>;

export interface CommentRunOptions {
  caller?: {
    comments: {
      create: AnyFn;
      threaded: AnyFn;
      resolve: AnyFn;
    };
  };
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

interface ThreadedComment {
  id: string;
  author: string;
  body: string;
  createdAt: Date | string;
  replies: ThreadedComment[];
}

const HELP = `fulcrum comment

Task comment commands.

Usage:
  fulcrum comment list <taskId>              List threaded comments
  fulcrum comment add <taskId> "<body>"      Add a comment
  fulcrum comment reply <commentId> "<body>" Reply to a comment
  fulcrum comment resolve <commentId>        Resolve a comment
`;

export async function run(argv: readonly string[], opts: CommentRunOptions = {}): Promise<void> {
  const { print = console.log, printErr = console.error, exit = process.exit } = opts;
  const [sub, ...rest] = argv;

  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    print(HELP);
    return;
  }

  if (sub === "list") {
    const taskId = rest[0];
    if (!taskId) {
      printErr("fulcrum comment list: missing <taskId>");
      exit(2);
      return;
    }
    try {
      const caller = await resolveCaller(opts);
      const comments = await caller.comments.threaded({ taskId });
      if (!Array.isArray(comments) || comments.length === 0) {
        print("  (no comments)");
        return;
      }
      for (const comment of comments as ThreadedComment[]) {
        renderComment(comment, 0, print);
      }
    } catch (err) {
      printErr(`fulcrum comment list: ${(err as Error).message}`);
      exit(1);
    }
    return;
  }

  if (sub === "add") {
    const [taskId, ...bodyParts] = rest;
    const body = bodyParts.join(" ");
    if (!taskId || !body) {
      printErr("fulcrum comment add: usage: fulcrum comment add <taskId> \"body\"");
      exit(2);
      return;
    }
    try {
      const caller = await resolveCaller(opts);
      const result = await caller.comments.create({ taskId, body });
      print(`Created comment ${result.id ?? "(unknown)"}`);
    } catch (err) {
      printErr(`fulcrum comment add: ${(err as Error).message}`);
      exit(1);
    }
    return;
  }

  if (sub === "reply") {
    const [commentId, ...bodyParts] = rest;
    const body = bodyParts.join(" ");
    if (!commentId || !body) {
      printErr("fulcrum comment reply: usage: fulcrum comment reply <commentId> \"body\"");
      exit(2);
      return;
    }
    try {
      const caller = await resolveCaller(opts);
      const result = await caller.comments.create({ parentCommentId: commentId, body });
      print(`Created reply ${result.id ?? "(unknown)"}`);
    } catch (err) {
      printErr(`fulcrum comment reply: ${(err as Error).message}`);
      exit(1);
    }
    return;
  }

  if (sub === "resolve") {
    const commentId = rest[0];
    if (!commentId) {
      printErr("fulcrum comment resolve: missing <commentId>");
      exit(2);
      return;
    }
    try {
      const caller = await resolveCaller(opts);
      await caller.comments.resolve({ commentId });
      print(`Resolved comment ${commentId}`);
    } catch (err) {
      printErr(`fulcrum comment resolve: ${(err as Error).message}`);
      exit(1);
    }
    return;
  }

  printErr(`fulcrum comment: unknown subcommand '${sub}'`);
  print(HELP);
  exit(2);
}

function renderComment(comment: ThreadedComment, depth: number, print: (line: string) => void): void {
  const indent = "  ".repeat(depth);
  const prefix = depth === 0 ? "" : "↳ ";
  const when = formatRelativeTime(comment.createdAt);
  print(`${indent}${prefix}@${comment.author} (${when}): ${comment.body}`);
  for (const reply of comment.replies ?? []) {
    renderComment(reply, Math.min(depth + 1, 3), print);
  }
}

function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

async function resolveCaller(opts: CommentRunOptions): Promise<Required<CommentRunOptions>["caller"]> {
  if (opts.caller) return opts.caller;

  const { t } = await import("../../trpc/trpc.ts");
  const { appRouter } = await import("../../trpc/router.ts");
  const { createContext } = await import("../../trpc/context.ts");
  const { MikroORM } = await import("@mikro-orm/postgresql");
  const { Container } = await import("@needle-di/core");
  const { registerDbBindings } = await import("../../db/db.module.ts");

  const orm = new MikroORM({} as never);
  const container = new Container();
  container.bind({ provide: MikroORM, useValue: orm });
  const em = orm.em.fork();
  registerDbBindings(container, orm, em);

  const ctx = createContext({ session: null as never, orgId: "", userId: "", em, container });
  const factory = t.createCallerFactory(appRouter);
  return factory(ctx) as Required<CommentRunOptions>["caller"];
}
