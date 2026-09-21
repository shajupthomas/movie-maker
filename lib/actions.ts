import { StudioError } from "./errors";
import { parseScreenplay } from "./screenplay";
import { planParts, speakingCharacters, totalDuration } from "./shots";
import { extractLogline, writeScript, writeStory } from "./story";
import type {
  CreateProjectInput,
  Genre,
  Project,
  StepState,
  StudioPayload,
  Tone,
  VideoPart,
} from "./types";
import { GENRES, TONES } from "./types";
import { nowIso, round1 } from "./text";

export function createProduction(input: CreateProjectInput): Project {
  const title = cleanTitle(input.title);
  const brief = cleanBrief(input.brief);
  const genre = assertGenre(input.genre);
  const tone = assertTone(input.tone);
  const targetMinutes = assertMinutes(input.targetMinutes);
  const at = nowIso();
  const written = writeStory({ title, brief, genre, tone, targetMinutes });
  return {
    id: crypto.randomUUID(),
    title,
    brief,
    genre,
    tone,
    targetMinutes,
    adultCastAttested: false,
    story: {
      version: 1,
      text: written.text,
      approved: false,
      trace: written.trace,
      updatedAt: at,
    },
    script: null,
    cast: [],
    parts: [],
    finalMovie: null,
    createdAt: at,
    updatedAt: at,
  };
}

export function saveStory(project: Project, text: string): Project {
  assertStoryOpen(project);
  const cleaned = requireStory(text);
  return touch(project, {
    story: {
      ...project.story!,
      text: cleaned,
      notes: project.story?.notes,
      updatedAt: nowIso(),
    },
  });
}

export function reviseStory(project: Project, notes: string): Project {
  assertStoryOpen(project);
  const cleaned = notes.trim();
  if (cleaned.length < 8) {
    throw new StudioError("Write a note the agent can actually use.");
  }
  const written = writeStory({ ...requestOf(project), notes: cleaned });
  const at = nowIso();
  return touch(project, {
    story: {
      version: (project.story?.version ?? 0) + 1,
      text: written.text,
      approved: false,
      notes: cleaned,
      trace: written.trace,
      updatedAt: at,
    },
    script: null,
    parts: [],
    finalMovie: null,
  });
}

export function approveStory(project: Project, text: string): Project {
  assertStoryOpen(project);
  const cleaned = requireStory(text);
  const written = writeScript(requestOf(project), cleaned);
  const at = nowIso();
  return touch(project, {
    story: {
      ...project.story!,
      text: cleaned,
      approved: true,
      approvedAt: at,
      updatedAt: at,
    },
    script: {
      version: 1,
      text: written.text,
      scenes: written.scenes,
      approved: false,
      trace: written.trace,
      totalDurationSec: written.totalDurationSec,
      updatedAt: at,
    },
    parts: [],
    finalMovie: null,
  });
}

export function reopenStory(project: Project): Project {
  if (!project.story) throw new StudioError("There is no story to reopen.");
  const at = nowIso();
  return touch(project, {
    story: { ...project.story, approved: false, approvedAt: undefined, updatedAt: at },
    script: null,
    parts: [],
    finalMovie: null,
  });
}

export function updateBrief(project: Project, brief: string): Project {
  assertStoryOpen(project);
  const cleaned = cleanBrief(brief);
  const written = writeStory({ ...requestOf(project), brief: cleaned });
  const at = nowIso();
  return touch(project, {
    brief: cleaned,
    story: {
      version: (project.story?.version ?? 0) + 1,
      text: written.text,
      approved: false,
      trace: written.trace,
      updatedAt: at,
    },
    script: null,
    parts: [],
    finalMovie: null,
  });
}

export function saveScript(project: Project, text: string): Project {
  assertScriptOpen(project);
  const scenes = requireScenes(text);
  const at = nowIso();
  return touch(project, {
    script: {
      ...project.script!,
      text,
      scenes,
      totalDurationSec: totalDuration(scenes),
      updatedAt: at,
    },
    parts: [],
    finalMovie: null,
  });
}

export function reviseScript(project: Project, notes: string): Project {
  assertScriptOpen(project);
  if (!project.story?.text) throw new StudioError("Approve a story before rewriting the script.");
  const cleaned = notes.trim();
  const written = writeScript({ ...requestOf(project), notes: cleaned || undefined }, project.story.text);
  const at = nowIso();
  return touch(project, {
    script: {
      version: (project.script?.version ?? 0) + 1,
      text: written.text,
      scenes: written.scenes,
      approved: false,
      notes: cleaned || undefined,
      trace: written.trace,
      totalDurationSec: written.totalDurationSec,
      updatedAt: at,
    },
    parts: [],
    finalMovie: null,
  });
}

