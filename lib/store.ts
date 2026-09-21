import fs from "fs";
import path from "path";
import { StudioError } from "./errors";
import { projectDir, projectFile, projectsRoot } from "./paths";
import type { Project } from "./types";

export function listProjects(): Project[] {
  const root = projectsRoot();
  if (!fs.existsSync(root)) return [];
  const projects: Project[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      projects.push(readProject(entry.name));
    } catch {
      continue;
    }
  }
  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return projects;
}

export function readProject(id: string): Project {
  const file = projectFile(id);
  if (!fs.existsSync(file)) throw new StudioError("That production does not exist.", 404);
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Project;
  return {
    ...raw,
    adultCastAttested: Boolean(raw.adultCastAttested),
    cast: raw.cast ?? [],
    parts: raw.parts ?? [],
    finalMovie: raw.finalMovie ?? null,
  };
}

export function saveProject(project: Project): Project {
  const file = projectFile(project.id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(project, null, 2));
  fs.renameSync(tmp, file);
  return project;
}

export function deleteProject(id: string): void {
  const dir = projectDir(id);
  if (!fs.existsSync(dir)) throw new StudioError("That production does not exist.", 404);
  fs.rmSync(dir, { recursive: true, force: true });
}

export function clearRenderedMedia(id: string): void {
  for (const folder of ["reels", "final", "work"]) {
    fs.rmSync(path.join(projectDir(id), folder), { recursive: true, force: true });
  }
}
