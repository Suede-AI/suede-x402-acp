#!/usr/bin/env npx tsx
import { main } from "../src/seller/runtime-v2/index.js";

main().catch((err) => {
  console.error("[v2-seller] fatal", err);
  process.exit(1);
});
