import { StudioError } from "@/lib/errors";
import { fail, json } from "@/lib/http";
import { checkLanguageModel, checkPictureModel } from "@/lib/models/check";
import { publicSettings, saveSettings } from "@/lib/models/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return json(publicSettings());
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    return json(saveSettings({
      llmApiKey: typeof body.llmApiKey === "string" ? body.llmApiKey : undefined,
      llmBaseUrl: typeof body.llmBaseUrl === "string" ? body.llmBaseUrl : undefined,
      llmModel: typeof body.llmModel === "string" ? body.llmModel : undefined,
      falKey: typeof body.falKey === "string" ? body.falKey : undefined,
      clearLlm: Boolean(body.clearLlm),
      clearFal: Boolean(body.clearFal),
    }));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const target = String(body.target || "");
    if (target === "llm") return json(await checkLanguageModel());
    if (target === "fal") return json(await checkPictureModel());
    throw new StudioError("Choose a model to check.");
  } catch (error) {
    return fail(error);
  }
}
