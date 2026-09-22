import { approveReel, present, requestReelChanges } from "@/lib/actions";
import { StudioError } from "@/lib/errors";
import { fail, json } from "@/lib/http";
import { renderReel } from "@/lib/render";
import { readProject, saveProject } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const action = String(body.action || "");
    const partId = String(body.partId || "");
    if (!partId) throw new StudioError("Choose a reel.");
    if (action === "render") {
      const project = await renderReel(readProject(id), partId);
      return json(present(project));
    }
    const project = readProject(id);
    const next = action === "approve"
      ? approveReel(project, partId)
      : action === "changes"
        ? requestReelChanges(project, partId, String(body.notes || ""))
        : null;
    if (!next) throw new StudioError("Unknown reel action.");
    return json(present(saveProject(next)));
  } catch (error) {
    return fail(error);
  }
}
