/**
 * Tests for the music-client-v2 re-export wrapper.
 *
 * The wrapper exists so Phase 4 handlers import every Suede music/audio
 * function from one place. These tests verify the surface: each name is
 * exported and identical to the underlying v1 implementation, and the two
 * error classes are re-exported as constructable classes.
 */
import { describe, expect, it } from "vitest";

import * as v2 from "./music-client-v2.js";
import * as v1 from "../../offerings/music-client.js";

describe("music-client-v2", () => {
  const expectedFunctions = [
    "assertReady",
    "generateMusic",
    "generateLyrics",
    "extendTrack",
    "continueTrack",
    "coverTrack",
    "voiceCover",
    "extractAcapella",
    "extractStems",
    "masterWav",
    "transcribeMidi",
    "syncLyrics",
    "coachStyle",
    "analyzeAudio",
    "lookupRights",
  ] as const;

  it.each(expectedFunctions)("re-exports %s identically to v1", (name) => {
    const v2Member = (v2 as Record<string, unknown>)[name];
    const v1Member = (v1 as Record<string, unknown>)[name];
    expect(typeof v2Member).toBe("function");
    expect(v2Member).toBe(v1Member);
  });

  it("re-exports SuedeEndpointUnavailableError as a constructable class", () => {
    expect(typeof v2.SuedeEndpointUnavailableError).toBe("function");
    const err = new v2.SuedeEndpointUnavailableError("POST /v1/extend");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SuedeEndpointUnavailableError");
    expect(err.message).toContain("/v1/extend");
    expect(err).toBeInstanceOf(v1.SuedeEndpointUnavailableError);
  });

  it("re-exports SuedeInternalRouteMissingError as a constructable class", () => {
    expect(typeof v2.SuedeInternalRouteMissingError).toBe("function");
    const err = new v2.SuedeInternalRouteMissingError("POST /agent/video");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SuedeInternalRouteMissingError");
    expect(err.message).toContain("/agent/video");
    expect(err).toBeInstanceOf(v1.SuedeInternalRouteMissingError);
  });
});
