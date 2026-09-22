import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { StudioError } from "../errors";
import { FACE_VIEWS } from "../faces";
import { projectDir, resolveInside } from "../paths";
import type { CastMember, Project, Scene } from "../types";
import { downloadBytes, mediaUrl, runQueued, uploadBytes } from "./fal";
import { resolveSettings } from "./settings";

export const SCENE_CLIP_SECONDS = "15";

const SCALE = "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1";
const NEGATIVE = "blur, distort, low quality, extra limbs, different person, changing face, subtitles, captions, watermark, text";

export function klingDuration(seconds: number): string {
  const allowed = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const target = Math.max(5, Math.round(seconds));
  if (target >= 10) return "15";
  return String(allowed.find((value) => value >= target) ?? 5);
}

export function speechForModel(line: string): string {
  return line.replace(/[A-Za-z][A-Za-z'’]*/g, (word, offset) => {
    const before = line.slice(0, offset);
    const midSentence = offset > 0 && !/[.!?]\s+$/.test(before);
    if (midSentence && /[A-Z]/.test(word[0])) return word.toUpperCase();
    return word.toLowerCase();
  });
}

export function sceneMotionPrompt(scene: Scene): string {
  const names = speakersOf(scene);
  const spoken = scene.dialogue.slice(0, 4).map((line) => {
    const index = names.indexOf(line.character);
    const who = index >= 0 ? `@Element${index + 1}` : line.character;
    return `${who} says: "${speechForModel(line.line)}"`;
  });
  const lock = names.length
    ? names.map((_, index) => `@Element${index + 1}`).join(" and ")
    : "@Element1";
  return [
    "Cinematic live-action motion, photoreal, sharp, with light that matches the scene.",
    scene.heading,
    scene.action,
    ...spoken,
    `${lock} keeps exactly the face from the reference images, from every angle.`,
    "No subtitles, no captions, no watermark, no extra people.",
  ].filter(Boolean).join(" ");
}

export async function renderMotionReel(project: Project, scenes: Scene[], output: string): Promise<void> {
  const work = path.join(projectDir(project.id), "work", `motion-${path.basename(output, ".mp4")}`);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const uploads = new Map<string, string>();
  const clips: string[] = [];
  for (const scene of scenes) {
    const raw = path.join(work, `scene-${scene.number}.mp4`);
    await renderScene(project, scene, raw, uploads);
    const fitted = path.join(work, `scene-${scene.number}-fit.mp4`);
    await normalizeClip(raw, fitted);
    clips.push(fitted);
  }
  if (clips.length === 1) {
    fs.copyFileSync(clips[0], output);
    return;
  }
  await concatClips(clips, output, work);
}

async function renderScene(
  project: Project,
  scene: Scene,
  output: string,
  uploads: Map<string, string>,
): Promise<void> {
  const names = speakersOf(scene);
  const members = (names.length ? names : fallbackNames(project))
    .map((name) => project.cast.find((member) => member.characterName === name))
    .filter((member): member is CastMember => Boolean(member?.photoFile))
    .slice(0, 3);
  if (!members.length) throw new StudioError(`Scene ${scene.number} has no face to start from.`);
  const elements = [];
  for (const member of members) {
    const front = await host(project, member.photoFile, uploads);
    const references: string[] = [];
    for (const view of FACE_VIEWS) {
      if (view === "front") continue;
      const relative = member.views?.[view];
      if (!relative) continue;
      references.push(await host(project, relative, uploads));
    }
    elements.push({
      frontal_image_url: front,
      ...(references.length ? { reference_image_urls: references } : {}),
    });
  }
  const lead = members[0];
  const start = await host(project, lead.views?.threeQuarterLeft || lead.photoFile, uploads);
  const result = await runQueued(resolveSettings().videoModel, {
    prompt: sceneMotionPrompt(scene),
    start_image_url: start,
    duration: SCENE_CLIP_SECONDS,
    generate_audio: true,
    negative_prompt: NEGATIVE,
    elements,
  }, { timeoutMs: 480_000 });
  const video = mediaUrl(result, "video");
  fs.writeFileSync(output, await downloadBytes(video));
}

async function host(project: Project, relativePath: string, uploads: Map<string, string>): Promise<string> {
  const cached = uploads.get(relativePath);
  if (cached) return cached;
  const absolute = resolveInside(project.id, relativePath);
  if (!fs.existsSync(absolute)) throw new StudioError("A cast image is missing from this production.");
  const bytes = fs.readFileSync(absolute);
  const hosted = await uploadBytes(bytes, contentTypeFor(relativePath), path.basename(relativePath));
  uploads.set(relativePath, hosted);
  return hosted;
}

function speakersOf(scene: Scene): string[] {
  const names: string[] = [];
  for (const line of scene.dialogue) {
    if (!names.includes(line.character)) names.push(line.character);
  }
  return names;
}

function fallbackNames(project: Project): string[] {
  return project.cast.filter((member) => member.photoFile).slice(0, 1).map((member) => member.characterName);
}

function contentTypeFor(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function normalizeClip(input: string, output: string): Promise<void> {
  return probeHasAudio(input).then((hasAudio) => {
    const args = hasAudio
      ? ["-y", "-i", input, "-vf", SCALE, "-r", "24", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", output]
      : ["-y", "-i", input, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000", "-map", "0:v:0", "-map", "1:a:0", "-vf", SCALE, "-r", "24", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", output];
    return runFfmpeg(args);
  });
}

function concatClips(clips: string[], output: string, work: string): Promise<void> {
  const list = path.join(work, "concat.txt");
  fs.writeFileSync(list, clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"));
  return runFfmpeg([
    "-y", "-f", "concat", "-safe", "0", "-i", list,
    "-c", "copy", "-movflags", "+faststart", output,
  ]);
}

function probeHasAudio(file: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", file]);
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.on("close", () => resolve(stdout.trim().length > 0));
    child.on("error", () => resolve(false));
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().slice(-400) || `ffmpeg exited with ${code}.`));
    });
  });
}
