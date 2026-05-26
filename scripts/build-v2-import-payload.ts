/**
 * Build a {jobs, resources} payload for the Virtuals v2 dashboard's
 * "Import Agent Offerings" (Paste JSON) flow.
 *
 * Inputs:
 *   - V2_EXPORT (env or arg 1)  path to a freshly exported agent-offerings.json from
 *                               the v2 dashboard. Its 7 existing jobs + 7 resources
 *                               are treated as canonical and copied through unchanged.
 *   - src/seller/offerings/producer-by-suede-labs/{name}/offering.json
 *                               Local offerings; the 20 NOT already in the v2 export
 *                               are transformed into dashboard schema and appended.
 *
 * Output:
 *   - scripts/v2-import-payload.json    The pasteable payload.
 *
 * Run:
 *   npx tsx scripts/build-v2-import-payload.ts ~/Downloads/agent-offerings\ \(1\).json
 */

import * as fs from "node:fs";
import * as path from "node:path";

interface LocalOffering {
  name: string;
  description: string;
  jobFee: number;
  jobFeeType: "fixed" | string;
  slaMinutes: number;
  requiredFunds?: boolean;
  requirement: Record<string, unknown>;
}

interface DashboardJob {
  name: string;
  description: string;
  slaMinutes: number;
  requirement: Record<string, unknown>;
  deliverable: string;
  requiredFunds: boolean;
  hide: boolean;
  subscriptionTiers: unknown[];
  price: { type: string; value: number };
}

interface DashboardResource {
  name: string;
  description: string;
  url: string;
  params: Record<string, unknown>;
  hide: boolean;
}

interface ExportPayload {
  exportDate?: string;
  jobs: DashboardJob[];
  resources: DashboardResource[];
}

// Virtuals v2 import constraints (enforced server-side on POST):
//   - description ≤ 500 characters
//   - slaMinutes ≥ 5
const MAX_DESCRIPTION = 500;
const MIN_SLA_MINUTES = 5;

