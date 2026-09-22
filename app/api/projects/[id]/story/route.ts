import { approveStory, present, reopenStory, reviseStory, saveStory, updateBrief } from "@/lib/actions";
import { StudioError } from "@/lib/errors";
import { fail, json } from "@/lib/http";
import { polishScript, polishStory } from "@/lib/models/writer";
import { assertBriefAllowed } from "@/lib/safety";
import { clearRenderedMedia, readProject, saveProject } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const project = readProject(id);
    const action = String(body.action || "");
    let next = project;
    if (action === "save") next = saveStory(project, String(body.text || ""));
    else if (action === "revise") next = await polishStory(reviseStory(project, String(body.notes || "")));
    else if (action === "approve") next = await polishScript(approveStory(project, String(body.text || "")));
    else if (action === "reopen") next = reopenStory(project);
    else if (action === "rebrief") {
      assertBriefAllowed(String(body.brief || ""));
      next = await polishStory(updateBrief(project, String(body.brief || "")));
    } else throw new StudioError("Unknown story action.");
    if (action !== "save") clearRenderedMedia(id);
    return json(present(saveProject(next)));
  } catch (error) {
    return fail(error);
  }
}