export function approveScript(project: Project, text: string): Project {
  assertScriptOpen(project);
  const scenes = requireScenes(text);
  const at = nowIso();
  return touch(project, {
    script: {
      ...project.script!,
      text,
      scenes,
      approved: true,
      approvedAt: at,
      totalDurationSec: totalDuration(scenes),
      updatedAt: at,
    },
    parts: planParts(scenes, at),
    finalMovie: null,
  });
}

export function reopenScript(project: Project): Project {
  if (!project.script) throw new StudioError("There is no script to reopen.");
  const at = nowIso();
  return touch(project, {
    script: { ...project.script, approved: false, approvedAt: undefined, updatedAt: at },
    parts: [],
    finalMovie: null,
  });
}

export function setAdultAttestation(project: Project, attested: boolean): Project {
  if (!project.script?.approved) {
    throw new StudioError("Approve the script before attesting to the cast.");
  }
  if (attested) return touch(project, { adultCastAttested: true });
  const cleared = invalidateReels(project);
  return touch(cleared, { adultCastAttested: false, finalMovie: null });
}

export function invalidateReels(project: Project): Project {
  if (!project.script?.approved) {
    return touch(project, { parts: [], finalMovie: null });
  }
  return touch(project, {
    parts: planParts(project.script.scenes),
    finalMovie: null,
  });
}

export function approveReel(project: Project, partId: string): Project {
  const part = requireReel(project, partId);
  if (part.status !== "ready" && part.status !== "approved") {
    throw new StudioError("Render the reel before you approve it.");
  }
  return updatePart(project, partId, { status: "approved", error: undefined });
}

export function requestReelChanges(project: Project, partId: string, notes: string): Project {
  const cleaned = notes.trim();
  if (cleaned.length < 8) throw new StudioError("Tell the reel what to change.");
  requireReel(project, partId);
  return updatePart(project, partId, {
    status: "changes_requested",
    notes: cleaned,
    error: undefined,
  });
}

export function markReelRendering(project: Project, partId: string): Project {
  assertReelsOpen(project);
  requireReel(project, partId);
  return updatePart(project, partId, { status: "rendering", error: undefined });
}

export function markReelReady(
  project: Project,
  partId: string,
  videoFile: string,
  durationSec: number,
): Project {
  const part = requireReel(project, partId);
  return updatePart(project, partId, {
    status: "ready",
    videoFile,
    durationSec: round1(durationSec),
    version: part.version + (part.videoFile ? 1 : 0),
    error: undefined,
  });
}

export function markReelFailed(project: Project, partId: string, error: string): Project {
  requireReel(project, partId);
  return updatePart(project, partId, { status: "failed", error });
}

export function listBlockers(project: Project): string[] {
  const reasons: string[] = [];
  if (!project.script?.approved) return ["Approve the script before casting."];
  if (!project.adultCastAttested) {
    reasons.push("Confirm that every photographed actor is 18 or older.");
  }
  for (const name of speakingCharacters(project.script.scenes)) {
    const member = project.cast.find((item) => item.characterName === name);
    const label = name;
    if (!member) {
      reasons.push(`${label} needs an actor, a face photo, and a signed consent letter.`);
      continue;
    }
    if (!member.actorLegalName.trim()) reasons.push(`${label} needs the actor's legal name.`);
    if (!member.photoFile) reasons.push(`${label} needs a face photo of the actor.`);
    if (!member.consentFile) reasons.push(`${label} needs a signed consent letter.`);
    if (!member.attested) {
      reasons.push(`${label} needs the attestation that the consent letter is signed by that adult actor.`);
    }
    if (!member.consentDate) reasons.push(`${label} needs the date on the consent letter.`);
  }
  return reasons;
}

export function assembleReady(project: Project): boolean {
  return listBlockers(project).length === 0
    && project.parts.length > 0
    && project.parts.every((part) => part.status === "approved");
}

export function present(project: Project): StudioPayload {
  return {
    project,
    characters: project.script ? speakingCharacters(project.script.scenes) : [],
    blockers: project.script?.approved ? listBlockers(project) : [],
    assembleReady: assembleReady(project),
    steps: stepStates(project),
  };
}

export function projectLogline(project: Project): string {
  return project.story ? extractLogline(project.story.text) : "";
}

