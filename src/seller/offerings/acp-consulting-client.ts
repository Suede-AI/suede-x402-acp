/// <reference lib="dom" />
/**
 * Shared LLM client for ACP consulting offerings.
 *
 * Each consulting service has its own prompt template. The client wraps a
 * single OpenAI chat-completions call and returns the markdown deliverable as
 * a string. We use raw `fetch` (same pattern as video-client.ts) to avoid
 * adding an SDK dependency.
 *
 * Provider details are read from environment variables so they stay out of
 * public discovery surfaces:
 *   OPENAI_API_KEY        — required
 *   OPENAI_MODEL          — optional, defaults to "gpt-4o"
 *   OPENAI_API_BASE_URL   — optional, defaults to "https://api.openai.com"
 *
 * The exported `runConsultingAnalysis(serviceType, request)` is the single
 * entry point used by every consulting handler.
 */
import "dotenv/config";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";
const OPENAI_API_BASE = (process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com").replace(/\/+$/, "");

/** Per-service prompt configuration. */
interface PromptTemplate {
  /** System prompt — sets the analyst persona and output contract. */
  system: string;
  /**
   * Builds the user message from the buyer's request payload. Should produce a
   * complete, self-contained instruction including the input data, the
   * deliverable structure, and any tone/length guidance.
   */
  user: (request: Record<string, any>) => string;
  /** Suggested max output tokens. Defaults to 2500 if omitted. */
  maxTokens?: number;
}

/** Compact string formatter for the "context block" portion of each prompt. */
function formatContext(request: Record<string, any>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(request)) {
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "string") {
      lines.push(`- ${k}: ${v.trim()}`);
    } else {
      lines.push(`- ${k}: ${JSON.stringify(v)}`);
    }
  }
  return lines.length ? lines.join("\n") : "(no additional context provided)";
}

/**
 * Service-specific prompt templates. Each template is intentionally explicit
 * about the deliverable structure so output stays consistent across jobs.
 */
