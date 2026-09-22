import { StudioError } from "../errors";
import { resolveSettings } from "./settings";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

type FetchLike = typeof fetch;

let fetchOverride: FetchLike | null = null;

export function setLlmFetch(fn: FetchLike | null): void {
  fetchOverride = fn;
}

export async function completeChat(
  messages: ChatMessage[],
  options?: { temperature?: number },
): Promise<string> {
  const settings = resolveSettings();
  if (!settings.llmApiKey) {
    throw new StudioError("Connect a language model on the Models page before asking it to write.");
  }
  const fetchImpl = fetchOverride ?? fetch;
  const response = await fetchImpl(`${settings.llmBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.llmApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.llmModel,
      temperature: options?.temperature ?? 0.7,
      messages,
    }),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Language model returned ${response.status}. ${clip(raw)}`);
  }
  let data: { choices?: Array<{ message?: { content?: unknown } }> };
  try {
    data = JSON.parse(raw) as { choices?: Array<{ message?: { content?: unknown } }> };
  } catch {
    throw new Error("The language model returned an unreadable draft.");
  }
  const text = messageText(data.choices?.[0]?.message?.content);
  if (!text) throw new Error("The language model returned an empty draft.");
  return text;
}

export function messageText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) return String((part as { text: unknown }).text);
      return "";
    })
    .join("")
    .trim();
}

export function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:markdown|md|text|screenplay)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

function clip(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 180);
}
