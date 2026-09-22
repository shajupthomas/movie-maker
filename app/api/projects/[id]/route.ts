import { present } from "@/lib/actions";
import { fail, json } from "@/lib/http";
import { deleteProject, readProject } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    return json(present(readProject(id)));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    deleteProject(id);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
