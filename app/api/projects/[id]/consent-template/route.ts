import { consentTemplate } from "@/lib/consent";
import { fail } from "@/lib/http";
import { readProject } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const project = readProject(id);
    const character = new URL(request.url).searchParams.get("character") || undefined;
    const body = consentTemplate(project, character);
    const filename = `${project.title.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "consent"}-consent.txt`;
    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return fail(error);
  }
}
