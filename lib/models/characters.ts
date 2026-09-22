import fs from "fs";
import path from "path";
import { StudioError } from "../errors";
import {
  FACE_VIEWS,
  assertPhotorealAdult,
  characterContext,
  viewFileName,
} from "../faces";
import { resolveInside } from "../paths";
import { speakingCharacters } from "../shots";
import type { CastMember, FaceView, Project } from "../types";
import { hashString, nowIso, pick } from "../text";
import { downloadBytes, mediaUrl, runQueued, uploadBytes } from "./fal";
import { completeChat, stripFences } from "./llm";
import { llmConfigured, resolveSettings } from "./settings";

const AGES = [28, 31, 34, 37, 41, 44, 48, 52];
const FEATURES = [
  "a narrow oval face, deep-set brown eyes, a straight nose, and short dark curls",
  "a broad face, gray-green eyes, a slightly crooked nose, and silvering black hair cut close",
  "high cheekbones, amber eyes, a wide mouth, and straight black hair tucked behind one ear",
  "a square jaw, dark brown eyes under heavy brows, and close-cropped copper hair",
  "a long face, pale hazel eyes, faint freckles, and wavy chestnut hair",
  "a round face, nearly black eyes, a soft jaw, and a precise black bob",
];

export function localIdentity(project: Project, characterName: string): string {
  const seed = `${project.id}:${characterName}:${project.genre}:${project.tone}`;
  const age = pick(AGES, seed);
  const features = pick(FEATURES, `${seed}:face`);
  return `Fictional adult, age ${age}, ${features}. Neutral expression. Invented for this picture and not based on anyone living.`;
}

export function frontPrompt(identity: string): string {
  return [
    "Photoreal head-and-shoulders studio portrait of one fictional adult, facing the camera, neutral expression, both eyes visible, even soft light, plain gray background, sharp focus, 85mm lens.",
    "The whole face is unobstructed. No sunglasses, no hat, no hand across the face.",
    "The person is between 25 and 55. Not a child. Not a celebrity. Not a public figure. No text. No watermark.",
    identity,
  ].join(" ");
}

export function anglePrompt(view: Exclude<FaceView, "front">): string {
  const turn: Record<Exclude<FaceView, "front">, string> = {
    threeQuarterLeft: "Rotate the camera to a three-quarter view from the subject's left.",
    threeQuarterRight: "Rotate the camera to a three-quarter view from the subject's right.",
    profileLeft: "Rotate the camera to a clean left profile.",
    profileRight: "Rotate the camera to a clean right profile.",
  };
  return [
    turn[view],
    "This is the same person. Do not change age, face shape, eyes, nose, mouth, skin, hair, or identity.",
    "Change only the camera angle. Head and shoulders, plain gray background, sharp focus, no text, no watermark.",
  ].join(" ");
}

export async function composeIdentity(project: Project, characterName: string, guidance?: string): Promise<string> {
  const context = characterContext(project.script?.scenes ?? [], characterName);
  const directed = guidance?.trim();
  const base = directed || localIdentity(project, characterName);
  assertPhotorealAdult(characterName, base, context);
  if (!llmConfigured()) return clampIdentity(base);
  try {
    const raw = await completeChat([
      {
        role: "system",
        content: "You write casting descriptions for fictional adults. Two sentences. Age 25 to 55. Specific face, hair, and complexion. The person is invented and is not a child, celebrity, or public figure. Return only the description.",
      },
      {
        role: "user",
        content: [
          `Character: ${characterName}`,
          `Picture: ${project.title}`,
          `Genre: ${project.genre}. Tone: ${project.tone}.`,
          directed ? `Director's direction: ${directed}` : "Invent a specific face.",
        ].join("\n"),
      },
    ], { temperature: 0.8 });
    const text = clampIdentity(stripFences(raw));
    assertPhotorealAdult(characterName, text, context);
    return text;
  } catch (error) {
    if (error instanceof StudioError) throw error;
    return clampIdentity(base);
  }
}

