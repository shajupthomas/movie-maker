import { resolveSettings } from "./settings";

export async function checkLanguageModel(): Promise<{ ok: boolean; detail: string }> {
  const settings = resolveSettings();
  if (!settings.llmApiKey) return { ok: false, detail: "No language-model key is saved." };
  try {
    const response = await fetch(`${settings.llmBaseUrl}/models`, {
      headers: { Authorization: `Bearer ${settings.llmApiKey}` },
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, detail: "The language model refused the key." };
    }
    if (!response.ok) {
      return {
        ok: false,
        detail: `The language model answered ${response.status}. A story rewrite will confirm the connection.`,
      };
    }
    return { ok: true, detail: `Connected. Drafts use ${settings.llmModel}.` };
  } catch {
    return { ok: false, detail: "The language model could not be reached." };
  }
}

export async function checkPictureModel(): Promise<{ ok: boolean; detail: string }> {
  const settings = resolveSettings();
  if (!settings.falKey) return { ok: false, detail: "No picture-model key is saved." };
  try {
    const response = await fetch("https://queue.fal.run/fal-ai/flux-pro/v1.1/requests/studio-key-check/status", {
      headers: { Authorization: `Key ${settings.falKey}` },
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, detail: "The picture model refused the key." };
    }
    return {
      ok: true,
      detail: `Connected. Faces use ${settings.imageModel}, matching angles use ${settings.angleModel}, and scenes use ${settings.videoModel}.`,
    };
  } catch {
    return { ok: false, detail: "The picture model could not be reached." };
  }
}
