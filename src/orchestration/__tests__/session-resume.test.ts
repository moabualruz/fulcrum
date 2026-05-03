import { describe, expect, mock, test } from "bun:test";
import {
  isSessionResumeEnabled,
  resolveSessionResume,
  type PriorRunLookup,
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

    expect(result).toEqual({
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

    expect(result).toEqual({
      attempted: true,
      coldStart: true,
    });
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

    expect(result).toEqual({
      attempted: false,
      coldStart: true,
    });
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

    expect(result).toEqual({
      attempted: false,
      coldStart: true,
    });
    expect(lookup.findPriorTranscriptPath).not.toHaveBeenCalled();
  });

  test("cold start when no prior run lookup provided", async () => {
    const result = await resolveSessionResume({
      features: "session-resume",
      supportsSessionResume: true,
      taskId: "task-1",
      currentRunId: "run-1",
    });

    expect(result).toEqual({
      attempted: true,
      coldStart: true,
    });
  });
});
