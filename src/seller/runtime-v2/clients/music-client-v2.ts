// =============================================================================
// v2 music client — thin re-export of the existing v1 music client.
//
// The v1 client at src/seller/offerings/music-client.ts already implements
// every Suede music/audio function plus the two error classes the runtime
// uses to map upstream backend gaps to a clean BACKEND_UNAVAILABLE failure.
// Phase 4 handlers import from this file so v2 has one place to swap when
// the upstream contract evolves.
//
// DO NOT duplicate logic here — extend music-client.ts and re-export.
// =============================================================================

export {
  assertReady,
  generateMusic,
  generateLyrics,
  extendTrack,
  continueTrack,
  coverTrack,
  voiceCover,
  extractAcapella,
  extractStems,
  masterWav,
  transcribeMidi,
  syncLyrics,
  coachStyle,
  analyzeAudio,
  lookupRights,
  SuedeEndpointUnavailableError,
  SuedeInternalRouteMissingError,
} from "../../offerings/music-client.js";

export type {
  GenerateMusicOptions,
  GenerateLyricsOptions,
  ExtendTrackOptions,
  ContinueTrackOptions,
  CoverTrackOptions,
  VoiceCoverOptions,
  ExtractAcapellaOptions,
  ExtractStemsOptions,
  MasterWavOptions,
  TranscribeMidiOptions,
  SyncLyricsOptions,
  CoachStyleOptions,
  AnalyzeAudioOptions,
  LookupRightsOptions,
} from "../../offerings/music-client.js";
