/**
 * Manual E2E test for agent_quick_score handler.
 *
 * Calls the handler against live `api.acp.virtuals.io` (ACP resolver) and
 * `compute.virtuals.io` (LLM gateway) with two real targets — Producer v2's
 * UUID and its EVM wallet — and prints the scorecard envelope. Verifies the
 * full pipeline (resolve → prompt → LLM → markdown) without spending USDC.
 *
 * Usage:
 *   set -a; . ./.env; set +a
 *   ./node_modules/.bin/tsx scripts/e2e-quick-score.ts
 */
import { handle as quickScore } from "../src/seller/runtime-v2/handlers/agent_quick_score";

async function main() {
  const targets = [
    "019e3991-374d-75f3-a6b8-17ff309b4cd2",
    "0x8b59efd371e8ceb523fefad53c4e941a4dd9bc07",
  ];
  for (const target of targets) {
    console.log(`\n=== agent_quick_score(target=${target}) ===`);
    const t0 = Date.now();
    try {
      const result = await quickScore({ target });
      const dt = Date.now() - t0;
      console.log(`OK in ${dt}ms`);
      console.log(typeof result === "string" ? result.slice(0, 2400) : JSON.stringify(result, null, 2).slice(0, 2400));
    } catch (e: any) {
      const dt = Date.now() - t0;
      console.error(`FAIL in ${dt}ms:`, e?.message ?? e);
    }
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
