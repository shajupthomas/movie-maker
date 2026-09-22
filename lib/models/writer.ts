import { parseScreenplay } from "../screenplay";
import { totalDuration } from "../shots";
import type { AgentTraceEntry, Project } from "../types";
import { completeChat, stripFences } from "./llm";
import { llmConfigured, resolveSettings } from "./settings";

const STORY_SYSTEM = [
  "You are the story department of a film studio.",
  "Write a complete three-act movie story in Markdown.",
  "Use exactly these headings: # Title, ## Logline, ## Characters, ## Act I, ## Act II, ## Act III, ## Theme.",
  "Write prose, not a screenplay, and do not use camera directions.",
  "Every character is a fictional adult. Do not sexualize anyone under 18. Do not depict a real person.",
  "Honor the brief, the genre, the tone, and the target length.",
  "If a director's note is included, weave it into the plot and add ## What changed after your note.",
].join(" ");

const SCRIPT_SYSTEM = [
  "You are the screenwriter of a film studio.",
  "Adapt the approved story into a shooting script and return only the screenplay.",
  "Start with FADE IN: and end with FADE OUT.",
  "Each scene heading is a line like INT. ARCHIVE - NIGHT or EXT. ROOF - DAWN.",
  "Character cues are ALL CAPS on their own line. Dialogue is on the following lines. Parentheticals are rare.",
  "Keep the proper names from the story. Write enough scenes to play near the target length.",
  "Speaking parts are fictional adults. Do not sexualize anyone under 18. Do not depict a real person.",
].join(" ");

export function storyDraftAcceptable(text: string): boolean {
  const body = text.trim();
  return body.length >= 200
    && /## Logline/.test(body)
    && /## Act I/.test(body)
    && /## Act II/.test(body)
    && /## Act III/.test(body);
}

export function scriptDraftAcceptable(text: string): boolean {
  if (!/FADE IN:/.test(text)) return false;
  try {
    const scenes = parseScreenplay(text);
    return scenes.length > 0 && scenes.some((scene) => scene.dialogue.length > 0);
  } catch {
    return false;
  }
}

export async function polishStory(project: Project): Promise<Project> {
  if (!llmConfigured() || !project.story) return project;
  const model = resolveSettings().llmModel;
  try {
    const raw = await completeChat([
      { role: "system", content: STORY_SYSTEM },
      { role: "user", content: storyRequest(project) },
    ]);
    const text = stripFences(raw);
    if (!storyDraftAcceptable(text)) {
      return noteStory(project, `Kept the studio draft. The ${model} draft did not include a full three-act story.`);
    }
    return {
      ...project,
      story: {
        ...project.story,
        text: text.endsWith("\n") ? text : `${text}\n`,
        trace: [...project.story.trace, { step: "Language model", detail: `Rewrote the story with ${model}.` }],
      },
    };
  } catch (error) {
    return noteStory(project, `Kept the studio draft. ${error instanceof Error ? error.message : "The language model did not answer."}`);
  }
}

export async function polishScript(project: Project): Promise<Project> {
  if (!llmConfigured() || !project.script || !project.story) return project;
  const model = resolveSettings().llmModel;
  try {
    const raw = await completeChat([
      { role: "system", content: SCRIPT_SYSTEM },
      { role: "user", content: scriptRequest(project) },
    ], { temperature: 0.4 });
    const text = stripFences(raw);
    if (!scriptDraftAcceptable(text)) {
      return noteScript(project, `Kept the studio draft. The ${model} screenplay could not be parsed.`);
    }
    const scenes = parseScreenplay(text);
    return {
      ...project,
      script: {
        ...project.script,
        text: text.endsWith("\n") ? text : `${text}\n`,
        scenes,
        totalDurationSec: totalDuration(scenes),
        trace: [...project.script.trace, { step: "Language model", detail: `Rewrote the screenplay with ${model}.` }],
      },
    };
  } catch (error) {
    return noteScript(project, `Kept the studio draft. ${error instanceof Error ? error.message : "The language model did not answer."}`);
  }
}

function storyRequest(project: Project): string {
  return [
    `Title: ${project.title}`,
    `Genre: ${project.genre}`,
    `Tone: ${project.tone}`,
    `Target length: ${project.targetMinutes} minutes`,
    `Brief: ${project.brief}`,
    project.story?.notes ? `Director's note: ${project.story.notes}` : "",
    "Studio scratch draft, which you may replace:",
    project.story?.text ?? "",
  ].filter(Boolean).join("\n\n");
}

function scriptRequest(project: Project): string {
  return [
    `Title: ${project.title}`,
    `Genre: ${project.genre}`,
    `Tone: ${project.tone}`,
    `Target length: ${project.targetMinutes} minutes`,
    project.script?.notes ? `Director's note: ${project.script.notes}` : "",
    "Approved story:",
    project.story?.text ?? "",
    "Studio scratch screenplay, which you may replace:",
    project.script?.text ?? "",
  ].filter(Boolean).join("\n\n");
}

function noteStory(project: Project, detail: string): Project {
  if (!project.story) return project;
  return {
    ...project,
    story: { ...project.story, trace: [...project.story.trace, trace(detail)] },
  };
}

function noteScript(project: Project, detail: string): Project {
  if (!project.script) return project;
  return {
    ...project,
    script: { ...project.script, trace: [...project.script.trace, trace(detail)] },
  };
}

function trace(detail: string): AgentTraceEntry {
  return { step: "Language model", detail: detail.replace(/\s+/g, " ").trim().slice(0, 400) };
}
