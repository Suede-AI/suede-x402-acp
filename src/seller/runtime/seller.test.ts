// =============================================================================
// Tests for the seller runtime entrypoint (handleNewTask).
//
// seller.ts guards main() behind NODE_ENV !== "test", so importing it here is
// side-effect free (no socket connect, no fs PID write). We additionally mock
// its network/socket/fs collaborators so handleNewTask is exercised in full
// isolation:
//   - ./sellerApi.js     — accept/reject, requestPayment, deliver, failure
//   - ./offerings.js     — loadOffering returns a fake { config, handlers }
//   - ./clientReadiness.js — assertOfferingReady controls the readiness gate
//   - ./acpSocket.js, ../../lib/wallet.js, ../../lib/config.js are stubbed so
//     no real socket/network/fs is reachable at import time.
//
// Build strategy mirrors the project's other handler tests: declare hoisted
// vi.fn() refs, vi.mock the modules, then `await import` the unit under test.
// =============================================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AcpJobPhase, type AcpJobEventData } from "./types.js";
import type {
  ExecuteJobResult,
  OfferingHandlers,
  ValidationResult,
} from "./offeringTypes.js";

// -- Hoisted collaborator mocks --------------------------------------------

const acceptOrRejectJob = vi.fn(async () => {});
const requestPayment = vi.fn(async () => {});
const deliverJob = vi.fn(async () => {});
const deliverJobFailure = vi.fn(async () => {});

const loadOffering = vi.fn();
const assertOfferingReady = vi.fn();

vi.mock("./sellerApi.js", () => ({
  acceptOrRejectJob,
  requestPayment,
  deliverJob,
  deliverJobFailure,
}));

vi.mock("./offerings.js", () => ({
  loadOffering,
  listOfferings: vi.fn(() => []),
}));

vi.mock("./clientReadiness.js", () => ({
  assertOfferingReady,
  clientForOffering: vi.fn(() => null),
}));

// Defensive stubs so importing seller.ts never reaches a real socket/network/fs.
// (main() is already guarded by NODE_ENV==="test", but these keep the module
// graph hermetic and fast.)
vi.mock("./acpSocket.js", () => ({
  connectAcpSocket: vi.fn(() => () => {}),
}));

vi.mock("../../lib/wallet.js", () => ({
  getMyAgentInfo: vi.fn(async () => ({
    name: "Test Agent",
    walletAddress: "0xabc",
  })),
}));

vi.mock("../../lib/config.js", () => ({
  checkForExistingProcess: vi.fn(),
  writePidToConfig: vi.fn(),
  removePidFromConfig: vi.fn(),
  sanitizeAgentName: vi.fn((n: string) => n),
}));

const { handleNewTask } = await import("./seller.js");

// -- Test data builders -----------------------------------------------------

const OFFERING_NAME = "suede_music_generation";
const REQUIREMENT = { prompt: "lofi beats", duration: 30 };
const NEGOTIATION_MEMO_ID = 42;

/**
 * Build an AcpJobEventData whose single negotiation memo carries a JSON
 * `{ name, requirement }` body so resolveOfferingName + resolveServiceRequirements
 * both extract known values. For REQUEST phase, handleNewTask additionally
 * requires `memoToSign` to point at a memo whose nextPhase is NEGOTIATION, so
 * the memo id matches memoToSign and memoToSign is set.
 */
function buildJobData(
  overrides: Partial<AcpJobEventData> = {},
  memoContent: string = JSON.stringify({
    name: OFFERING_NAME,
    requirement: REQUIREMENT,
  })
): AcpJobEventData {
  return {
    id: 1001,
    phase: AcpJobPhase.REQUEST,
    clientAddress: "0xclient",
    providerAddress: "0xprovider",
    evaluatorAddress: "0xevaluator",
    price: 5,
    memos: [
      {
        id: NEGOTIATION_MEMO_ID,
        memoType: 0,
        content: memoContent,
        nextPhase: AcpJobPhase.NEGOTIATION,
      },
    ],
    context: {},
    memoToSign: NEGOTIATION_MEMO_ID,
    ...overrides,
  };
}