const PROMPT_TEMPLATES: Record<string, PromptTemplate> = {
  agent_quick_score: {
    system:
      "You are a senior analyst at Suede Labs reviewing Virtuals Protocol agents. " +
      "You produce concise, evidence-anchored scorecards. No marketing fluff, no hype, no emojis. " +
      "Score conservatively. Cite observable signals only.",
    user: (req) => `Produce a 1-page rapid scorecard for the following Virtuals agent.

Inputs:
${formatContext(req)}

Deliver markdown with these sections:
1. Snapshot — agent name, declared purpose, target buyers, one-line verdict.
2. Scorecard — table rating Positioning, Offering Quality, Pricing, Traction on 1-5 with one-sentence rationale each.
3. Strengths — 3 bullets.
4. Weaknesses — 3 bullets.
5. Top Recommendation — single highest-leverage change.

Keep total length under 500 words.`,
    maxTokens: 1500,
  },

  acp_performance_audit: {
    system:
      "You are a Virtuals ACP performance auditor. You review a seller agent's offerings, " +
      "pricing structure, fulfillment SLA, and visible jobs history, then deliver a structured " +
      "audit memo. You write precisely, surface concrete weaknesses, and recommend specific fixes. " +
      "No filler, no emojis, no apologies.",
    user: (req) => `Conduct a deep performance audit on the ACP seller agent below.

Inputs:
${formatContext(req)}

Deliver markdown:
1. Executive Summary — 3 sentences. Include overall health rating (Strong/Moderate/Weak).
2. Offering Inventory — table: offering name, fee, SLA, quality grade (A-F), notes.
3. Pricing Analysis — under-priced / fairly-priced / over-priced calls with reasoning.
4. Jobs History Signal — what visible job patterns reveal about demand and execution.
5. Top 5 Findings — ranked, each with: finding, evidence, impact, recommended action.
6. 30-Day Action Plan — bulleted next steps, ordered by leverage.

Be specific. Reference the input data wherever possible.`,
    maxTokens: 3000,
  },

  acp_offer_optimization: {
    system:
      "You are a conversion specialist for ACP / Virtuals offerings. You rewrite offering " +
      "names, descriptions, and prices for maximum discoverability in the Bazaar and maximum " +
      "buy-through rate from agent buyers. You write tight, declarative copy that surfaces " +
      "keywords without keyword-stuffing.",
    user: (req) => `Rewrite the following ACP offering to maximize discoverability and conversion.

Inputs:
${formatContext(req)}

Deliver markdown:
1. Diagnosis — what's wrong with the current offering, in 3-5 bullets.
2. Rewritten Offering
   - Name (3-5 words, snake_case-friendly)
   - One-paragraph description (120-180 words, keyword-dense but natural)
   - Recommended fee in USDC with brief justification
   - Recommended SLA in minutes with brief justification
3. A/B Variants — 2 alternate name + description pairs to test.
4. Keyword List — 8-12 search terms agent buyers likely use.
5. Expected Lift — qualitative call on what should improve and why.

Do not invent capabilities the seller didn't list.`,
    maxTokens: 2500,
  },

  acp_x402_promotion_plan: {
    system:
      "You are a launch strategist for x402 / Bazaar paid endpoints. You design 14-day " +
      "promotion plans that combine technical discovery (well-known endpoints, schema hygiene, " +
      "agent registries) with distribution moves (X posts, Telegram, agent-to-agent intros, " +
      "Bazaar listing optimization). You output plans developers can execute without a meeting.",
    user: (req) => `Build a tailored 14-day x402 / Bazaar promotion plan for the endpoint below.

Inputs:
${formatContext(req)}

Deliver markdown:
1. Endpoint Readiness Check — 5-7 things to verify before promoting (well-known files, schema, payment headers, idempotency, error handling).
2. 14-Day Calendar — day-by-day plan, one to three actions per day, with channel and target audience for each.
3. Content Pack — 3 X posts, 1 Telegram message, 1 LinkedIn paragraph, all tuned to agent-builder audience.
4. Distribution Targets — named registries, directories, and agent ecosystems to submit to.
5. Success Metrics — what to measure on day 7 and day 14.

Keep actions concrete. No "raise awareness" filler.`,
    maxTokens: 3000,
  },

  acp_market_arbitrage_report: {
    system:
      "You are an ACP market analyst. You survey offering categories on the Virtuals Bazaar, " +
      "identify mispriced offerings relative to peer comparable work, and deliver an arbitrage " +
      "memo a seller agent can act on this week. You think like a market maker: spread, " +
      "demand signal, fulfillment friction.",
    user: (req) => `Produce an ACP arbitrage memo across the categories specified below.

Inputs:
${formatContext(req)}

Deliver markdown:
1. Categories Surveyed — list with brief description of demand-side and supply-side characteristics.
2. Under-Priced Offerings — table of 3-5 examples: offering, current fee, fair-value fee range, why under-priced.
3. Over-Priced Offerings — table of 3-5 examples: offering, current fee, fair-value fee range, why over-priced.
4. Arbitrage Plays — 3 concrete moves a seller could make this week (e.g., undercut an over-priced niche, premium-price an under-served niche).
5. Risks — what could invalidate these calls in the next 30 days.

If the inputs don't name categories, ask one clarifying question at the top of the response and then proceed with sensible defaults.`,
    maxTokens: 3000,
  },

  acp_buyer_growth_list: {
    system:
      "You are a B2B prospector specialized in agent-to-agent commerce. You generate prospect " +
      "lists of likely-buyer agents for a given seller's offerings, focused on fit, frequency, " +
      "and recency. You output structured lists, not paragraphs.",
    user: (req) => `Generate a buyer growth list of 20+ agents likely to purchase the seller's offerings below.

Inputs:
${formatContext(req)}

Deliver markdown:
1. Buyer Hypothesis — 3-5 sentences on which agent archetypes most likely buy this seller's work, and why.
2. Prospect Table — at least 20 rows with columns: prospect agent name (or type if specific agents are unknown), why they fit, suggested offering match, suggested first outreach line (under 240 chars).
3. Outreach Sequencing — recommended order of contact for top 5, with reasoning.
4. Disqualifiers — types of agents to skip and why.

If specific Virtuals agent names cannot be confirmed from inputs, label rows as "Archetype: <description>" and still produce 20+ entries.`,
    maxTokens: 3500,
  },

  acp_agent_setup: {
    system:
      "You are an ACP launch engineer. You write end-to-end setup guides for new Virtuals / " +
      "ACP agents covering naming, offering design, pricing strategy, copy, and infra. You " +
      "produce a checklist a builder can execute in one focused session.",
    user: (req) => `Write a full end-to-end setup guide for launching the new ACP agent described below.

Inputs:
${formatContext(req)}

Deliver markdown:
1. Positioning — recommended agent name (2-3 candidates), one-line bio, target buyer segments.
2. Offering Lineup — table of 4-6 recommended offerings: name, one-paragraph description, suggested fee, SLA, requirement schema sketch.
3. Pricing Strategy — fee philosophy, anchor offering, optional bundle.
4. Copy Pack — agent bio (under 200 chars), Bazaar tagline, two long-form descriptions.
5. Infra Checklist — wallet, ACP_AUTH key, seller runtime, x402 discovery, env vars, deployment target (Render / Vercel / Fly note).
6. Day 1-7 Plan — what to ship each day to go from zero to first paid job.

Be opinionated. If the input lacks a critical detail (e.g., domain), pick the strongest default and flag the assumption.`,
    maxTokens: 4000,
  },
};

function requireEnv(value: string, name: string): string {
  if (!value) throw new Error(`${name} not configured`);
  return value;
}

/**
 * Throws if OPENAI_API_KEY is missing. Called by the seller runtime at
 * startup to refuse to register consulting offerings before they can
 * accept payment they can't fulfil.
 */
export function assertReady(): void {
  requireEnv(OPENAI_API_KEY, "OPENAI_API_KEY");
}

/**
 * Run a consulting analysis. Selects the prompt template for `serviceType`,
 * substitutes the buyer's `request` payload, calls OpenAI, and returns the
 * markdown deliverable.
 *
 * Throws if the service type is unknown, the env is misconfigured, or the
 * upstream call fails.
 */
export async function runConsultingAnalysis(
  serviceType: string,
  request: Record<string, any>,
): Promise<string> {
  const template = PROMPT_TEMPLATES[serviceType];
  if (!template) {
    throw new Error(`Unknown consulting service type: ${serviceType}`);
  }

  const apiKey = requireEnv(OPENAI_API_KEY, "OPENAI_API_KEY");
  const url = `${OPENAI_API_BASE}/v1/chat/completions`;

  const payload = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: template.system },
      { role: "user", content: template.user(request) },
    ],
    temperature: 0.4,
    max_tokens: template.maxTokens ?? 2500,
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Consulting analysis failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error(`Consulting provider returned no content: ${JSON.stringify(data)}`);
  }
  return content.trim();
}

/** Exposed for tests / introspection: which service types this client handles. */
export function listConsultingServices(): string[] {
  return Object.keys(PROMPT_TEMPLATES);
}
