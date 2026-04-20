// PR 4 closeout c5 — AD-3 belt-and-suspenders redundancy.
//
// experimental.chat.messages.transform is the fallback rider injection path.
// When experimental.chat.system.transform has fired at least once this session
// (experimentalFiredCount > 0), messages.transform skips injection to avoid
// duplicating rider content. When it hasn't, messages.transform prepends a
// synthetic TextPart to the first user message so the model still sees the
// rider via the conversation stream.
//
// Replicates handler logic in isolation — matches the test shim pattern in
// event-subscriptions.test.ts / tool-policy.test.ts since importing
// plugins/fulcrum.ts would pull in @opencode-ai/plugin (not a dev dep).

import { describe, it, expect } from "vitest"

interface RiderLoadResult {
  rider: string
  ruleCount: number
  sha256: string
  integrityOk: boolean
  integrityWarning: string | null
}

interface MessageInfo { id: string; sessionID: string }
interface MessagesOutput {
  messages: { info: MessageInfo; parts: Array<Record<string, unknown>> }[]
}

function makeHandler(state: {
  experimentalFiredCount: number
  messagesTransformFiredCount: number
  riderLoad: RiderLoadResult
}) {
  return async (_input: unknown, output: MessagesOutput) => {
    state.messagesTransformFiredCount++
    if (state.experimentalFiredCount > 0) return
    if (!state.riderLoad.rider || output.messages.length === 0) return
    const first = output.messages[0]
    if (!first) return
    const riderPart = {
      id: `fulcrum-rider-${Date.now()}`,
      sessionID: first.info.sessionID,
      messageID: first.info.id,
      type: "text" as const,
      text: `<fulcrum-system-rider fallback="messages.transform" sha256="${state.riderLoad.sha256.slice(0, 12)}">\n${state.riderLoad.rider}\n</fulcrum-system-rider>`,
      synthetic: true,
    }
    first.parts.unshift(riderPart)
  }
}

function emptyRider(): RiderLoadResult {
  return { rider: "", ruleCount: 0, sha256: "", integrityOk: true, integrityWarning: null }
}

function sampleRider(): RiderLoadResult {
  return {
    rider: "FULCRUM RIDER BODY",
    ruleCount: 3,
    sha256: "a".repeat(64),
    integrityOk: true,
    integrityWarning: null,
  }
}

function outputWithMessages(): MessagesOutput {
  return {
    messages: [
      { info: { id: "msg_001", sessionID: "sess_A" }, parts: [{ type: "text", text: "user question" }] },
      { info: { id: "msg_002", sessionID: "sess_A" }, parts: [{ type: "text", text: "assistant reply" }] },
    ],
  }
}

describe("experimental.chat.messages.transform — AD-3 belt-and-suspenders redundancy", () => {
  it("injects rider as synthetic TextPart when system.transform has not fired this session", async () => {
    const state = {
      experimentalFiredCount: 0,
      messagesTransformFiredCount: 0,
      riderLoad: sampleRider(),
    }
    const output = outputWithMessages()
    await makeHandler(state)({}, output)

    expect(state.messagesTransformFiredCount).toBe(1)
    expect(output.messages[0]!.parts.length).toBe(2)
    const injected = output.messages[0]!.parts[0] as Record<string, unknown>
    expect(injected.type).toBe("text")
    expect(injected.synthetic).toBe(true)
    expect(injected.messageID).toBe("msg_001")
    expect(injected.sessionID).toBe("sess_A")
    expect(injected.text as string).toContain("FULCRUM RIDER BODY")
    expect(injected.text as string).toContain('fallback="messages.transform"')
  })

  it("skips injection when system.transform has already fired this session", async () => {
    const state = {
      experimentalFiredCount: 1,  // primary path landed this session
      messagesTransformFiredCount: 0,
      riderLoad: sampleRider(),
    }
    const output = outputWithMessages()
    const partsBefore = output.messages[0]!.parts.length
    await makeHandler(state)({}, output)

    expect(state.messagesTransformFiredCount).toBe(1)  // counter still increments
    expect(output.messages[0]!.parts.length).toBe(partsBefore)  // but no injection
  })

  it("no-ops when the rider is empty (no rules on disk)", async () => {
    const state = {
      experimentalFiredCount: 0,
      messagesTransformFiredCount: 0,
      riderLoad: emptyRider(),
    }
    const output = outputWithMessages()
    const partsBefore = output.messages[0]!.parts.length
    await makeHandler(state)({}, output)

    expect(state.messagesTransformFiredCount).toBe(1)
    expect(output.messages[0]!.parts.length).toBe(partsBefore)
  })

  it("no-ops when messages[] is empty (no existing conversation to attach to)", async () => {
    const state = {
      experimentalFiredCount: 0,
      messagesTransformFiredCount: 0,
      riderLoad: sampleRider(),
    }
    const output: MessagesOutput = { messages: [] }
    await makeHandler(state)({}, output)

    expect(state.messagesTransformFiredCount).toBe(1)
    expect(output.messages.length).toBe(0)
  })

  it("keeps injecting every LLM call as long as primary path remains silent", async () => {
    const state = {
      experimentalFiredCount: 0,
      messagesTransformFiredCount: 0,
      riderLoad: sampleRider(),
    }
    const h = makeHandler(state)
    // Simulate 3 LLM calls with the primary never firing.
    for (let i = 0; i < 3; i++) {
      const output = outputWithMessages()
      await h({}, output)
      expect((output.messages[0]!.parts[0] as Record<string, unknown>).synthetic).toBe(true)
    }
    expect(state.messagesTransformFiredCount).toBe(3)
  })

  it("stops injecting once the primary path fires even once (first-write-wins)", async () => {
    const state = {
      experimentalFiredCount: 0,
      messagesTransformFiredCount: 0,
      riderLoad: sampleRider(),
    }
    const h = makeHandler(state)

    // Call 1: primary silent → fallback injects.
    const out1 = outputWithMessages()
    await h({}, out1)
    expect((out1.messages[0]!.parts[0] as Record<string, unknown>).synthetic).toBe(true)

    // Primary fires somewhere between call 1 and call 2.
    state.experimentalFiredCount = 1

    // Call 2: fallback now skips (primary is working).
    const out2 = outputWithMessages()
    const partsBefore2 = out2.messages[0]!.parts.length
    await h({}, out2)
    expect(out2.messages[0]!.parts.length).toBe(partsBefore2)
  })

  it("fails open on rider integrity warning (injects but marks sha)", async () => {
    const state = {
      experimentalFiredCount: 0,
      messagesTransformFiredCount: 0,
      riderLoad: { ...sampleRider(), integrityOk: false, integrityWarning: "mismatch" },
    }
    const output = outputWithMessages()
    await makeHandler(state)({}, output)
    const injected = output.messages[0]!.parts[0] as Record<string, unknown>
    // AD-3 / AD-9a fail-open: rider still goes through even when .ridersum
    // mismatches. The sha slice lets an observer tell which rider bytes
    // landed in a given turn.
    expect(injected.text as string).toContain("FULCRUM RIDER BODY")
  })
})
