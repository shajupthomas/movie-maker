import { StudioError } from "../errors";
import { resolveSettings } from "./settings";

export interface FalDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  timeoutMs: number;
  key: string;
}

const INITIATE = "https://rest.alpha.fal.ai/storage/upload/initiate";

export async function uploadBytes(
  bytes: Buffer,
  contentType: string,
  fileName: string,
  deps?: Partial<FalDeps>,
): Promise<string> {
  const key = deps?.key ?? requireKey();
  const fetchImpl = deps?.fetch ?? fetch;
  const initiated = await fetchImpl(INITIATE, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content_type: contentType, file_name: fileName }),
  });
  const raw = await initiated.text();
  if (!initiated.ok) throw new Error(clip(`Could not start the picture upload (${initiated.status}). ${raw}`));
  const body = parseJson(raw) as { upload_url?: string; file_url?: string };
  if (!body.upload_url || !body.file_url) throw new Error("The picture host did not return an upload address.");
  const put = await fetchImpl(body.upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(bytes),
  });
  if (!put.ok) throw new Error(`The picture upload failed (${put.status}).`);
  return body.file_url;
}

export async function runQueued(
  model: string,
  input: Record<string, unknown>,
  deps?: Partial<FalDeps>,
): Promise<unknown> {
  const key = deps?.key ?? requireKey();
  const fetchImpl = deps?.fetch ?? fetch;
  const sleep = deps?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = deps?.now ?? Date.now;
  const timeoutMs = deps?.timeoutMs ?? 480_000;
  const started = now();
  const submit = await fetchImpl(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const submittedText = await submit.text();
  if (!submit.ok) throw new Error(clip(`The picture model returned ${submit.status}. ${submittedText}`));
  const submitted = parseJson(submittedText) as Record<string, unknown>;
  if (hasMedia(submitted)) return submitted;
  const statusUrl = stringField(submitted.status_url);
  const responseUrl = stringField(submitted.response_url);
  if (!statusUrl || !responseUrl) throw new Error("The picture model did not return a queue address.");

  let completed = false;
  while (now() - started < timeoutMs) {
    const statusResponse = await fetchImpl(statusUrl, { headers: { Authorization: `Key ${key}` } });
    const statusText = await statusResponse.text();
    if (!statusResponse.ok) {
      throw new Error(clip(`The picture model status returned ${statusResponse.status}. ${statusText}`));
    }
    const status = parseJson(statusText) as { status?: string; error?: string };
    if (status.status === "COMPLETED") {
      completed = true;
      break;
    }
    if (status.status === "FAILED") throw new Error(clip(status.error || "The picture model failed this request."));
    await sleep(2000);
  }
  if (!completed) throw new Error("The picture model took too long.");

  const resultResponse = await fetchImpl(responseUrl, { headers: { Authorization: `Key ${key}` } });
  const resultText = await resultResponse.text();
  if (!resultResponse.ok) throw new Error(clip(`The picture model result returned ${resultResponse.status}. ${resultText}`));
  return parseJson(resultText);
}

export async function downloadBytes(url: string, fetchImpl: typeof fetch = fetch): Promise<Buffer> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Could not download the picture (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

export function mediaUrl(payload: unknown, kind: "image" | "video"): string {
  const data = (payload ?? {}) as {
    images?: Array<{ url?: string }>;
    image?: { url?: string };
    video?: { url?: string };
    data?: { video?: { url?: string } };
  };
  const url = kind === "video"
    ? data.video?.url || data.data?.video?.url
    : data.images?.[0]?.url || data.image?.url;
  if (!url) {
    throw new Error(kind === "video" ? "The picture model did not return a clip." : "The picture model did not return an image.");
  }
  return url;
}

function requireKey(): string {
  const key = resolveSettings().falKey;
  if (!key) throw new StudioError("Connect the picture model on the Models page.");
  return key;
}

function hasMedia(payload: Record<string, unknown>): boolean {
  return Boolean(payload.images || payload.video || payload.image);
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error("The picture model returned an unreadable response.");
  }
}

function clip(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}
