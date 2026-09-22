import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import {
  assembleReady,
  listBlockers,
  markReelFailed,
  markReelReady,
  markReelRendering,
  projectLogline,
} from "./actions";
import { StudioError } from "./errors";
import { projectDir, pythonExecutable, rendererScript, resolveInside } from "./paths";
import { saveProject } from "./store";
import { sceneShots, type Shot } from "./shots";
import type { CastMember, Project, Scene, VideoPart } from "./types";
import { round1 } from "./text";

export async function renderReel(project: Project, partId: string): Promise<Project> {
  const blockers = listBlockers(project);
  if (blockers.length) throw new StudioError(blockers[0]);
  const part = project.parts.find((item) => item.id === partId);
  if (!part) throw new StudioError("That reel is not in this picture.", 404);
  if (!project.script) throw new StudioError("The script is missing.");

  const scenes = part.sceneIds
    .map((id) => project.script!.scenes.find((scene) => scene.id === id))
    .filter((scene): scene is Scene => Boolean(scene))
    .sort((a, b) => a.number - b.number);
  if (!scenes.length) throw new StudioError("This reel has no scenes.");

  const version = part.videoFile ? part.version + 1 : Math.max(1, part.version);
  const relative = path.join("reels", `${part.id}-v${version}.mp4`);
  const output = resolveInside(project.id, relative);
  fs.mkdirSync(path.dirname(output), { recursive: true });

  let current = saveProject(markReelRendering(project, partId));
  const shots = shotsForReel(current, part, scenes);
  const work = path.join(projectDir(project.id), "work", part.id);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const specPath = path.join(work, "reel.json");
  fs.writeFileSync(specPath, JSON.stringify({ title: project.title, out: output, shots }, null, 2));

  try {
    await runPython(rendererScript("render_part.py"), specPath);
    const duration = await probeDuration(output);
    current = saveProject(markReelReady(readFresh(current), partId, relative, duration));
    return current;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The reel failed.";
    saveProject(markReelFailed(readFresh(current), partId, message.slice(0, 500)));
    throw new StudioError(message.slice(0, 500), 500);
  }
}

export async function assemblePicture(project: Project): Promise<Project> {
  if (!assembleReady(project)) {
    throw new StudioError("Every reel has to be approved, with signed consent on file, before the picture can be merged.");
  }
  if (!project.script) throw new StudioError("The script is missing.");
  const files = project.parts.map((part) => {
    if (!part.videoFile) throw new StudioError(`Reel ${part.index} has no picture.`);
    const absolute = resolveInside(project.id, part.videoFile);
    if (!fs.existsSync(absolute)) throw new StudioError(`Reel ${part.index} is missing its file.`);
    return absolute;
  });
  const cast = project.script.scenes
    .flatMap((scene) => scene.dialogue.map((line) => line.character))
    .filter((name, index, all) => all.indexOf(name) === index)
    .map((name) => {
      const member = project.cast.find((item) => item.characterName === name);
      if (!member) throw new StudioError(`Missing consent for ${name}.`);
      return {
        character: name,
        actor: member.actorLegalName,
        consent: member.consentSha256,
      };
    });

  const output = resolveInside(project.id, path.join("final", "movie.mp4"));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const work = path.join(projectDir(project.id), "work", "assemble");
  fs.mkdirSync(work, { recursive: true });
  const specPath = path.join(work, "assemble.json");
  fs.writeFileSync(specPath, JSON.stringify({
    title: project.title,
    logline: projectLogline(project),
    out: output,
    parts: files,
    cast,
  }, null, 2));
  await runPython(rendererScript("assemble.py"), specPath);
  const duration = await probeDuration(output);
  const stat = fs.statSync(output);
  const finished: Project = {
    ...readFresh(project),
    finalMovie: {
      file: path.join("final", "movie.mp4"),
      durationSec: round1(duration),
      createdAt: new Date().toISOString(),
      sizeBytes: stat.size,
      consentLedger: cast.map((entry) => {
        const member = project.cast.find((item) => item.characterName === entry.character) as CastMember;
        return {
          characterName: entry.character,
          actorLegalName: member.actorLegalName,
          consentSha256: member.consentSha256,
          consentDate: member.consentDate,
          consentOriginalName: member.consentOriginalName,
        };
      }),
    },
    updatedAt: new Date().toISOString(),
  };
  return saveProject(finished);
}

function shotsForReel(project: Project, part: VideoPart, scenes: Scene[]): Shot[] {
  const first = scenes[0]?.number ?? part.index;
  const last = scenes[scenes.length - 1]?.number ?? first;
  const shots: Shot[] = [
    {
      type: "slate",
      duration: 3.2,
      heading: `REEL ${part.index} OF ${project.parts.length}`,
      sub: `${project.title}   ·   scenes ${first}–${last}`,
    },
  ];
  if (part.notes?.trim()) {
    shots.push({
      type: "note",
      duration: 5,
      heading: "NOTE ON THIS REEL",
      text: part.notes.trim(),
    });
  }
  for (const scene of scenes) {
    for (const shot of sceneShots(scene)) {
      if (shot.type === "dialogue" && shot.character) {
        const member = memberFor(project, shot.character);
        shot.actor = member.actorLegalName;
        shot.photo = resolveInside(project.id, member.photoFile);
      }
      if (shot.characters?.length) {
        shot.characters = shot.characters.map((person) => {
          const member = project.cast.find((item) => item.characterName === person.name);
          return {
            name: person.name,
            actor: member?.actorLegalName || "",
            photo: member?.photoFile ? resolveInside(project.id, member.photoFile) : null,
          };
        });
      }
      shots.push(shot);
    }
  }
  return shots;
}

function memberFor(project: Project, character: string): CastMember {
  const member = project.cast.find((item) => item.characterName === character);
  if (!member?.photoFile || !member.attested || !member.consentFile) {
    throw new StudioError(`Refusing to photograph ${character} without a consented portrait.`);
  }
  return member;
}

function readFresh(project: Project): Project {
  const file = path.join(projectDir(project.id), "project.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as Project;
}

function runPython(script: string, specPath: string): Promise<void> {
  const python = pythonExecutable();
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script, specPath], { cwd: process.cwd() });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Renderer exited with ${code}.`));
    });
  });
}

function probeDuration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      file,
    ]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      const duration = Number(stdout.trim());
      if (code !== 0 || !Number.isFinite(duration)) {
        reject(new Error(stderr.trim() || "Could not read the rendered duration."));
        return;
      }
      resolve(duration);
    });
  });
}
