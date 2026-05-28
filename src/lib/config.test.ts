/**
 * Tests for the pure/utility exports in src/lib/config.ts.
 *
 * NOTE on checkForExistingProcess: all three internal helpers it calls
 * (readConfig, isProcessRunning, removePidFromConfig) live in the same module.
 * Under ESM, same-module live bindings cannot be intercepted by vi.spyOn on the
 * imported namespace. Instead we mock `fs` (which readConfig/writeConfig use) to
 * control what readConfig returns, spy on process.kill (which isProcessRunning
 * calls), spy on fs.writeFileSync (which removePidFromConfig calls via
 * writeConfig), and stub process.exit via vi.stubGlobal.
 *
 * NOTE on exports NOT tested here:
 * - readConfig / writeConfig — depend on fs; covered indirectly via
 *   checkForExistingProcess tests below.
 * - loadApiKey / requireApiKey — require coordinated env + fs mocking; omitted.
 * - writePidToConfig / findSellerPid / getActiveAgent / getActiveAgentV2 /
 *   findAgentByName / activateAgent — file-I/O heavy; omitted.
 * - ROOT / CONFIG_JSON_PATH / LOGS_DIR — path constants, not pure logic.
 */
import * as fs from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock must be hoisted above any imports that touch the mocked module.
vi.mock("fs");

import {
  checkForExistingProcess,
  formatPrice,
  isProcessRunning,
  sanitizeAgentName,
} from "./config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cast the mocked fs to a type we can call mockReturnValue on. */
const fsMock = fs as unknown as {
  existsSync: ReturnType<typeof vi.fn>;
  readFileSync: ReturnType<typeof vi.fn>;
  writeFileSync: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.unstubAllGlobals();
  // Reset all fs mock call counts so assertions in checkForExistingProcess
  // tests only count calls made within that specific test.
  vi.mocked(fsMock.existsSync).mockReset();
  vi.mocked(fsMock.readFileSync).mockReset();
  vi.mocked(fsMock.writeFileSync).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// =============================================================================
// formatPrice
// =============================================================================

describe("formatPrice", () => {
  it("returns '<value> USDC' for fixed price type", () => {
    expect(formatPrice(3, "fixed")).toBe("3 USDC");
  });

  it("converts decimal to percentage with two decimal places", () => {
    // 0.1 stored as decimal → 0.1 * 100 = 10 → "10.00%"
    expect(formatPrice(0.1, "percentage")).toBe("10.00%");
  });

  it("formats a whole number as a percentage", () => {
    // 0.5 → 50.00%
    expect(formatPrice(0.5, "percentage")).toBe("50.00%");
  });

  it("returns '<value> <priceType>' for a custom (unknown) price type", () => {
    expect(formatPrice("abc", "custom")).toBe("abc custom");
  });

  it("returns '-' when price is null and priceType is undefined", () => {
    // undefined != null is false in JS, so it falls through to return p ("-")
    expect(formatPrice(null, undefined)).toBe("-");
  });

  it("returns just the value when priceType is null", () => {
    // null != null is false, so priceType=null skips the 'custom' branch
    expect(formatPrice(5, null)).toBe("5");
  });

  it("returns raw string price for fixed type", () => {
    // price is a string; p = "12.5"
    expect(formatPrice("12.5", "fixed")).toBe("12.5 USDC");
  });

  it("converts string decimal percentage correctly", () => {
    // price = "0.25" (string), parsed to 0.25 → 25.00%
    expect(formatPrice("0.25", "percentage")).toBe("25.00%");
  });

  it("returns '-' for null price with a non-null priceType", () => {
    // p = "-" (null price), priceType="fixed" → "-" + " USDC"
    expect(formatPrice(null, "fixed")).toBe("- USDC");
  });

  it("is case-insensitive for 'FIXED' priceType", () => {
    // String("FIXED").toLowerCase() === "fixed"
    expect(formatPrice(2, "FIXED")).toBe("2 USDC");
  });

  it("is case-insensitive for 'PERCENTAGE' priceType", () => {
    expect(formatPrice(0.2, "PERCENTAGE")).toBe("20.00%");
  });
});

// =============================================================================
// sanitizeAgentName
// =============================================================================

describe("sanitizeAgentName", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(sanitizeAgentName("Producer by Suede Labs")).toBe(
      "producer-by-suede-labs",
    );
  });

  it("collapses consecutive non-alphanumeric runs into a single hyphen", () => {
    // '__' and '--' each collapse to one '-'
    expect(sanitizeAgentName("Agent__Name--Test")).toBe("agent-name-test");
  });

  it("strips leading and trailing hyphens", () => {
    expect(sanitizeAgentName("--leading-trailing--")).toBe("leading-trailing");
  });

  it("handles mixed alphanumeric and spaces", () => {
    expect(sanitizeAgentName("Hello World 123")).toBe("hello-world-123");
  });

  it("returns an empty string for an input that is all special characters", () => {
    // all chars get replaced with '-', then leading/trailing stripped → ""
    expect(sanitizeAgentName("---")).toBe("");
  });

  it("leaves already-clean slugs unchanged", () => {
    expect(sanitizeAgentName("my-agent-2")).toBe("my-agent-2");
  });

  it("treats uppercase letters as non-special (just lowercases them)", () => {
    expect(sanitizeAgentName("UPPERCASE")).toBe("uppercase");
  });
});

