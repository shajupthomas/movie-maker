import type { DialogueLine, Scene, VideoPart } from "./types";
import { chunks, nowIso, round1, wordCount } from "./text";

/** Scene reels stay whole scenes, packed up to three minutes. */
export const MAX_PART_SECONDS = 180;

export interface ShotCharacter {
  name: string;
  actor: string;
  photo: string | null;
}

export interface Shot {
  type: "slate" | "establish" | "action" | "dialogue" | "note";
  duration: number;
  heading?: string;
  sub?: string;
  action?: string;
  text?: string;
  character?: string;
  actor?: string;
  line?: string;
  parenthetical?: string;
  photo?: string | null;
  timeOfDay?: string;
  characters?: ShotCharacter[];
}

export function dialogueSeconds(line: string): number {
  const words = Math.max(1, wordCount(line));
  return Math.max(2.6, round1(words / 2.15 + 0.7));
}

export function actionSeconds(text: string): number {
  const words = Math.max(1, wordCount(text));
  return Math.max(3.2, Math.min(12, round1(words / 2.6)));
}

export function sceneShots(scene: Scene): Shot[] {
  const people = uniqueSpeakers(scene.dialogue);
  const actionChunks = chunks(scene.action, 240).slice(0, 6);
  const visible = actionChunks.length ? actionChunks : [scene.heading];
  const shots: Shot[] = [
    {
      type: "establish",
      duration: Math.max(3.6, actionSeconds(visible[0])),
      heading: scene.heading,
      action: visible[0],
      timeOfDay: scene.timeOfDay,
      characters: people.map((name) => ({ name, actor: "", photo: null })),
    },
  ];
  for (const chunk of visible.slice(1)) {
    shots.push({
      type: "action",
      duration: actionSeconds(chunk),
      text: chunk,
      heading: scene.heading,
      timeOfDay: scene.timeOfDay,
      characters: people.map((name) => ({ name, actor: "", photo: null })),
    });
  }
  for (const line of scene.dialogue) {
    shots.push({
      type: "dialogue",
      duration: dialogueSeconds(line.line),
      character: line.character,
      line: line.line,
      parenthetical: line.parenthetical,
      heading: scene.heading,
      timeOfDay: scene.timeOfDay,
    });
  }
  return shots;
}

export function applyDurations(scenes: Scene[]): Scene[] {
  return scenes.map((scene) => {
    const durationSec = round1(
      sceneShots(scene).reduce((total, shot) => total + shot.duration, 0),
    );
    return { ...scene, durationSec };
  });
}

export function totalDuration(scenes: Scene[]): number {
  return round1(scenes.reduce((total, scene) => total + scene.durationSec, 0));
}

export function packScenes(scenes: Scene[], maxSeconds = MAX_PART_SECONDS): Scene[][] {
  const groups: Scene[][] = [];
  let current: Scene[] = [];
  let duration = 0;
  for (const scene of scenes) {
    if (current.length && duration + scene.durationSec > maxSeconds) {
      groups.push(current);
      current = [];
      duration = 0;
    }
    current.push(scene);
    duration += scene.durationSec;
  }
  if (current.length) groups.push(current);
  return groups;
}

export function planParts(scenes: Scene[], at = nowIso()): VideoPart[] {
  return packScenes(scenes).map((group, index) => ({
    id: `reel-${index + 1}`,
    index: index + 1,
    sceneNumbers: group.map((scene) => scene.number),
    sceneIds: group.map((scene) => scene.id),
    durationSec: round1(group.reduce((total, scene) => total + scene.durationSec, 0)),
    status: "planned",
    version: 1,
    updatedAt: at,
  }));
}

export function speakingCharacters(scenes: Scene[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const scene of scenes) {
    for (const line of scene.dialogue) {
      const name = line.character.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

function uniqueSpeakers(lines: DialogueLine[]): string[] {
  return speakingCharacters([{ dialogue: lines } as Scene]);
}
