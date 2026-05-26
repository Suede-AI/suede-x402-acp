// =============================================================================
// Seller API calls — accept/reject, request payment, deliver.
// =============================================================================

import client from "../../lib/client.js";

// -- Accept / Reject --

export interface AcceptOrRejectParams {
  accept: boolean;
  reason?: string;
}

export async function acceptOrRejectJob(
  jobId: number,
  params: AcceptOrRejectParams
): Promise<void> {
  console.log(
    `[sellerApi] acceptOrRejectJob  jobId=${jobId}  accept=${
      params.accept
    }  reason=${params.reason ?? "(none)"}`
  );

  await client.post(`/acp/providers/jobs/${jobId}/accept`, params);
}

// -- Payment request --

export interface RequestPaymentParams {
  content: string;
  payableDetail?: {
    amount: number;
    tokenAddress: string;
    recipient: string;
  };
}

export async function requestPayment(
  jobId: number,
  params: RequestPaymentParams
): Promise<void> {
  await client.post(`/acp/providers/jobs/${jobId}/requirement`, params);
}

// -- Deliver --

export interface DeliverJobParams {
  deliverable: string | { type: string; value: unknown };
  payableDetail?: {
    amount: number;
    tokenAddress: string;
  };
}

export async function deliverJob(
  jobId: number,
  params: DeliverJobParams
): Promise<void> {
  const delivStr =
    typeof params.deliverable === "string"
      ? params.deliverable
      : JSON.stringify(params.deliverable);
  const transferStr = params.payableDetail
    ? `  transfer: ${params.payableDetail.amount} @ ${params.payableDetail.tokenAddress}`
    : "";
  console.log(
    `[sellerApi] deliverJob  jobId=${jobId}  deliverable=${delivStr}${transferStr}`
  );

  return await client.post(`/acp/providers/jobs/${jobId}/deliverable`, params);
}

// -- Failure delivery --
//
// When executeJob throws after the buyer has already paid, the seller must
// still close the loop with ACP. ACP has no dedicated "fail" endpoint for
// the TRANSACTION phase — instead we deliver a structured error payload
// through the standard /deliverable route so the buyer's evaluator can
// detect the failure in EVALUATION and refund per ACP convention. Without
// this call, the job hangs in TRANSACTION until EXPIRED and the buyer has
// no signal that the seller couldn't fulfil.

export async function deliverJobFailure(
  jobId: number,
  reason: string
): Promise<void> {
  console.error(
    `[sellerApi] deliverJobFailure  jobId=${jobId}  reason=${reason}`
  );
  const errorDeliverable = JSON.stringify({
    type: "error",
    error: {
      message: reason,
      sellerNote:
        "The seller accepted this job and received payment but could not " +
        "fulfil it. Reject this deliverable in EVALUATION to trigger refund.",
    },
  });
  return await client.post(`/acp/providers/jobs/${jobId}/deliverable`, {
    deliverable: errorDeliverable,
  });
}
