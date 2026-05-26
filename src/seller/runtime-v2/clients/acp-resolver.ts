/// <reference lib="dom" />
/**
 * Virtuals ACP profile resolver.
 *
 * Resolves a buyer-supplied `target` string (URL, UUID, or EVM wallet) into a
 * structured snapshot of the agent's public ACP profile by hitting the
 * unauthenticated `api.acp.virtuals.io` endpoints:
 *
 *   GET /agents/<uuid>                  — UUID lookup
 *   GET /agents/wallet/<0x...>          — wallet lookup
 *   GET /agents/search?query=<numId>    — last-resort lookup for v1 numeric ids
 *
 * Used by the `agent_quick_score` v2 handler. The grading rubric scores ONLY
 * the ACP profile fields returned here — never the buyer's brand surface,
 * website, or social presence. If the target cannot be resolved we return a
 * `{ resolved: false, reason }` envelope so the handler can short-circuit
 * with a structured "could not score" error instead of submitting a fabricated
 * scorecard.
 *
 * Network discipline:
 *   - 10s per-request timeout (AbortController) so a stuck upstream cannot
 *     pin the seller worker.
 *   - No follow-redirect into foreign hosts: fetch's default `follow` is fine
 *     because all responses on api.acp.virtuals.io return 2xx/404 directly.
 *   - No Authorization header — the resolver only touches the public API.
 */
import "dotenv/config";

const ACP_API_BASE =
  process.env.ACP_API_BASE_URL?.replace(/\/+$/, "") ||
  "https://api.acp.virtuals.io";

/** Hard per-request timeout. Burns 10s of the buyer's 5min SLA worst-case. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Lower bound for plausibly real EVM addresses. */
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * v4 UUID-ish matcher. Virtuals uses v7 ULIDs that pass the format-1/-5
 * regex shape (8-4-4-4-12 hex with version + variant nibbles), so we
 * relax the version nibble to any 1-7 and the variant nibble to any 8-b.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Raw shape returned by api.acp.virtuals.io. We deliberately mirror it. */
interface RawAcpAgent {
  id: string;
  name: string;
  description?: string | null;
  walletAddress: string;
  solWalletAddress?: string | null;
  role?: string | null;
  cluster?: string | null;
  createdAt: string;
  lastActiveAt?: string | null;
  isHidden?: boolean;
  builderCode?: string | null;
  consoleAgentId?: string | null;
  chains?: Array<{
    chainId: number;
    tokenAddress: string;
    symbol?: string | null;
    active?: boolean;
    erc8004AgentId?: string | null;
  }>;
  offerings?: Array<{
    name: string;
    description?: string | null;
    deliverable?: string | null;
    priceType?: string | null;
    priceValue?: number | string | null;
    slaMinutes?: number | null;
    requirements?: Record<string, unknown> | null;
    requiredFunds?: boolean | null;
    isHidden?: boolean | null;
    subscriptions?: Array<unknown> | null;
  }>;
  resources?: Array<{
    name: string;
    description?: string | null;
    url?: string | null;
    params?: Record<string, unknown> | null;
  }>;
}

interface RawSingleResponse {
  data?: RawAcpAgent | null;
}

interface RawListResponse {
  data?: RawAcpAgent[] | null;
}

/** Structured agent snapshot consumed by the consulting prompt. */
export interface AcpAgentSummary {
  id: string;
  name: string;
  description?: string;
  walletEvm: string;
  walletSol?: string | null;
  cluster?: string;
  consoleEnabled: boolean;
  createdAt: string;
  lastActiveAt?: string | null;
  isHidden: boolean;
  builderCode?: string | null;
}

export interface AcpOfferingSummary {
  name: string;
  description?: string;
  deliverable?: string;
  priceUsd: number;
  slaMinutes: number;
  requirementSchema: Record<string, unknown>;
  requiredFunds: boolean;
  hide: boolean;
  subscriptionTierCount: number;
}

export interface AcpResourceSummary {
  name: string;
  description?: string;
  url: string;
  paramsSchemaPresent: boolean;
}

export interface AcpChainSummary {
  chainId: number;
  tokenAddress: string;
  tokenSymbol?: string | null;
  erc8004AgentId?: string | null;
  active: boolean;
}