/** Build a fake LoadedOffering with the handler set the test wants. */
function fakeOffering(
  handlers: Partial<OfferingHandlers>,
  requiredFunds = false
): { config: { name: string; requiredFunds: boolean }; handlers: OfferingHandlers } {
  return {
    config: { name: OFFERING_NAME, requiredFunds },
    handlers: {
      executeJob: vi.fn(async (): Promise<ExecuteJobResult> => ({
        deliverable: "default",
      })),
      ...handlers,
    } as OfferingHandlers,
  };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  acceptOrRejectJob.mockReset().mockResolvedValue(undefined);
  requestPayment.mockReset().mockResolvedValue(undefined);
  deliverJob.mockReset().mockResolvedValue(undefined);
  deliverJobFailure.mockReset().mockResolvedValue(undefined);
  loadOffering.mockReset();
  assertOfferingReady.mockReset().mockReturnValue({ ready: true });

  // Silence + capture console output (handleNewTask is chatty).
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// -- REQUEST phase ----------------------------------------------------------

describe("handleNewTask — REQUEST phase", () => {
  it("accepts the job and requests payment when validateRequirements returns valid", async () => {
    // Arrange
    const validateRequirements = vi.fn(
      (): ValidationResult => ({ valid: true })
    );
    const requestPaymentHandler = vi.fn(() => "Pay up please");
    loadOffering.mockResolvedValue(
      fakeOffering({ validateRequirements, requestPayment: requestPaymentHandler })
    );

    // Act
    await handleNewTask(buildJobData());

    // Assert — validator saw the resolved requirement
    expect(validateRequirements).toHaveBeenCalledWith(REQUIREMENT);

    // accept:true on the resolved jobId (data.id)
    expect(acceptOrRejectJob).toHaveBeenCalledTimes(1);
    expect(acceptOrRejectJob).toHaveBeenCalledWith(1001, {
      accept: true,
      reason: "Job accepted",
    });

    // payment requested with the handler-provided reason, no payableDetail
    expect(requestPayment).toHaveBeenCalledTimes(1);
    expect(requestPayment).toHaveBeenCalledWith(1001, {
      content: "Pay up please",
      payableDetail: undefined,
    });
  });

  it("rejects with the supplied reason and does NOT request payment when validation fails", async () => {
    // Arrange
    const validateRequirements = vi.fn(
      (): ValidationResult => ({ valid: false, reason: "duration too long" })
    );
    loadOffering.mockResolvedValue(fakeOffering({ validateRequirements }));

    // Act
    await handleNewTask(buildJobData());

    // Assert
    expect(acceptOrRejectJob).toHaveBeenCalledTimes(1);
    expect(acceptOrRejectJob).toHaveBeenCalledWith(1001, {
      accept: false,
      reason: "duration too long",
    });
    expect(requestPayment).not.toHaveBeenCalled();
  });

  it("rejects and never loads the offering when the offering is not ready", async () => {
    // Arrange
    assertOfferingReady.mockReturnValue({
      ready: false,
      reason: "SUEDE_API_KEY unset",
    });

    // Act
    await handleNewTask(buildJobData());

    // Assert — gate fires before loadOffering
    expect(loadOffering).not.toHaveBeenCalled();
    expect(acceptOrRejectJob).toHaveBeenCalledTimes(1);
    expect(acceptOrRejectJob).toHaveBeenCalledWith(1001, {
      accept: false,
      reason: "Offering temporarily unavailable: SUEDE_API_KEY unset",
    });
    expect(requestPayment).not.toHaveBeenCalled();
  });

  it("emits a HUNG JOB WARNING (without throwing) when requestPayment rejects after accept", async () => {
    // Arrange — accept succeeds, payment request blows up
    loadOffering.mockResolvedValue(
      fakeOffering({ validateRequirements: vi.fn(() => true) })
    );
    requestPayment.mockRejectedValueOnce(new Error("network down"));

    // Act — must resolve, not reject
    await expect(handleNewTask(buildJobData())).resolves.toBeUndefined();

    // Assert — accepted, then payment attempted, then the grep-able warning fired
    expect(acceptOrRejectJob).toHaveBeenCalledWith(1001, {
      accept: true,
      reason: "Job accepted",
    });
    expect(requestPayment).toHaveBeenCalledTimes(1);

    const hungWarning = errorSpy.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes("HUNG JOB WARNING")
    );
    expect(hungWarning).toBeDefined();
    expect(String(hungWarning?.[0])).toContain("1001");
  });
});

