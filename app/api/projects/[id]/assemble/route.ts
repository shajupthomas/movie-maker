import { present } from "@/lib/actions";
import { StudioError } from "@/lib/errors";
import { fail, json } from "@/lib/http";
import { assemblePicture } from "@/lib/render";
import { readProject } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    if (body.confirmLedger !== true) {
      throw new StudioError("Confirm the consent ledger before merging the picture.");
    }
    const project = await assemblePicture(readProject(id));
    return json(present(project));
  } catch (error) {
    return fail(error);
  }
}
