import type { Project } from "./types";
import { titleCaseName } from "./text";

export function consentTemplate(project: Project, character?: string): string {
  const names = character
    ? [character]
    : project.script?.scenes
      ? unique(project.script.scenes.flatMap((scene) => scene.dialogue.map((line) => line.character)))
      : [];
  const blocks = names.length ? names : ["(character)"];
  return [
    "LIKENESS CONSENT AND RELEASE",
    "Template only. Have the actor sign it before you upload it.",
    "Proscenium records the file and your attestation. It does not notarize a signature,",
    "and it will not render a likeness without the letter, the photograph, and the attestation.",
    "",
    `Production: ${project.title}`,
    `Studio: Proscenium`,
    "",
    ...blocks.flatMap((name) => letterFor(project.title, name)),
  ].join("\n");
}

function letterFor(title: string, character: string): string[] {
  const label = titleCaseName(character);
  return [
    "------------------------------------------------------------",
    `Character: ${label}`,
    "",
    "I, ______________________________ (legal name), am 18 or older.",
    `I consent to the use of my face photograph and likeness as ${label}`,
    `in the production “${title}”, including its scene reels and the finished picture,`,
    "for this production only.",
    "",
    "I understand that withholding my signature means my likeness will not be used.",
    "",
    "Signature: ______________________________",
    "Date: ______________________________",
    "",
  ];
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
