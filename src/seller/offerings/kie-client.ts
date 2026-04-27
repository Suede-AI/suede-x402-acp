/// <reference lib="dom" />
/**
 * Shared Kie API client for Kling 3.0 video generation.
 * Ported from VirtualsAgent Python implementation.
 */
import "dotenv/config";

const KIE_API_KEY = process.env.KIE_API_KEY ?? "";
const KIE_API_BASE = (process.env.KIE_API_BASE_URL ?? "https://api.kie.ai").replace(/\/+$/, "");
const KIE_MODEL = process.env.KIE_MODEL ?? "kling-3.0/video";
const KIE_UPLOAD_BASE = "https://kieai.redpandaai.co";

interface KieCreateOptions {
    prompt: string;
    duration?: number;       // seconds (5, 8, 10)
    aspectRatio?: string;    // "16:9" | "9:16" | "1:1"
    mode?: string;           // "std" | "pro"
    sound?: boolean;
    imageUrls?: string[];
    negativePrompt?: string;
}

function headers(idempotencyKey?: string): Record<string, string> {
    if (!KIE_API_KEY) throw new Error("KIE_API_KEY not configured");
    const h: Record<string, string> = {
        Authorization: `Bearer ${KIE_API_KEY}`,
        "Content-Type": "application/json",
    };
    if (idempotencyKey) h["Idempotency-Key"] = idempotencyKey;
    return h;
}

/** Create a Kling video generation task. Returns the taskId. */
export async function createTask(opts: KieCreateOptions): Promise<string> {
    const payload = {
        model: KIE_MODEL,
        input: {
            prompt: opts.prompt,
            duration: String(opts.duration ?? 8),
            aspect_ratio: opts.aspectRatio ?? "16:9",
            mode: opts.mode ?? "pro",
            sound: opts.sound ?? false,
            multi_shots: false,
            image_urls: opts.imageUrls ?? [],
            ...(opts.negativePrompt ? { negative_prompt: opts.negativePrompt } : {}),
        },
    };

    const resp = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(payload),
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Kling create failed (${resp.status}): ${text}`);
    }

    const data = await resp.json();
    if (data.code !== undefined && data.code !== 200) {
        throw new Error(`Kling create failed: ${data.message ?? data.msg ?? JSON.stringify(data)}`);
    }

    const taskId = data?.data?.taskId ?? data?.data?.task_id ?? data?.taskId ?? "";
    if (!taskId) throw new Error(`Kling did not return a taskId: ${JSON.stringify(data)}`);
    return String(taskId);
}

/**
 * Extract video URL from Kie status response.
 * Per docs, resultJson is a stringified JSON: {"resultUrls": ["https://..."]}
 */
function extractVideoUrl(statusData: Record<string, any>): string | null {
    let resultJson = statusData.resultJson;
    if (typeof resultJson === "string") {
        try { resultJson = JSON.parse(resultJson); } catch (_) { return null; }
    }
    if (!resultJson || typeof resultJson !== "object") return null;

    // Primary key per docs
    if (Array.isArray(resultJson.resultUrls) && resultJson.resultUrls.length > 0) {
        return String(resultJson.resultUrls[0]).trim();
    }
    // Fallbacks
    for (const key of ["result_urls", "videos"]) {
        const arr = resultJson[key];
        if (Array.isArray(arr) && arr.length > 0) return String(arr[0]).trim();
    }
    const direct = resultJson.videoUrl ?? resultJson.url;
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    return null;
}

/** Poll a Kie task until completion. Returns the video URL. */
export async function pollTask(
    taskId: string,
    { maxAttempts = 180, intervalMs = 5_000 } = {},
): Promise<string> {
    for (let i = 0; i < maxAttempts; i++) {
        const resp = await fetch(
            `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
            { headers: headers() },
        );

        if (resp.ok) {
            const data = await resp.json();
            if (data.code !== undefined && data.code !== 200) {
                throw new Error(`Kling poll error: ${data.message ?? data.msg ?? JSON.stringify(data)}`);
            }

            const statusData = (typeof data.data === "object" && data.data) ? data.data : {};
            const state = (statusData.state ?? "").toLowerCase();

            if (state === "fail") {
                throw new Error(`Kling task failed: ${statusData.failMsg ?? statusData.failCode ?? "unknown error"}`);
            }

            if (state === "success") {
                const url = extractVideoUrl(statusData);
                if (url) return url;
                throw new Error(`Kling task succeeded but no video URL found in resultJson`);
            }

            // states: waiting, queuing, generating — keep polling
        }

        await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error(`Kling task ${taskId} timed out after ${maxAttempts} attempts`);
}

/**
 * Upload a file to Kie's storage via URL.
 * Returns the hosted fileUrl on Kie's CDN.
 */
export async function uploadFileByUrl(fileUrl: string): Promise<string> {
    if (!KIE_API_KEY) throw new Error("KIE_API_KEY not configured");

    const resp = await fetch(`${KIE_UPLOAD_BASE}/api/file-url-upload`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${KIE_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            fileUrl,
            uploadPath: "acp-uploads",
        }),
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Kie file upload failed (${resp.status}): ${text}`);
    }

    const data = await resp.json();
    if (!data.success && data.code !== 200) {
        throw new Error(`Kie file upload failed: ${data.msg ?? JSON.stringify(data)}`);
    }

    // The actual API returns downloadUrl (not fileUrl as shown in some doc examples)
    const hostedUrl = data?.data?.downloadUrl ?? data?.data?.fileUrl;
    if (!hostedUrl) throw new Error(`Kie upload did not return a URL: ${JSON.stringify(data)}`);
    return hostedUrl;
}

/**
 * Upload multiple image URLs to Kie's storage in parallel.
 * Returns array of hosted URLs.
 */
async function primeImages(imageUrls: string[]): Promise<string[]> {
    if (!imageUrls.length) return [];
    const results = await Promise.all(
        imageUrls.map(async (url) => {
            try {
                return await uploadFileByUrl(url);
            } catch (err) {
                console.warn(`[kie-client] Failed to upload image, using original URL: ${err}`);
                return url; // fallback to original URL
            }
        }),
    );
    return results;
}

/** Convenience: prime images + create task + poll until done, return video URL. */
export async function generateVideo(opts: KieCreateOptions): Promise<string> {
    // Upload images to Kie's storage for reliable access
    const primedUrls = await primeImages(opts.imageUrls ?? []);
    const taskId = await createTask({ ...opts, imageUrls: primedUrls });
    return pollTask(taskId);
}
