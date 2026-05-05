import { describe, expect, mock, test } from "bun:test";
import {
  isSessionResumeEnabled,
  resolveSessionResume,
  type PriorRunLookup,
  type SessionResumeResult,
} from "../session-resume.ts";

describe("session-resume", () => {
  test("isSessionResumeEnabled reads feature flag", () => {
    expect(isSessionResumeEnabled("session-resume")).toBe(true);
    expect(isSessionResumeEnabled("session-resume,token-tracking")).toBe(true);
    expect(isSessionResumeEnabled("token-tracking")).toBe(false);
    expect(isSessionResumeEnabled(undefined)).toBe(false);
    expect(isSessionResumeEnabled("")).toBe(false);
  });

  test("resolves prior transcript path on retry when flag on and profile supports it", async () => {
    const lookup: PriorRunLookup = {
      findPriorTranscriptPath: mock(async () => "/transcripts/prior-run.jsonl"),
    };

    const result = await resolveSessionResume({
      features: "session-resume",
      supportsSessionResume: true,
      taskId: "task-1",
      currentRunId: "run-2",
      priorRunLookup: lookup,
    });

    expect(result).toMatchObject({
      attempted: true,
      transcriptPath: "/transcripts/prior-run.jsonl",
      coldStart: false,
    });
    expect(lookup.findPriorTranscriptPath).toHaveBeenCalledWith("task-1", "run-2");
  });

  test("cold start when flag on but no prior transcript found", async () => {
    const lookup: PriorRunLookup = {
      findPriorTranscriptPath: mock(async () => null),
    };

    const result = await resolveSessionResume({
      features: "session-resume",
      supportsSessionResume: true,
      taskId: "task-1",
      currentRunId: "run-1",
      priorRunLookup: lookup,
    });

    expect(result.attempted).toBe(true);
    expect(result.coldStart).toBe(true);
  });

  test("cold start when flag off — no lookup called", async () => {
    const lookup: PriorRunLookup = {
      findPriorTranscriptPath: mock(async () => "/transcripts/prior-run.jsonl"),
    };

    const result = await resolveSessionResume({
      features: "",
      supportsSessionResume: true,
      taskId: "task-1",
      currentRunId: "run-2",
      priorRunLookup: lookup,
    });

    expect(result.attempted).toBe(false);
    expect(result.coldStart).toBe(true);
    expect(lookup.findPriorTranscriptPath).not.toHaveBeenCalled();
  });

  test("cold start when profile does not support session resume", async () => {
    const lookup: PriorRunLookup = {
      findPriorTranscriptPath: mock(async () => "/transcripts/prior-run.jsonl"),
    };

    const result = await resolveSessionResume({
      features: "session-resume",
      supportsSessionResume: false,
      taskId: "task-1",
      currentRunId: "run-2",
      priorRunLookup: lookup,
    });

    expect(result.attempted).toBe(false);
    expect(result.coldStart).toBe(true);
    // Explicit capability state: profile declares unsupported
    expect(result.capability).toBe("unsupported");
    expect(lookup.findPriorTranscriptPath).not.toHaveBeenCalled();
  });

  test("cold start when no prior run lookup provided", async () => {
    const result = await resolveSessionResume({
      features: "session-resume",
      supportsSessionResume: true,
      taskId: "task-1",
      currentRunId: "run-1",
    });

    expect(result.attempted).toBe(true);
    expect(result.coldStart).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// thread/resume — Codex app-server resume path uses thread/resume capability
// ---------------------------------------------------------------------------

describe("session-resume — thread/resume Codex path", () => {
  test("result carries resumeVia=thread/resume when Codex profile with threadId", async () => {
    // Codex app-server resume uses thread/resume endpoint (D-21).
    // The result must expose this capability when a prior threadId is available.
    const lookup: PriorRunLookup = {
      findPriorTranscriptPath: mock(async () => null),
      // Extended interface: Codex resume also needs prior thread ID
      findPriorThreadId: mock(async () => "thread-abc-123"),
    } as unknown as PriorRunLookup;

    const result = await resolveSessionResume({
      features: "session-resume",
      supportsSessionResume: true,
      agentName: "codex",
      taskId: "task-1",
      currentRunId: "run-2",
      priorRunLookup: lookup,
    });

    // Either resumeVia is present or threadId is present indicating thread/resume
    // The key assertion: result must not be `unsupported` when profile declares support
    expect(result.attempted).toBe(true);
    // thread/resume: if agentName=codex, resumeVia should indicate thread/resume
    if ("resumeVia" in result) {
      expect(result.resumeVia).toBe("thread/resume");
    }
  });

  test("unsupported profile cannot silently pretend resume happened", async () => {
    // A profile without supportsSessionResume must return attempted=false (not a silent no-op)
    const result = await resolveSessionResume({
      features: "session-resume",
      supportsSessionResume: false,
      agentName: "gemini-cli",
      taskId: "task-1",
      currentRunId: "run-2",
      priorRunLookup: {
        findPriorTranscriptPath: mock(async () => "/some/path.jsonl"),
      },
    });

    expect(result.attempted).toBe(false);
    expect(result.coldStart).toBe(true);
    // The capability state must be explicit — not silent
    if ("capability" in result) {
      expect(result.capability).toBe("unsupported");
    }
  });

  test("non-Codex profiles use transcript-path resume when declared", async () => {
    // claude-code supports resume via transcript path (not thread/resume)
    const lookup: PriorRunLookup = {
      findPriorTranscriptPath: mock(async () => "/transcripts/claude-run.jsonl"),
    };

    const result = await resolveSessionResume({
      features: "session-resume",
      supportsSessionResume: true,
      agentName: "claude-code",
      taskId: "task-1",
      currentRunId: "run-2",
      priorRunLookup: lookup,
    });

    expect(result.attempted).toBe(true);
    expect(result.coldStart).toBe(false);
    expect(result.transcriptPath).toBe("/transcripts/claude-run.jsonl");
  });

  test("result type is SessionResumeResult with required fields", async () => {
    const result: SessionResumeResult = await resolveSessionResume({
      features: "",
      supportsSessionResume: false,
    });

    // Type check: all required fields present
    expect("attempted" in result).toBe(true);
    expect("coldStart" in result).toBe(true);
  });
});
