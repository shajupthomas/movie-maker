import fs from "fs";
import path from "path";
import { StudioError } from "./errors";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function projectsRoot(): string {
  return process.env.STUDIO_DATA_DIR || path.join(process.cwd(), "data", "projects");
}

export function assertProjectId(id: string): string {
  if (!ID.test(id)) throw new StudioError("Unknown production.", 404);
  return id;
}

export function projectDir(id: string): string {
  return path.join(projectsRoot(), assertProjectId(id));
}

export function projectFile(id: string): string {
  return path.join(projectDir(id), "project.json");
}

export function resolveInside(id: string, relativePath: string): string {
  const root = path.resolve(projectDir(id));
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new StudioError("That file is outside the production.", 400);
  }
  return resolved;
}

export function pythonExecutable(): string {
  if (process.env.STUDIO_PYTHON && fs.existsSync(process.env.STUDIO_PYTHON)) {
    return process.env.STUDIO_PYTHON;
  }
  const venv = path.join(process.cwd(), ".venv", "bin", "python");
  if (fs.existsSync(venv)) return venv;
  return "python3";
}

export function rendererScript(name: "render_part.py" | "assemble.py"): string {
  return path.join(process.cwd(), "renderer", name);
}