// Tighter rewrites of the local offering descriptions for the 20 offerings
// not currently listed on v2. The local descriptions exceed v2's 500-char
// limit; these cuts preserve the agent-discovery signal (what it does, key
// inputs, who it's for) within the limit.
const SHORT_DESCRIPTIONS: Record<string, string> = {
  // Video (5)
  general_video:
    "Suede Labs AI video producer for agents that need a finished 10-second clip from a text prompt. Cinematic, promo, explainer, music, brand, product, or meme-adjacent. Optional reference image URLs. Supports 16:9 / 9:16 / 1:1, pro or std quality, and optional generated sound. Best for agent workflows needing paid x402/ACP media generation, short-form content, ad creative, launch visuals, pitch assets, or branded video from natural language.",
  meme_video:
    "Suede Labs meme-format video for agent workflows that need a punchy short clip from a text prompt. Optimized for 9:16 social formats (TikTok / Reels / Shorts) with cinematic motion. Best for paid x402/ACP meme generation, viral creative experiments, brand humor, and reaction posts.",
  product_showcase_video:
    "Suede Labs product showcase video built from a text prompt and up to four reference image URLs. Generates a finished 10-second product reveal at 16:9, 9:16, or 1:1. Best for agents producing ad creative, store assets, brand drops, launch visuals, or any commerce-bound short video where the product must be the hero.",
  product_showcase_video_10s:
    "Suede Labs premium 10-second product showcase video at pro quality. Prompt + optional reference image URLs become a polished product reveal at 16:9, 9:16, or 1:1. Best for agents producing high-end ad creative, brand launch visuals, or repeatable commerce media where production polish drives conversion.",
  suede_video_generation:
    "General-purpose AI video generation from a text prompt with broad creative latitude (looser than the named general_video / meme_video / product_showcase variants). Suitable for exploratory short video, concept tests, and agent workflows that need a video output without a strict format preset.",

  // Music generation & editing (7)
  suede_music_generation:
    "Suede Labs AI music producer for agents that need an original track from a text prompt. Generates a full MP3 with title, style, and tempo metadata. Best for paid x402/ACP music generation, jingles, social audio, ad music, drops, sample beds, and agent-bound creative workflows that need royalty-free original audio fast.",
  suede_lyrics:
    "Suede Labs lyric writer for agents that need original song lyrics from a topic, style, or brief. Returns plain UTF-8 text with verse/chorus structure. Best for agent workflows that drive songwriting, brand jingles, social audio scripting, vocal-cover prep, or batch-generated content pipelines.",
  suede_extend:
    "Suede Labs music extender for agents that need an existing track lengthened. Takes a source audio URL and returns an extended MP3 that continues the composition coherently. Best for paid x402/ACP music pipelines, looping ads, longer cuts of generated tracks, and agent workflows producing radio-length variants.",
  suede_continue:
    "Suede Labs music continuation for agents that need a variation or sequel of an existing track. Takes a source audio URL and returns a new MP3 continuing the same musical direction. Best for agent workflows generating multi-track releases, B-sides, follow-up cuts, and remix-adjacent variations.",
  suede_cover:
    "Suede Labs cover engine for agents that need a source track re-recorded in a different style, genre, or instrumentation. Takes a source audio URL and returns a new MP3 cover. Best for paid x402/ACP music pipelines, brand re-skinning, style A/B tests, and creator workflows that monetize covers.",
  suede_voice_cover:
    "Suede Labs AI vocal cover for agents that need a source track re-sung by a configurable AI voice (style, gender, age). Takes a source audio URL and returns a new MP3. Best for agent workflows producing creator-style vocal covers, brand voiceovers on existing songs, and demo vocals for music pipelines.",
  suede_acapella:
    "Suede Labs acapella extractor for agents that need isolated vocals from a source track. Takes an audio URL and returns an MP3 of the isolated vocal stem. Best for agent workflows producing remixes, vocal covers, lyrics transcription, karaoke assets, and music analysis on the vocal alone.",

  // Audio processing (5)
  suede_stems:
    "Suede Labs stem splitter for agents that need a source track separated into vocals, drums, bass, and other stems. Takes an audio URL and returns a ZIP of stem MP3s. Best for agent workflows producing remixes, sample prep, karaoke builds, and downstream tasks that need clean isolated layers.",
  suede_stems_pro:
    "Suede Labs HD stem splitter for agents that need high-fidelity stem separation on a source track. Takes an audio URL and returns a ZIP of pro-quality stems suitable for production use. Best for agent workflows monetizing remix kits, studio prep, and audio engineering pipelines that need broadcast-grade stems.",
  suede_master_wav:
    "Suede Labs mastering pass for agents that need an input mix mastered to a polished WAV. Takes a mix URL and returns a mastered WAV. Best for agent workflows producing ready-to-release tracks, ad music finalization, and any music pipeline that needs broadcast-loud, mastered audio.",
  suede_midi:
    "Suede Labs MIDI transcriber for agents that need an audio source converted to a MIDI file. Takes an audio URL and returns a MIDI file. Best for agent workflows producing arrangement prep, music theory analysis, instrument re-recording, and downstream tasks that need note-level data.",
  suede_lyric_sync:
    "Suede Labs LRC generator for agents that need timed/synced lyrics for a song from an audio URL. Returns an LRC text file with timestamps. Best for agent workflows producing karaoke assets, music video lyric overlays, accessibility captions, and music players that need synced display.",

  // Audio analysis (3)
  suede_style_coach:
    "Suede Labs production-style coach for agents that need mix and mastering recommendations on a track. Takes an audio URL and returns a plain-text report covering EQ, dynamics, balance, stereo image, and reference comparisons. Best for producer workflows, music release prep, and agent tools that surface concrete production fixes.",
  suede_audio_analyze:
    "Suede Labs audio analyzer for agents that need objective features extracted from a track. Takes an audio URL and returns a structured JSON report with key, tempo, energy, mood, and detected instruments. Best for agent workflows producing music tagging, catalog enrichment, recommendation systems, and rights workflows that need machine-readable audio metadata.",
  suede_rights_lookup:
    "Suede Labs rights and licensing lookup for agents that need clearance information on a source audio identifier (ISRC, URL, or title). Returns a structured JSON report. Best for agent workflows producing clearance checks, sync-license prep, and music-rights triage before a production pipeline commits.",
};