export interface AcpProfile {
  resolved: true;
  agent: AcpAgentSummary;
  offerings: AcpOfferingSummary[];
  resources: AcpResourceSummary[];
  chains: AcpChainSummary[];
}

export interface AcpResolutionFailure {
  resolved: false;
  reason: string;
  inputType?: "url" | "uuid" | "wallet" | "unknown";
}

export type AcpResolution = AcpProfile | AcpResolutionFailure;

/** Cheap input classification — drives which endpoint we try. */
type ParsedTarget =
  | { kind: "uuid"; uuid: string }
  | { kind: "wallet"; wallet: string }
  | { kind: "v1NumericId"; numericId: string }
  | { kind: "unknown" };

/**
 * Classify the buyer's target string. Order matters: we test URL shapes first
 * (so a URL containing a UUID is treated as UUID), then bare UUIDs/wallets.
 */
function parseTarget(target: string): ParsedTarget {
  const trimmed = target.trim();

  // Virtuals v2 URL: https://app.virtuals.io/acp/agents/<uuid>
  // (also tolerate a trailing slash, query string, or hash fragment).
  const v2UrlMatch = trimmed.match(
    /^https?:\/\/(?:[\w.-]+\.)?virtuals\.io\/acp\/agents\/([0-9a-f-]{8,40})(?:[\/?#]|$)/i,
  );
  if (v2UrlMatch && UUID_RE.test(v2UrlMatch[1])) {
    return { kind: "uuid", uuid: v2UrlMatch[1].toLowerCase() };
  }

  // Virtuals v1 URL: https://app.virtuals.io/virtuals/<numericId>
  const v1UrlMatch = trimmed.match(
    /^https?:\/\/(?:[\w.-]+\.)?virtuals\.io\/virtuals\/(\d+)(?:[\/?#]|$)/i,
  );
  if (v1UrlMatch) {
    return { kind: "v1NumericId", numericId: v1UrlMatch[1] };
  }

  // Bare UUID
  if (UUID_RE.test(trimmed)) {
    return { kind: "uuid", uuid: trimmed.toLowerCase() };
  }

  // EVM wallet
  if (EVM_ADDRESS_RE.test(trimmed)) {
    return { kind: "wallet", wallet: trimmed.toLowerCase() };
  }

  return { kind: "unknown" };
}

/**
 * Fetch JSON with a hard timeout. Returns `null` on 404, throws on other
 * non-2xx. Body parse failures bubble as thrown errors so the caller can map
 * them to a resolved=false envelope.
 */
async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      redirect: "manual",
    });
    if (resp.status === 404) return null;
    if (!resp.ok) {
      // Avoid leaking the full upstream body to the buyer — log it and throw
      // a generic, status-coded error mirroring consulting-client patterns.
      const text = await resp.text().catch(() => "");
      console.error(
        "[acp-resolver] upstream non-2xx",
        resp.status,
        text.slice(0, 200),
      );
      throw new Error(`ACP upstream failed: HTTP ${resp.status}`);
    }
    return (await resp.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Coerce arbitrary upstream price representations into a USD float. */
function normalisePrice(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Bound `subscriptions.length` so an unexpected payload can't blow the prompt. */
function subscriptionCount(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return Math.min(value.length, 32);
}

/** Are any keys present in `params`? Used as a coarse schema-presence signal. */
function paramsSchemaPresent(params: unknown): boolean {
  if (!params || typeof params !== "object") return false;
  const obj = params as Record<string, unknown>;
  const props = obj.properties;
  if (props && typeof props === "object" && Object.keys(props as object).length > 0) {
    return true;
  }
  const required = obj.required;
  return Array.isArray(required) && required.length > 0;
}

/**
 * Project the raw upstream agent into our tight `AcpProfile` shape. Drops the
 * fields the rubric doesn't need (imageUrl, walletProviders, socials, etc.) so
 * we don't burn LLM tokens on noise.
 */
function projectAgent(raw: RawAcpAgent): AcpProfile {
  const agent: AcpAgentSummary = {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? undefined,
    walletEvm: raw.walletAddress,
    walletSol: raw.solWalletAddress ?? null,
    cluster: raw.cluster ?? undefined,
    // Virtuals's `consoleAgentId` is a UUID when console is wired up, else
    // null. Surface it as a boolean for the rubric.
    consoleEnabled: typeof raw.consoleAgentId === "string" && raw.consoleAgentId.length > 0,
    createdAt: raw.createdAt,
    lastActiveAt: raw.lastActiveAt ?? null,
    isHidden: raw.isHidden === true,
    builderCode: raw.builderCode ?? null,
  };

  const offerings: AcpOfferingSummary[] = (raw.offerings ?? []).map((o) => ({
    name: o.name,
    description: o.description ?? undefined,
    deliverable: o.deliverable ?? undefined,
    priceUsd: normalisePrice(o.priceValue),
    slaMinutes: typeof o.slaMinutes === "number" ? o.slaMinutes : 0,
    requirementSchema:
      o.requirements && typeof o.requirements === "object" ? o.requirements : {},
    requiredFunds: o.requiredFunds === true,
    hide: o.isHidden === true,
    subscriptionTierCount: subscriptionCount(o.subscriptions),
  }));

  const resources: AcpResourceSummary[] = (raw.resources ?? []).map((r) => ({
    name: r.name,
    description: r.description ?? undefined,
    url: typeof r.url === "string" ? r.url : "",
    paramsSchemaPresent: paramsSchemaPresent(r.params),
  }));

  const chains: AcpChainSummary[] = (raw.chains ?? []).map((c) => ({
    chainId: c.chainId,
    tokenAddress: c.tokenAddress,
    tokenSymbol: c.symbol ?? null,
    erc8004AgentId: c.erc8004AgentId ?? null,
    active: c.active === true,
  }));

  return { resolved: true, agent, offerings, resources, chains };
}

/**
 * Resolve a buyer-supplied target into a tight ACP profile snapshot, or a
 * structured failure envelope when the target can't be matched. Never throws
 * for routine input problems (unknown shape, 404, bad classification) —
 * unexpected upstream errors still bubble so the runtime envelope can map
 * them.
 */
export async function resolveAcpProfile(
  target: string,
): Promise<AcpResolution> {
  const parsed = parseTarget(target);

  if (parsed.kind === "uuid") {
    const single = await fetchJson<RawSingleResponse>(
      `${ACP_API_BASE}/agents/${encodeURIComponent(parsed.uuid)}`,
    );
    if (single?.data) return projectAgent(single.data);
    return {
      resolved: false,
      reason: `No Virtuals ACP agent found for UUID ${parsed.uuid}.`,
      inputType: "uuid",
    };
  }

  if (parsed.kind === "wallet") {
    const single = await fetchJson<RawSingleResponse>(
      `${ACP_API_BASE}/agents/wallet/${encodeURIComponent(parsed.wallet)}`,
    );
    if (single?.data) return projectAgent(single.data);
    return {
      resolved: false,
      reason: `No Virtuals ACP agent found for wallet ${parsed.wallet}.`,
      inputType: "wallet",
    };
  }

  if (parsed.kind === "v1NumericId") {
    // The v1 numeric ids belong to `claw-api.virtuals.io`, which the v2 ACP
    // API does not currently mirror cleanly. We make one best-effort search
    // against the v2 list endpoint by numeric id; if it doesn't match, we
    // return a graceful "limited ACP data" marker rather than silently
    // submitting an empty scorecard.
    const list = await fetchJson<RawListResponse>(
      `${ACP_API_BASE}/agents/search?query=${encodeURIComponent(parsed.numericId)}`,
    );
    const match = (list?.data ?? []).find(
      (a) =>
        Array.isArray(a.chains) &&
        a.chains.some((c) => String(c.chainId).includes(parsed.numericId)),
    );
    if (match) return projectAgent(match);
    return {
      resolved: false,
      reason:
        "v1 agent — limited ACP data. Provide a Virtuals v2 agent UUID or EVM wallet to score this agent.",
      inputType: "url",
    };
  }

  return {
    resolved: false,
    reason:
      "Unable to resolve target to a Virtuals ACP agent. Provide a Virtuals agent URL, UUID, or EVM wallet address.",
    inputType: "unknown",
  };
}