// =============================================================================
// isProcessRunning
// =============================================================================

describe("isProcessRunning", () => {
  it("returns true when process.kill(pid, 0) succeeds (no throw)", () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    expect(isProcessRunning(1234)).toBe(true);
    killSpy.mockRestore();
  });

  it("returns false when process.kill throws ESRCH (no such process)", () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      const err: NodeJS.ErrnoException = new Error("No such process");
      err.code = "ESRCH";
      throw err;
    });
    expect(isProcessRunning(9999)).toBe(false);
    killSpy.mockRestore();
  });

  it("returns true when process.kill throws a non-ESRCH error (e.g. EPERM)", () => {
    // EPERM means the process exists but we lack permission to signal it
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      const err: NodeJS.ErrnoException = new Error("Operation not permitted");
      err.code = "EPERM";
      throw err;
    });
    expect(isProcessRunning(1)).toBe(true);
    killSpy.mockRestore();
  });
});

// =============================================================================
// checkForExistingProcess
// =============================================================================

describe("checkForExistingProcess", () => {
  /**
   * Set up fs mocks so readConfig returns a controlled ConfigJson.
   * existsSync → true so the file-read path is taken.
   * readFileSync → JSON of the provided config object.
   * writeFileSync → no-op (prevents actual disk writes).
   */
  function setupFsConfig(config: Record<string, unknown>): void {
    vi.mocked(fsMock.existsSync).mockReturnValue(true);
    vi.mocked(fsMock.readFileSync).mockReturnValue(JSON.stringify(config));
    vi.mocked(fsMock.writeFileSync).mockImplementation(() => undefined);
  }

  it("calls process.exit(1) when SELLER_PID is set and process is still running", () => {
    setupFsConfig({ SELLER_PID: 5678 });

    // process.kill(pid, 0) does not throw → isProcessRunning returns true
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as never);

    checkForExistingProcess();

    expect(exitSpy).toHaveBeenCalledWith(1);
    // removePidFromConfig (and therefore writeFileSync) must NOT be called
    expect(fsMock.writeFileSync).not.toHaveBeenCalled();

    killSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("calls removePidFromConfig (via writeFileSync) and does NOT exit when SELLER_PID is set but process is gone", () => {
    setupFsConfig({ SELLER_PID: 9999 });

    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      const err: NodeJS.ErrnoException = new Error("No such process");
      err.code = "ESRCH";
      throw err;
    });
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as never);

    checkForExistingProcess();

    // process is gone → removePidFromConfig is called → writeConfig → writeFileSync
    expect(fsMock.writeFileSync).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();

    killSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("does nothing when SELLER_PID is absent from config", () => {
    setupFsConfig({});

    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as never);

    checkForExistingProcess();

    expect(killSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(fsMock.writeFileSync).not.toHaveBeenCalled();

    killSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("does nothing when config.json does not exist", () => {
    // existsSync → false → readConfig returns {}
    vi.mocked(fsMock.existsSync).mockReturnValue(false);

    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as never);

    checkForExistingProcess();

    expect(killSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();

    killSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
