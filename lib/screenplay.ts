import { applyDurations } from "./shots";
import type { DialogueLine, Scene } from "./types";

const HEADING = /^(INT\.\/EXT\.|EXT\.\/INT\.|INT\.|EXT\.)\s*(.*)$/i;

export function parseScreenplay(text: string): Scene[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const scenes: Scene[] = [];
  let current: Scene | null = null;
  let index = 0;

  const ensure = (): Scene => {
    if (!current) {
      current = blankScene(scenes.length + 1, "INT. UNTITLED - DAY");
      scenes.push(current);
    }
    return current;
  };

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line || isSkip(line)) {
      index += 1;
      continue;
    }
    if (HEADING.test(line)) {
      current = blankScene(scenes.length + 1, line);
      scenes.push(current);
      index += 1;
      continue;
    }
    if (isCue(line)) {
      const scene = ensure();
      const extension = /\(V\.O\.\)/i.test(line)
        ? "V.O."
        : /\(O\.S\.\)/i.test(line)
          ? "O.S."
          : undefined;
      const character = line.replace(/\s*\((?:V\.O\.|O\.S\.)\)\s*/i, "").trim();
      index += 1;
      let parenthetical: string | undefined;
      if (index < lines.length && /^\(.*\)$/.test(lines[index].trim())) {
        parenthetical = lines[index].trim().slice(1, -1).trim();
        index += 1;
      }
      const spoken: string[] = [];
      while (index < lines.length) {
        const next = lines[index].trim();
        if (!next) break;
        if (HEADING.test(next) || isCue(next) || isSkip(next)) break;
        spoken.push(next);
        index += 1;
      }
      if (spoken.length) {
        const entry: DialogueLine = {
          character,
          line: spoken.join(" "),
        };
        if (parenthetical) entry.parenthetical = parenthetical;
        if (extension) entry.extension = extension;
        scene.dialogue.push(entry);
      }
      continue;
    }
    const scene = ensure();
    scene.action = [scene.action, line].filter(Boolean).join(" ");
    index += 1;
  }

  return applyDurations(scenes.filter((scene) => scene.action || scene.dialogue.length));
}

export function formatScreenplay(scenes: Scene[]): string {
  const blocks: string[] = ["FADE IN:", ""];
  for (const scene of scenes) {
    blocks.push(scene.heading, "");
    if (scene.action.trim()) {
      blocks.push(wrap(scene.action.trim(), 68), "");
    }
    for (const line of scene.dialogue) {
      const cue = line.extension ? `${line.character} (${line.extension})` : line.character;
      blocks.push(cue);
      if (line.parenthetical) blocks.push(`(${line.parenthetical})`);
      blocks.push(wrap(line.line.trim(), 46));
      blocks.push("");
    }
  }
  blocks.push("FADE OUT.", "");
  return blocks.join("\n");
}

function blankScene(number: number, heading: string): Scene {
  const match = heading.match(HEADING);
  const interior = match ? match[1].toUpperCase().startsWith("INT") : true;
  const rest = (match ? match[2] : heading).trim();
  const pieces = rest.split(/\s+-\s+/);
  const location = (pieces[0] || "UNTITLED").trim();
  const timeOfDay = (pieces.slice(1).join(" - ") || "DAY").trim().toUpperCase();
  return {
    id: `scene-${number}`,
    number,
    heading: heading.trim(),
    location,
    timeOfDay,
    interior,
    action: "",
    dialogue: [],
    durationSec: 0,
  };
}

function isSkip(line: string): boolean {
  return /^(FADE IN:|FADE OUT\.|FADE OUT:|CUT TO:|THE END|TITLE CARD:?|END CREDITS)$/i.test(line);
}

function isCue(line: string): boolean {
  if (!/^[A-Z0-9][A-Z0-9 .'\-]{0,32}(\((V\.O\.|O\.S\.)\))?$/.test(line)) return false;
  const name = line.replace(/\((?:V\.O\.|O\.S\.)\)/, "").trim();
  const words = name.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 4) return false;
  return words.every((word) => /^[A-Z0-9][A-Z0-9'.\-]*$/.test(word));
}

function wrap(text: string, width: number): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.join("\n");
}
