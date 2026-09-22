import { invalidateReels, present } from "@/lib/actions";
import { fail, json } from "@/lib/http";
import { createGeneratedMember, matchAngles } from "@/lib/models/characters";
import { clearRenderedMedia, readProject, saveProject } from "@/lib/store";
import { cueName } from "@/lib/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const project = readProject(id);
    const body = await request.json();
    const characterName = cueName(String(body.characterName || ""));
    const action = String(body.action || "face");
    const member = action === "angles"
      ? await matchAngles(project, characterName)
      : await createGeneratedMember(project, characterName, String(body.guidance || ""));
    const cast = project.cast.some((item) => item.characterName === characterName)
      ? project.cast.map((item) => item.characterName === characterName ? member : item)
      : [...project.cast, member];
    clearRenderedMedia(id);
    return json(present(saveProject(invalidateReels({ ...project, cast }))));
  } catch (error) {
    return fail(error);
  }
}
