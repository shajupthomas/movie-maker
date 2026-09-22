import fs from "fs";
import path from "path";
import { StudioError } from "../errors";
import type { PublicSettings } from "./public";

export const DEFAULT_LLM_BASE = "https://api.openai.com/v1";
export const DEFAULT_LLM_MODEL = "gpt-4.1";
export const DEFAULT_IMAGE_MODEL = "fal-ai/flux-pro/v1.1";
export const DEFAULT_ANGLE_MODEL = "fal-ai/flux-pro/kontext";
export const DEFAULT_VIDEO_MODEL = "fal-ai/kling-video/v3/pro/image-to-video";

interface StoredSettings {
  llmApiKey?: string;
  llmBaseUrl?: string;
  llmModel?: string;
  falKey?: string;
}

export interface ResolvedSettings {
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  falKey: string;
  imageModel: string;
  angleModel: string;
  videoModel: string;
}

export function settingsPath(): string {
  if (process.env.STUDIO_SETTINGS_FILE) return process.env.STUDIO_SETTINGS_FILE;
  return path.join(process.cwd(), "data", "studio-settings.json");
}

function readStored(): StoredSettings {
  const file = settingsPath();
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as StoredSettings;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function resolveSettings(): ResolvedSettings {
  const stored = readStored();
  const llmBase = (process.env.STUDIO_LLM_BASE_URL || stored.llmBaseUrl || DEFAULT_LLM_BASE).trim();
  return {
    llmApiKey: (process.env.STUDIO_LLM_API_KEY || stored.llmApiKey || "").trim(),
    llmBaseUrl: llmBase.replace(/\/+$/, ""),
    llmModel: (process.env.STUDIO_LLM_MODEL || stored.llmModel || DEFAULT_LLM_MODEL).trim(),
    falKey: (process.env.FAL_KEY || process.env.STUDIO_FAL_KEY || stored.falKey || "").trim(),
    imageModel: DEFAULT_IMAGE_MODEL,
    angleModel: DEFAULT_ANGLE_MODEL,
    videoModel: DEFAULT_VIDEO_MODEL,
  };
}

export function publicSettings(): PublicSettings {
  const settings = resolveSettings();
  return {
    llmConfigured: Boolean(settings.llmApiKey),
    falConfigured: Boolean(settings.falKey),
    llmFromEnvironment: Boolean(process.env.STUDIO_LLM_API_KEY?.trim()),
    falFromEnvironment: Boolean(process.env.FAL_KEY?.trim() || process.env.STUDIO_FAL_KEY?.trim()),
    llmModel: settings.llmModel,
    llmBaseUrl: settings.llmBaseUrl,
    videoModel: settings.videoModel,
    imageModel: settings.imageModel,
    angleModel: settings.angleModel,
    keyHints: {
      llm: maskKey(settings.llmApiKey),
      fal: maskKey(settings.falKey),
    },
  };
}

export function llmConfigured(): boolean {
  return Boolean(resolveSettings().llmApiKey);
}

export function falConfigured(): boolean {
  return Boolean(resolveSettings().falKey);
}

export function saveSettings(patch: {
  llmApiKey?: string;
  llmBaseUrl?: string;
  llmModel?: string;
  falKey?: string;
  clearLlm?: boolean;
  clearFal?: boolean;
}): PublicSettings {
  const current = readStored();
  const next: StoredSettings = { ...current };
  if (patch.clearLlm) delete next.llmApiKey;
  else if (typeof patch.llmApiKey === "string" && patch.llmApiKey.trim()) next.llmApiKey = patch.llmApiKey.trim();
  if (typeof patch.llmBaseUrl === "string" && patch.llmBaseUrl.trim()) {
    next.llmBaseUrl = assertModelUrl(patch.llmBaseUrl);
  }
  if (typeof patch.llmModel === "string" && patch.llmModel.trim()) next.llmModel = patch.llmModel.trim();
  if (patch.clearFal) delete next.falKey;
  else if (typeof patch.falKey === "string" && patch.falKey.trim()) next.falKey = patch.falKey.trim();
  const file = settingsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, file);
  return publicSettings();
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 4) return "••••";
  return `••••${key.slice(-4)}`;
}

export function assertModelUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new StudioError("The language-model address must be a full URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new StudioError("The language-model address must start with https.");
  }
  return parsed.toString().replace(/\/+$/, "");
}
