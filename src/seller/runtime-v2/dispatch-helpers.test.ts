/**
 * Tests for pure dispatch helpers: resolveOfferingName, resolveRequirement.
 *
 * No network, no imports that boot the agent. All helpers are synchronous or
 * accept a minimal fake JobSession constructed inline.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveOfferingName,
  resolveRequirement,
} from "./dispatch-helpers.js";

// ---------------------------------------------------------------------------
// Minimal fake-session factories
// ---------------------------------------------------------------------------

type FakeEntry = {
  kind: string;
  contentType?: string;
  content?: string;
  event?: string;
};

type FakeJob = {
  description?: string;
};

/**
 * Build the minimum shape of a JobSession that the helpers actually touch.
 * Cast through unknown so TypeScript doesn't demand the full interface.
 */
function makeSession(opts: {
  job?: FakeJob;
  fetchJob?: () => Promise<FakeJob | null>;
  entries?: FakeEntry[];
}) {
  return {
    job: opts.job,
    fetchJob: opts.fetchJob ?? (() => Promise.resolve(null)),
    entries: opts.entries ?? [],
  } as unknown as import("@virtuals-protocol/acp-node-v2").JobSession;
}

// ---------------------------------------------------------------------------
// resolveOfferingName
// ---------------------------------------------------------------------------

describe("resolveOfferingName", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("(1) returns a plain-string description unchanged", async () => {
    const session = makeSession({ job: { description: "general_video" } });
    const result = await resolveOfferingName(session);
    expect(result).toBe("general_video");
  });

  it("(2) JSON description with a name field → returns name value", async () => {
    const session = makeSession({
      job: { description: '{"name":"meme_video","x":1}' },
    });
    const result = await resolveOfferingName(session);
    expect(result).toBe("meme_video");
  });

  it("(3) JSON description without a name field → returns the raw trimmed string", async () => {
    const session = makeSession({
      job: { description: '{"foo":1}' },
    });
    const result = await resolveOfferingName(session);
    expect(result).toBe('{"foo":1}');
  });

  it("(4) no job → calls fetchJob and returns description from that", async () => {
    const fetchJob = vi.fn().mockResolvedValue({ description: "suede_lyrics" });
    const session = makeSession({ fetchJob });
    const result = await resolveOfferingName(session);
    expect(result).toBe("suede_lyrics");
    expect(fetchJob).toHaveBeenCalledTimes(1);
  });

  it("(5) no job and fetchJob rejects → returns undefined", async () => {
    const fetchJob = vi.fn().mockRejectedValue(new Error("network error"));
    const session = makeSession({ fetchJob });
    const result = await resolveOfferingName(session);
    expect(result).toBeUndefined();
  });

  it("(6) description present but whitespace-only → returns undefined", async () => {
    const session = makeSession({ job: { description: "   " } });
    const result = await resolveOfferingName(session);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveRequirement
// ---------------------------------------------------------------------------

describe("resolveRequirement", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("(7) returns parsed object from the most recent requirement entry", () => {
    const entries: FakeEntry[] = [
      // older requirement — should be ignored in favour of the later one
      {
        kind: "message",
        contentType: "requirement",
        content: '{"prompt":"old prompt"}',
      },
      // unrelated entry in between
      {
        kind: "message",
        contentType: "text",
        content: "hello",
      },
      // newest requirement — must win
      {
        kind: "message",
        contentType: "requirement",
        content: '{"prompt":"new prompt","audio_url":"https://cdn.example/a.mp3"}',
      },
    ];

    const session = makeSession({ entries });
    const result = resolveRequirement(session);

    // Returns the LATEST requirement, not the first one
    expect(result).toEqual({
      prompt: "new prompt",
      audio_url: "https://cdn.example/a.mp3",
    });
  });

  it("(8a) requirement entry with invalid JSON → returns { raw: <content> }", () => {
    const entries: FakeEntry[] = [
      {
        kind: "message",
        contentType: "requirement",
        content: "not-valid-json{{{",
      },
    ];

    const session = makeSession({ entries });
    const result = resolveRequirement(session);
    // assert exact raw string value
    expect((result as { raw: string }).raw).toBe("not-valid-json{{{");
  });

  it("(8b) no requirement entry at all → returns empty object {}", () => {
    const entries: FakeEntry[] = [
      { kind: "message", contentType: "text", content: "hello" },
      { kind: "event", event: "job_created" },
    ];

    const session = makeSession({ entries });
    const result = resolveRequirement(session);
    expect(result).toEqual({});
  });
});