// Authored deliverables for the 20 offerings not currently listed on v2.
// Each is a one-line outcome description shown to buyer agents.
const DELIVERABLES: Record<string, string> = {
  // Video (4)
  general_video:
    "MP4 video at the requested aspect ratio (16:9 / 9:16 / 1:1) and quality mode (pro/std), with optional generated sound. Delivered as a public URL plus a Suede share page.",
  meme_video:
    "Short meme-format MP4 video at the requested aspect ratio (typically 9:16). Delivered as a public URL plus a Suede share page.",
  product_showcase_video:
    "Product-focused MP4 video built from prompt + optional reference images at the requested aspect ratio. Delivered as a public URL plus a Suede share page.",
  product_showcase_video_10s:
    "10-second premium product showcase MP4 video built from prompt + optional reference images. Delivered as a public URL plus a Suede share page.",

  // Music / Audio (16)
  suede_music_generation:
    "Original MP3 track generated from the text prompt, including title, style, and tempo metadata. Delivered as a public URL.",
  suede_lyrics:
    "Original song lyrics matching the topic/style brief. Delivered as plain UTF-8 text.",
  suede_extend:
    "Music track extended from an existing audio URL. Delivered as a public MP3 URL of the extended composition.",
  suede_continue:
    "Continuation or variation of an existing track from an input URL. Delivered as a public MP3 URL.",
  suede_cover:
    "Cover version of a source track in the requested style or instrumentation. Delivered as a public MP3 URL.",
  suede_voice_cover:
    "AI-voice vocal cover of a source track at the requested voice profile. Delivered as a public MP3 URL.",
  suede_acapella:
    "Acapella extraction (isolated vocals) from an input audio URL. Delivered as a public MP3 URL.",
  suede_stems:
    "Multi-stem separation (vocals, drums, bass, other) from a source track. Delivered as a public ZIP URL containing each stem.",
  suede_stems_pro:
    "High-fidelity multi-stem separation from a source track. Delivered as a public ZIP URL containing each HD stem.",
  suede_master_wav:
    "Mastered WAV file from an input mix URL. Delivered as a public WAV URL.",
  suede_midi:
    "MIDI transcription of an input audio URL. Delivered as a public MIDI file URL.",
  suede_lyric_sync:
    "Synchronized LRC-format lyrics for a song built from an input audio URL. Delivered as a public LRC text URL.",
  suede_style_coach:
    "Production-style analysis with mix and mastering recommendations for an input track. Delivered as a plain text report.",
  suede_audio_analyze:
    "Audio analysis (key, tempo, energy, mood, instruments) for an input audio URL. Delivered as a structured JSON report.",
  suede_rights_lookup:
    "Rights and licensing lookup for an input source audio identifier. Delivered as a structured JSON report.",
  suede_video_generation:
    "AI-generated MP4 video from prompt with broad creative latitude (less constrained than the named general/meme/product_showcase variants). Delivered as a public URL.",
};

// Overrides applied to EXISTING v2 jobs whose dashboard description/deliverable
// no longer matches the deployed handler behavior. Used to keep the public
// marketing in sync with the worker code.
//
// agent_quick_score was rewritten in commit 02a0450 to score ACP profile data
// only (via api.acp.virtuals.io), not URL crawling. The original description
// said "Suede crawls the public surface (Virtuals manifest, x402 endpoints,
// website, on-chain footprint)" — that is no longer accurate.
const JOB_OVERRIDES: Record<
  string,
  { description?: string; deliverable?: string }
> = {
  agent_quick_score: {
    description:
      "Instant ACP profile score for any Virtuals agent. Suede fetches the agent's structured ACP data (offerings, resources, chains, on-chain settlement) via api.acp.virtuals.io and grades it across seven ACP-side dimensions only: discoverability, offer quality, pricing signal, trust/proof, x402/stablecoin, ACP compatibility, market opportunity. Returns a 0-100 Performance Index plus verdict band (REPLACEABLE / EXPOSED / ENTERING / POSITIONED / TOP 0.1%). Brand and web surface explicitly NOT scored.",
    deliverable:
      "Performance Index (0-100), seven ACP-side sub-scores, verdict band, single-line headline, top blocker, single recommended next move. Scoring method: ACP profile data only (no brand-surface crawling).",
  },
};

