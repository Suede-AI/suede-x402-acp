/// <reference lib="dom" />
/**
 * Shared server-side video generation client.
 *
 * Provider-specific URLs and model IDs are intentionally supplied through
 * private environment variables so public discovery metadata does not disclose
 * the upstream provider.
 */
import "dotenv/config";

const VIDEO_API_KEY = process.env.VIDEO_API_KEY ?? "";
const VIDEO_API_BASE = (process.env.VIDEO_API_BASE_URL ?? "").replace(/\/+$/, "");
const VIDEO_MODEL = process.env.VIDEO_MODEL ?? "";
const VIDEO_UPLOAD_BASE = (process.env.VIDEO_UPLOAD_BASE_URL ?? "").replace(/\/+$/, "");

interface VideoCreateOptions {
    prompt: string;
    duration?: number;       // seconds (5, 8, 10)
    aspectRatio?: string;    // "16:9" | "9:16" | "1:1"
    mode?: string;           // "std" | "pro"
    sound?: boolean;
    imageUrls?: string[];
    negativePrompt?: string;
}

function requireEnv(value: string, name: string): string {
    if (!value) throw new Error(`${name} not configured`);
    return value;
}

function headers(idempotencyKey?: string): Record<string, string> {
    const h: Record<string, string> = {
        Authorization: `Bearer ${requireEnv(VIDEO_API_KEY, "VIDEO_API_KEY")}`,
        "Content-Type": "application/json",
    };
    if (idempotencyKey) h["Idempotency-Key"] = idempotencyKey;
    return h;
}

/** Create a video generation task. Returns the taskId. */
export async function createTask(opts: VideoCreateOptions): Promise<string> {
    const requestHeaders = headers();
    const apiBase = requireEnv(VIDEO_API_BASE, "VIDEO_API_BASE_URL");
    const model = requireEnv(VIDEO_MODEL, "VIDEO_MODEL");
    const payload = {
        model,
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

    const resp = await fetch(`${apiBase}/api/v1/jobs/createTask`, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(payload),
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Video create failed (${resp.status}): ${text}`);
    }

    const data = await resp.json();
    if (data.code !== undefined && data.code !== 200) {
        throw new Error(`Video create failed: ${data.message ?? data.msg ?? JSON.stringify(data)}`);
    }

    const taskId = data?.data?.taskId ?? data?.data?.task_id ?? data?.taskId ?? "";
    if (!taskId) throw new Error(`Video provider did not return a taskId: ${JSON.stringify(data)}`);
    return String(taskId);
}

function extractVideoUrl(statusData: Record<string, any>): string | null {
    let resultJson = statusData.resultJson;
    if (typeof resultJson === "string") {
        try { resultJson = JSON.parse(resultJson); } catch (_) { return null; }
    }
    if (!resultJson || typeof resultJson !== "object") return null;

    if (Array.isArray(resultJson.resultUrls) && resultJson.resultUrls.length > 0) {
        return String(resultJson.resultUrls[0]).trim();
    }
    for (const key of ["result_urls", "videos"]) {
        const arr = resultJson[key];
        if (Array.isArray(arr) && arr.length > 0) return String(arr[0]).trim();
    }
    const direct = resultJson.videoUrl ?? resultJson.url;
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    return null;
}

/** Poll a task until completion. Returns the video URL. */
export async function pollTask(
    taskId: string,
    { maxAttempts = 180, intervalMs = 5_000 } = {},
): Promise<string> {
    const requestHeaders = headers();
    const apiBase = requireEnv(VIDEO_API_BASE, "VIDEO_API_BASE_URL");
    for (let i = 0; i < maxAttempts; i++) {
        const resp = await fetch(
            `${apiBase}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
            { headers: requestHeaders },
        );

        if (resp.ok) {
            const data = await resp.json();
            if (data.code !== undefined && data.code !== 200) {
                throw new Error(`Video poll error: ${data.message ?? data.msg ?? JSON.stringify(data)}`);
            }

            const statusData = (typeof data.data === "object" && data.data) ? data.data : {};
            const state = (statusData.state ?? "").toLowerCase();

            if (state === "fail") {
                throw new Error(`Video task failed: ${statusData.failMsg ?? statusData.failCode ?? "unknown error"}`);
            }

            if (state === "success") {
                const url = extractVideoUrl(statusData);
                if (url) return url;
                throw new Error("Video task succeeded but no video URL was returned");
            }
        }

        await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error(`Video task ${taskId} timed out after ${maxAttempts} attempts`);
}

export async function uploadFileByUrl(fileUrl: string): Promise<string> {
    const requestHeaders = headers();
    const uploadBase = requireEnv(VIDEO_UPLOAD_BASE, "VIDEO_UPLOAD_BASE_URL");
    const resp = await fetch(`${uploadBase}/api/file-url-upload`, {
        method: "POST",
        headers: {
            Authorization: requestHeaders.Authorization,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            fileUrl,
            uploadPath: "acp-uploads",
        }),
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Video file upload failed (${resp.status}): ${text}`);
    }

    const data = await resp.json();
    if (!data.success && data.code !== 200) {
        throw new Error(`Video file upload failed: ${data.msg ?? JSON.stringify(data)}`);
    }

    const hostedUrl = data?.data?.downloadUrl ?? data?.data?.fileUrl;
    if (!hostedUrl) throw new Error(`Video upload did not return a URL: ${JSON.stringify(data)}`);
    return hostedUrl;
}

async function primeImages(imageUrls: string[]): Promise<string[]> {
    if (!imageUrls.length) return [];
    const results = await Promise.all(
        imageUrls.map(async (url) => {
            try {
                return await uploadFileByUrl(url);
            } catch (err) {
                console.warn(`[video-client] Failed to upload image, using original URL: ${err}`);
                return url;
            }
        }),
    );
    return results;
}

export async function generateVideo(opts: VideoCreateOptions): Promise<string> {
    const primedUrls = await primeImages(opts.imageUrls ?? []);
    const taskId = await createTask({ ...opts, imageUrls: primedUrls });
    return pollTask(taskId);
}

/**
 * Throws if any env var the video client needs at job-time is missing.
 * Called by the seller runtime at startup to refuse to register video
 * offerings before they can accept payment they can't fulfil. Mirrors the
 * `requireEnv` checks inside createTask/pollTask/uploadFileByUrl but runs
 * once at boot instead of per-job.
 */
export function assertReady(): void {
    requireEnv(VIDEO_API_KEY, "VIDEO_API_KEY");
    requireEnv(VIDEO_API_BASE, "VIDEO_API_BASE_URL");
    requireEnv(VIDEO_MODEL, "VIDEO_MODEL");
    requireEnv(VIDEO_UPLOAD_BASE, "VIDEO_UPLOAD_BASE_URL");
}
