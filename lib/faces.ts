import { StudioError } from "./errors";
import type { CastMember, FaceView, Scene } from "./types";

export const FACE_VIEWS: FaceView[] = [
  "front",
  "threeQuarterLeft",
  "threeQuarterRight",
  "profileLeft",
  "profileRight",
];

export const VIEW_LABEL: Record<FaceView, string> = {
  front: "Front",
  threeQuarterLeft: "Three-quarter left",
  threeQuarterRight: "Three-quarter right",
  profileLeft: "Profile left",
  profileRight: "Profile right",
};

const MINOR_ROLE =
  /\b(child|children|kid|kids|toddler|infant|baby|minor|underage|preteen|schoolboy|schoolgirl|little boy|little girl|(?:1[0-7]|[1-9])\s*[- ]?years?\b)/i;

const LIKENESS_REQUEST =
  /\b(celebrity|public figure|real actor|famous actor|looks like|resembles|likeness of)\b/i;

export function isGenerated(member: Pick<CastMember, "source">): boolean {
  return member.source === "generated";
}

export function anglesComplete(member: Pick<CastMember, "photoFile" | "views">): boolean {
  return FACE_VIEWS.every((view) => Boolean(view === "front" ? member.photoFile || member.views?.front : member.views?.[view]));
}

export function viewFileName(view: FaceView): string {
  const names: Record<FaceView, string> = {
    front: "front.jpg",
    threeQuarterLeft: "three-quarter-left.jpg",
    threeQuarterRight: "three-quarter-right.jpg",
    profileLeft: "profile-left.jpg",
    profileRight: "profile-right.jpg",
  };
  return names[view];
}

export function characterContext(scenes: Scene[], characterName: string): string {
  const cue = characterName.toUpperCase();
  const chunks = [characterName];
  for (const scene of scenes) {
    const mentioned = scene.dialogue.some((line) => line.character === cue) || scene.action.toUpperCase().includes(cue);
    if (!mentioned) continue;
    for (const sentence of scene.action.split(/(?<=[.!?])\s+/)) {
      if (sentence.toUpperCase().includes(cue)) chunks.push(sentence);
    }
  }
  return chunks.join("\n");
}

export function assertPhotorealAdult(characterName: string, identity: string, context: string): void {
  const described = identity
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/^\s*not\b/i.test(sentence))
    .join(" ");
  const minor = MINOR_ROLE.test(characterName) || MINOR_ROLE.test(described) || mentionsMinorRole(characterName, context);
  if (minor) {
    throw new StudioError(
      "Photoreal faces are generated only for fictional adults. A child role needs an adult performer with a signed consent letter, or a non-photoreal treatment in the script.",
    );
  }
  if (LIKENESS_REQUEST.test(described)) {
    throw new StudioError(
      "Generated faces are fictional. Describe a face of your own invention. A family member comes in through their photograph and a signed consent letter.",
    );
  }
}

function mentionsMinorRole(characterName: string, context: string): boolean {
  const cue = escapeRegExp(characterName.toUpperCase());
  const role = "child|children|kid|kids|toddler|infant|baby|minor|underage|preteen|schoolboy|schoolgirl|little boy|little girl";
  const age = "(?:1[0-7]|[1-9])\\s*[- ]?years?\\s*old";
  const pattern = new RegExp(
    `\\b${cue}\\b(?:\\s*,\\s*|\\s+is\\s+|\\s+was\\s+|\\s+as\\s+)(?:a\\s+|an\\s+)?(?:${role})\\b|\\b(?:${role})\\s+${cue}\\b|\\b${cue}\\b[^\\n.]{0,24}(?:${age})|(?:${age})[^\\n.]{0,24}\\b${cue}\\b`,
    "i",
  );
  return pattern.test(context);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