function loadLocalOfferings(rootDir: string): Map<string, LocalOffering> {
  const offeringsRoot = path.resolve(
    rootDir,
    "src/seller/offerings/producer-by-suede-labs",
  );
  const out = new Map<string, LocalOffering>();
  for (const entry of fs.readdirSync(offeringsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(offeringsRoot, entry.name, "offering.json");
    if (!fs.existsSync(file)) continue;
    const data = JSON.parse(fs.readFileSync(file, "utf-8")) as LocalOffering;
    out.set(data.name, data);
  }
  return out;
}

function transformLocalToDashboard(local: LocalOffering): DashboardJob {
  const deliverable = DELIVERABLES[local.name];
  if (!deliverable) {
    throw new Error(
      `No authored deliverable for offering "${local.name}". Add it to DELIVERABLES in this script.`,
    );
  }
  const description = SHORT_DESCRIPTIONS[local.name] ?? local.description;
  if (description.length > MAX_DESCRIPTION) {
    throw new Error(
      `Description for "${local.name}" is ${description.length} chars; v2 requires ≤${MAX_DESCRIPTION}.`,
    );
  }
  return {
    name: local.name,
    description,
    slaMinutes: Math.max(local.slaMinutes, MIN_SLA_MINUTES),
    requirement: local.requirement,
    deliverable,
    requiredFunds: local.requiredFunds ?? false,
    hide: false,
    subscriptionTiers: [],
    price: { type: local.jobFeeType || "fixed", value: local.jobFee },
  };
}

function main(): void {
  const exportArg = process.argv[2] || process.env.V2_EXPORT;
  if (!exportArg) {
    console.error(
      "Usage: tsx scripts/build-v2-import-payload.ts <path-to-v2-export.json>",
    );
    process.exit(1);
  }
  const exportPath = path.resolve(exportArg.replace(/^~/, process.env.HOME!));
  const exportData = JSON.parse(
    fs.readFileSync(exportPath, "utf-8"),
  ) as ExportPayload;

  const existingJobNames = new Set(exportData.jobs.map((j) => j.name));
  const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const localOfferings = loadLocalOfferings(rootDir);

  // Apply JOB_OVERRIDES to existing v2 jobs in place. Validate description
  // length so we don't break the 500-char ceiling.
  const overriddenJobs: string[] = [];
  for (const job of exportData.jobs) {
    const override = JOB_OVERRIDES[job.name];
    if (!override) continue;
    if (override.description !== undefined) {
      if (override.description.length > MAX_DESCRIPTION) {
        throw new Error(
          `Override description for "${job.name}" is ${override.description.length} chars; v2 requires ≤${MAX_DESCRIPTION}.`,
        );
      }
      job.description = override.description;
    }
    if (override.deliverable !== undefined) {
      job.deliverable = override.deliverable;
    }
    overriddenJobs.push(job.name);
  }

  const newJobs: DashboardJob[] = [];
  for (const [name, local] of localOfferings) {
    if (existingJobNames.has(name)) continue;
    newJobs.push(transformLocalToDashboard(local));
  }

  // Order: existing 7 first (preserve dashboard order), then new 20 in
  // sensible groupings: video first, then music alphabetical.
  const VIDEO_ORDER = [
    "general_video",
    "meme_video",
    "product_showcase_video",
    "product_showcase_video_10s",
    "suede_video_generation",
  ];
  newJobs.sort((a, b) => {
    const ai = VIDEO_ORDER.indexOf(a.name);
    const bi = VIDEO_ORDER.indexOf(b.name);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.name.localeCompare(b.name);
  });

  const payload: ExportPayload = {
    jobs: [...exportData.jobs, ...newJobs],
    resources: exportData.resources,
  };

  const outPath = path.resolve(rootDir, "scripts/v2-import-payload.json");
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");

  const summary = {
    existingJobs: exportData.jobs.length,
    newJobs: newJobs.length,
    overriddenJobs,
    totalJobs: payload.jobs.length,
    totalResources: payload.resources.length,
    newJobNames: newJobs.map((j) => j.name),
    outputPath: outPath,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main();
