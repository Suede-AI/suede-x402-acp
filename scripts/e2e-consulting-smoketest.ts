/**
 * Smoke-test for the 6 non-agent_quick_score v2 consulting handlers.
 *
 * Calls each handler against live `api.acp.virtuals.io` (where the resolver is
 * exercised via `agent_url_for_context`) and `compute.virtuals.io` (LLM). Prints
 * envelope shape + first 800 chars of content + per-handler latency.
 *
 * Usage:
 *   set -a; . ./.env; set +a
 *   ./node_modules/.bin/tsx scripts/e2e-consulting-smoketest.ts
 *
 * Reads VIRTUALS_V2_COMPUTE_API_KEY from env. Costs ~6 Haiku-4.5 calls
 * (cents). No USDC, no ACP buy.
 */
import { handle as performanceAudit } from "../src/seller/runtime-v2/handlers/acp_performance_audit";
import { handle as offerOptimization } from "../src/seller/runtime-v2/handlers/acp_offer_optimization";
import { handle as x402PromotionPlan } from "../src/seller/runtime-v2/handlers/acp_x402_promotion_plan";
import { handle as marketArbitrageReport } from "../src/seller/runtime-v2/handlers/acp_market_arbitrage_report";
import { handle as buyerGrowthList } from "../src/seller/runtime-v2/handlers/acp_buyer_growth_list";
import { handle as agentSetup } from "../src/seller/runtime-v2/handlers/acp_agent_setup";

const PRODUCER_V2_UUID = "019e3991-374d-75f3-a6b8-17ff309b4cd2";
const PRODUCER_V2_URL = `https://app.virtuals.io/acp/agents/${PRODUCER_V2_UUID}`;

type Case = { name: string; handle: (r: Record<string, unknown>) => Promise<string>; req: Record<string, unknown> };

const CASES: Case[] = [
  {
    name: "acp_performance_audit",
    handle: performanceAudit,
    req: {
      acp_profile_or_offer: PRODUCER_V2_URL,
      performance_goal: "increase paid job volume by 2x in next 30 days",
    },
  },
  {
    name: "acp_offer_optimization",
    handle: offerOptimization,
    req: {
      agent_or_business: "Producer by Suede Labs",
      what_you_sell: "ACP profile scoring, music/video generation, consulting jobs for Virtuals sellers",
      agent_url_for_context: PRODUCER_V2_URL,
    },
  },
  {
    name: "acp_x402_promotion_plan",
    handle: x402PromotionPlan,
    req: {
      agent_or_business: "Producer by Suede Labs",
      primary_offer: "agent_quick_score — instant ACP scorecard for $3",
      agent_url_for_context: PRODUCER_V2_URL,
    },
  },
  {
    name: "acp_market_arbitrage_report",
    handle: marketArbitrageReport,
    req: {
      agent_or_business: "Producer by Suede Labs",
      what_you_sell: "ACP-side consulting + music + video for agent-commerce sellers",
      agent_url_for_context: PRODUCER_V2_URL,
    },
  },
  {
    name: "acp_buyer_growth_list",
    handle: buyerGrowthList,
    req: {
      acp_offer: "agent_quick_score (3 USDC, instant ACP scorecard)",
      target_buyer: "early-stage Virtuals sellers with sparse profiles",
      market_or_platform: "Virtuals ACP",
      agent_url_for_context: PRODUCER_V2_URL,
    },
  },
  {
    name: "acp_agent_setup",
    handle: agentSetup,
    req: {
      business_or_project: "AcmeBeats — an indie label new to agent-commerce",
      what_you_sell: "stems and lyric drafts for solo producers",
      owner_context: "two-person shop, no engineering capacity, brand-conscious",
    },
  },
];

async function run(c: Case): Promise<{ ok: boolean; ms: number; body: string }> {
  const t0 = Date.now();
  try {
    const out = await c.handle(c.req);
    return { ok: true, ms: Date.now() - t0, body: out };
  } catch (e: any) {
    return { ok: false, ms: Date.now() - t0, body: e?.message ?? String(e) };
  }
}

async function main() {
  const summary: Array<{ name: string; ok: boolean; ms: number; envelope?: string; preview?: string; error?: string }> = [];
  for (const c of CASES) {
    console.log(`\n=== ${c.name} ===`);
    const r = await run(c);
    if (!r.ok) {
      console.error(`FAIL in ${r.ms}ms: ${r.body}`);
      summary.push({ name: c.name, ok: false, ms: r.ms, error: r.body });
      continue;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(r.body);
    } catch {
      parsed = null;
    }
    const envelope = parsed
      ? `type=${parsed.type} service=${parsed.service} schemaVersion=${parsed.schemaVersion ?? "n/a"}`
      : "(non-JSON body)";
    const preview = parsed?.content ? String(parsed.content).slice(0, 800) : r.body.slice(0, 800);
    console.log(`OK in ${r.ms}ms — ${envelope}`);
    console.log(preview);
    summary.push({ name: c.name, ok: true, ms: r.ms, envelope, preview });
  }

  console.log("\n=================== SUMMARY ===================");
  for (const s of summary) {
    const status = s.ok ? "PASS" : "FAIL";
    console.log(`${status.padEnd(4)}  ${String(s.ms).padStart(6)}ms  ${s.name}  ${s.ok ? s.envelope : s.error?.slice(0, 80)}`);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