export async function createGeneratedMember(
  project: Project,
  characterName: string,
  guidance?: string,
): Promise<CastMember> {
  requireSpeaker(project, characterName);
  if (!resolveSettings().falKey) {
    throw new StudioError("Connect the picture model on the Models page before generating a face.");
  }
  const identity = await composeIdentity(project, characterName, guidance);
  const existing = project.cast.find((member) => member.characterName === characterName);
  const memberId = existing?.id || crypto.randomUUID();
  const settings = resolveSettings();
  const seed = hashString(`${project.id}:${characterName}:${identity}`) % 2147483647;
  const front = await runQueued(settings.imageModel, {
    prompt: frontPrompt(identity),
    image_size: "portrait_4_3",
    num_images: 1,
    seed,
    output_format: "jpeg",
  });
  const frontUrl = mediaUrl(front, "image");
  const frontBytes = await downloadBytes(frontUrl);
  const frontHosted = await uploadBytes(frontBytes, "image/jpeg", "front.jpg");
  const views: Partial<Record<FaceView, string>> = {};
  const files: Array<{ view: FaceView; bytes: Buffer }> = [{ view: "front", bytes: frontBytes }];
  for (const view of FACE_VIEWS) {
    if (view === "front") continue;
    const turned = await runQueued(settings.angleModel, {
      prompt: anglePrompt(view),
      image_url: frontHosted,
      seed,
      output_format: "jpeg",
    });
    files.push({ view, bytes: await downloadBytes(mediaUrl(turned, "image")) });
  }
  for (const file of files) {
    const relative = path.posix.join("cast", memberId, viewFileName(file.view));
    writeBytes(project.id, relative, file.bytes);
    views[file.view] = relative;
  }
  if (existing?.consentFile) {
    const previous = resolveInside(project.id, existing.consentFile);
    if (fs.existsSync(previous)) fs.rmSync(previous, { force: true });
  }
  return {
    id: memberId,
    characterName,
    source: "generated",
    actorLegalName: "Generated character",
    photoFile: views.front || "",
    consentFile: "",
    consentOriginalName: "",
    consentSha256: "",
    attested: true,
    consentDate: "",
    uploadedAt: nowIso(),
    identity,
    views,
  };
}

export async function matchAngles(project: Project, characterName: string): Promise<CastMember> {
  requireSpeaker(project, characterName);
  if (!project.adultCastAttested) {
    throw new StudioError("Confirm that every photographed actor is 18 or older before sending a face to the picture model.");
  }
  const member = project.cast.find((item) => item.characterName === characterName);
  if (!member || member.source === "generated") {
    throw new StudioError("File the family member's photograph and signed consent before matching angles.");
  }
  if (!member.photoFile || !member.consentFile || !member.attested || !member.actorLegalName.trim()) {
    throw new StudioError("The angle sheet is made from a consented photograph. File the photo, the letter, and the attestation first.");
  }
  if (!resolveSettings().falKey) {
    throw new StudioError("Connect the picture model on the Models page before matching angles.");
  }
  const absolute = resolveInside(project.id, member.photoFile);
  if (!fs.existsSync(absolute)) throw new StudioError("The consented photograph is missing from this production.");
  const bytes = fs.readFileSync(absolute);
  const contentType = contentTypeFor(member.photoFile);
  const hosted = await uploadBytes(bytes, contentType, path.basename(member.photoFile));
  const settings = resolveSettings();
  const seed = hashString(`${member.id}:${member.consentSha256}`) % 2147483647;
  const views: Partial<Record<FaceView, string>> = { front: member.photoFile };
  for (const view of FACE_VIEWS) {
    if (view === "front") continue;
    const turned = await runQueued(settings.angleModel, {
      prompt: anglePrompt(view),
      image_url: hosted,
      seed,
      output_format: "jpeg",
    });
    const relative = path.posix.join("cast", member.id, viewFileName(view));
    writeBytes(project.id, relative, await downloadBytes(mediaUrl(turned, "image")));
    views[view] = relative;
  }
  return { ...member, views, uploadedAt: nowIso() };
}

function requireSpeaker(project: Project, characterName: string): void {
  if (!project.script?.approved) throw new StudioError("Approve the script before casting.");
  if (!speakingCharacters(project.script.scenes).includes(characterName)) {
    throw new StudioError("That character does not speak in the approved script.");
  }
}

function clampIdentity(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 700 ? `${cleaned.slice(0, 697)}...` : cleaned;
}

function writeBytes(projectId: string, relativePath: string, bytes: Buffer): void {
  const absolute = resolveInside(projectId, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, bytes);
}

function contentTypeFor(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}
