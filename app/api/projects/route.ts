import { createProduction, present } from "@/lib/actions";
import { fail, json } from "@/lib/http";
import { polishStory } from "@/lib/models/writer";
import { assertBriefAllowed } from "@/lib/safety";
import { listProjects, saveProject } from "@/lib/store";
import type { CreateProjectInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const projects = listProjects().map((project) => ({
    id: project.id,
    title: project.title,
    genre: project.genre,
    tone: project.tone,
    targetMinutes: project.targetMinutes,
    updatedAt: project.updatedAt,
    stage: present(project).steps.find((step) => step.phase === "current")?.label ?? "Story",
  }));
  return json({ projects });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateProjectInput;
    assertBriefAllowed(body.brief || "");
    const drafted = await polishStory(createProduction(body));
    return json(present(saveProject(drafted)), 201);
  } catch (error) {
    return fail(error);
  }
}
