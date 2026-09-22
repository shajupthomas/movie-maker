import { approveScript, present, reopenScript, reviseScript, saveScript } from "@/lib/actions";
import { StudioError } from "@/lib/errors";
import { fail, json } from "@/lib/http";
import { polishScript } from "@/lib/models/writer";
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
    if (action === "save") next = saveScript(project, String(body.text || ""));
    else if (action === "revise") next = await polishScript(reviseScript(project, String(body.notes || "")));
    else if (action === "approve") next = approveScript(project, String(body.text || ""));
    else if (action === "reopen") next = reopenScript(project);
    else throw new StudioError("Unknown script action.");
    clearRenderedMedia(id);
    return json(present(saveProject(next)));
  } catch (error) {
    return fail(error);
  }
}
