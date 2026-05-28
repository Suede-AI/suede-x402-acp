// =============================================================================
// Pure dispatch helpers extracted from index.ts so they can be unit-tested
// without importing index.ts (which boots the v2 agent at import time).
// =============================================================================

import type { JobSession } from "@virtuals-protocol/acp-node-v2";

/**
 * Extract the offering name from a JobSession. v2 sets the job's `description`
 * field to the offering name when `createJobFromOffering` is used by the
 * buyer; for safety we also try to JSON-parse it.
 */
export async function resolveOfferingName(
  session: JobSession
): Promise<string | undefined> {
  let description: string | null = null;

  if (session.job?.description) {
    description = session.job.description;
  } else {
    try {
      const job = await session.fetchJob();
      description = job?.description ?? null;
    } catch {
      return undefined;
    }
  }

  if (!description) return undefined;

  const trimmed = description.trim();
  if (!trimmed) return undefined;

  // Some buyers stuff JSON into description; if it parses and has a `name`
  // field, prefer that. Otherwise fall back to the raw string.
  try {
    const parsed = JSON.parse(trimmed);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { name?: unknown }).name === "string"
    ) {
      return (parsed as { name: string }).name;
    }
  } catch {
    // not JSON — that's fine
  }

  return trimmed;
}

/**
 * Walk a session's entries looking for the most recent `requirement` message
 * from the buyer. Falls back to {} when no requirement has been sent yet.
 */
export function resolveRequirement(
  session: JobSession
): Record<string, unknown> {
  for (let i = session.entries.length - 1; i >= 0; i--) {
    const e = session.entries[i];
    if (e.kind === "message" && e.contentType === "requirement") {
      try {
        const parsed = JSON.parse(e.content);
        if (parsed && typeof parsed === "object") {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return { raw: e.content };
      }
    }
  }
  return {};
}