function stepStates(project: Project): StepState[] {
  const storyApproved = Boolean(project.story?.approved);
  const scriptApproved = Boolean(project.script?.approved);
  const castReady = scriptApproved && listBlockers(project).length === 0;
  const reelsApproved = project.parts.length > 0 && project.parts.every((part) => part.status === "approved");
  const pictureDone = Boolean(project.finalMovie);
  let current: StepState["id"] = "story";
  if (!storyApproved) current = "story";
  else if (!scriptApproved) current = "script";
  else if (!castReady) current = "cast";
  else if (!reelsApproved) current = "reels";
  else current = "picture";

  const phase = (id: StepState["id"], unlocked: boolean, done: boolean): StepState["phase"] => {
    if (id === current) return "current";
    if (!unlocked || !done) return "locked";
    return "done";
  };

  return [
    { id: "brief", label: "Brief", phase: "done", hint: "The seed of the picture." },
    {
      id: "story",
      label: "Story",
      phase: phase("story", true, storyApproved),
      hint: storyApproved ? "Approved" : "Waiting on your approval",
    },
    {
      id: "script",
      label: "Script",
      phase: phase("script", storyApproved, scriptApproved),
      hint: storyApproved ? (scriptApproved ? "Approved" : "Waiting on your corrections") : "Opens after the story is approved",
    },
    {
      id: "cast",
      label: "Cast & consent",
      phase: phase("cast", scriptApproved, castReady),
      hint: scriptApproved ? (castReady ? "Consent on file" : "Photos and signed letters") : "Opens after the script is approved",
    },
    {
      id: "reels",
      label: "Reels",
      phase: phase("reels", castReady, reelsApproved),
      hint: castReady ? (reelsApproved ? "Every reel approved" : "Review each reel") : "Opens when every actor is consented",
    },
    {
      id: "picture",
      label: "Picture",
      phase: phase("picture", reelsApproved, pictureDone),
      hint: pictureDone ? "Assembled" : reelsApproved ? "Ready to merge" : "Opens when every reel is approved",
    },
  ];
}

function requestOf(project: Project) {
  return {
    title: project.title,
    brief: project.brief,
    genre: project.genre,
    tone: project.tone,
    targetMinutes: project.targetMinutes,
  };
}

function assertStoryOpen(project: Project): void {
  if (!project.story) throw new StudioError("The story has not been written yet.");
  if (project.story.approved) {
    throw new StudioError("Reopen the story before changing it. Reopening clears the script and every reel.");
  }
}

function assertScriptOpen(project: Project): void {
  if (!project.story?.approved || !project.script) {
    throw new StudioError("Approve the story before working on the script.");
  }
  if (project.script.approved) {
    throw new StudioError("Reopen the script before changing it. Reopening clears the reels and the finished picture.");
  }
}

function assertReelsOpen(project: Project): void {
  if (!assembleBlockersClear(project)) {
    throw new StudioError(listBlockers(project)[0] || "Cast and consent are not complete.");
  }
  if (!project.parts.length) throw new StudioError("Approve the script so the reels can be planned.");
}

function assembleBlockersClear(project: Project): boolean {
  return listBlockers(project).length === 0;
}

function requireStory(text: string): string {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (cleaned.length < 200) {
    throw new StudioError("The story is too short to approve. It needs a full three-act draft.");
  }
  return `${cleaned}\n`;
}

function requireScenes(text: string) {
  const scenes = parseScreenplay(text);
  if (!scenes.length) {
    throw new StudioError(
      "No scenes found. Start each scene with a heading like INT. ROOM - NIGHT, put the character name in ALL CAPS on its own line, and write the dialogue beneath it.",
    );
  }
  if (!scenes.some((scene) => scene.dialogue.length)) {
    throw new StudioError("The script needs at least one speaking part so a consented actor can carry the picture.");
  }
  return scenes;
}

function requireReel(project: Project, partId: string): VideoPart {
  const part = project.parts.find((item) => item.id === partId);
  if (!part) throw new StudioError("That reel is not in this picture.", 404);
  return part;
}

function updatePart(project: Project, partId: string, patch: Partial<VideoPart>): Project {
  const at = nowIso();
  return touch(project, {
    parts: project.parts.map((part) => part.id === partId ? { ...part, ...patch, updatedAt: at } : part),
    finalMovie: patch.status === "approved" ? project.finalMovie : null,
  });
}

function touch(project: Project, patch: Partial<Project>): Project {
  return { ...project, ...patch, updatedAt: nowIso() };
}

function cleanTitle(title: string): string {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (cleaned.length < 1 || cleaned.length > 80) {
    throw new StudioError("Give the picture a title of 80 characters or fewer.");
  }
  return cleaned;
}

function cleanBrief(brief: string): string {
  const cleaned = brief.replace(/\s+/g, " ").trim();
  if (cleaned.length < 10 || cleaned.length > 4000) {
    throw new StudioError("The brief needs to be between 10 and 4000 characters.");
  }
  return cleaned;
}

function assertGenre(genre: string): Genre {
  if (!(GENRES as readonly string[]).includes(genre)) throw new StudioError("Choose a genre.");
  return genre as Genre;
}

function assertTone(tone: string): Tone {
  if (!(TONES as readonly string[]).includes(tone)) throw new StudioError("Choose a tone.");
  return tone as Tone;
}

function assertMinutes(value: number): number {
  if (!Number.isInteger(value) || value < 3 || value > 15) {
    throw new StudioError("Aim the picture between 3 and 15 minutes.");
  }
  return value;
}