// -- TRANSACTION phase ------------------------------------------------------

describe("handleNewTask — TRANSACTION phase", () => {
  it("delivers the executeJob result via deliverJob", async () => {
    // Arrange
    const result: ExecuteJobResult = {
      deliverable: { type: "audio_url", value: "https://cdn/track.mp3" },
      payableDetail: { amount: 1, tokenAddress: "0xtoken" },
    };
    const executeJob = vi.fn(async () => result);
    loadOffering.mockResolvedValue(fakeOffering({ executeJob }));

    // Act
    await handleNewTask(buildJobData({ phase: AcpJobPhase.TRANSACTION }));

    // Assert — executeJob ran with resolved requirement; delivery carried both fields
    expect(executeJob).toHaveBeenCalledWith(REQUIREMENT);
    expect(deliverJob).toHaveBeenCalledTimes(1);
    expect(deliverJob).toHaveBeenCalledWith(1001, {
      deliverable: result.deliverable,
      payableDetail: result.payableDetail,
    });
    // No accept/reject or payment work in TRANSACTION phase.
    expect(acceptOrRejectJob).not.toHaveBeenCalled();
    expect(requestPayment).not.toHaveBeenCalled();
    expect(deliverJobFailure).not.toHaveBeenCalled();
  });

  it("calls deliverJobFailure with the error message (not raw upstream body) when executeJob rejects, without rethrowing", async () => {
    // Arrange — executeJob throws an Error whose message is a clean summary.
    const rawUpstreamBody = '{"secret":"leak-me","status":502}';
    const executeJob = vi.fn(async () => {
      throw new Error("Upstream generation failed");
    });
    loadOffering.mockResolvedValue(fakeOffering({ executeJob }));

    // Act — must not rethrow
    await expect(
      handleNewTask(buildJobData({ phase: AcpJobPhase.TRANSACTION }))
    ).resolves.toBeUndefined();

    // Assert — failure delivered, deliverJob (success path) skipped
    expect(deliverJob).not.toHaveBeenCalled();
    expect(deliverJobFailure).toHaveBeenCalledTimes(1);

    const [jobId, reason] = deliverJobFailure.mock.calls[0] as unknown as [
      number,
      string,
    ];
    expect(jobId).toBe(1001);
    expect(reason).toBe("Upstream generation failed");
    // The reason forwarded to ACP must not smuggle a raw upstream body.
    expect(reason).not.toContain(rawUpstreamBody);
    expect(reason).not.toContain("secret");
  });

  it("does nothing when no offering can be resolved in TRANSACTION phase", async () => {
    // Arrange — memo content has no parseable name → resolveOfferingName undefined
    const data = buildJobData(
      { phase: AcpJobPhase.TRANSACTION },
      "not-json"
    );

    // Act
    await handleNewTask(data);

    // Assert — short-circuits before touching the offering loader / delivery
    expect(loadOffering).not.toHaveBeenCalled();
    expect(deliverJob).not.toHaveBeenCalled();
    expect(deliverJobFailure).not.toHaveBeenCalled();
  });
});
