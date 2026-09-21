import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { approveScript, approveStory, createProduction, listBlockers, reviseStory } from "../lib/actions";
import { StudioError } from "../lib/errors";
import { parseScreenplay, formatScreenplay } from "../lib/screenplay";
import { assertBriefAllowed } from "../lib/safety";
import { packScenes } from "../lib/shots";
import { writeScript, writeStory } from "../lib/story";
import type { Scene } from "../lib/types";

const BRIEF = "A night-shift archivist in Lisbon finds a film reel that shows her apartment filmed the next morning. She has until dawn to decide whether to watch the ending.";

test("refuses sexual material involving minors", () => {
  assert.throws(
    () => assertBriefAllowed("A 15 year old in a sexual scene"),
    (error: unknown) => error instanceof StudioError,
  );
  assert.doesNotThrow(() => assertBriefAllowed(BRIEF));
});

test("writes a complete story and a screenplay from the brief", () => {
  const request = {
    title: "The Reel Dated Tomorrow",
    brief: BRIEF,
    genre: "Mystery" as const,
    tone: "Tense" as const,
    targetMinutes: 6,
  };
  const story = writeStory(request);
  assert.match(story.text, /Lisbon/);
  assert.match(story.text, /reel/i);
  assert.match(story.text, /## Act I/);
  assert.match(story.text, /## Act III/);
  const script = writeScript(request, story.text);
  assert.match(script.text, /FADE IN:/);
  assert.match(script.text, /INT\.|EXT\./);
  assert.ok(script.scenes.length >= 6);
  assert.ok(script.totalDurationSec > 180);
  const parsed = parseScreenplay(script.text);
  assert.equal(parsed.length, script.scenes.length);
  assert.ok(parsed.some((scene) => /reel|Lisbon|apartment/i.test(`${scene.action} ${scene.dialogue.map((line) => line.line).join(" ")}`)));
});

test("revision notes enter the next story draft", () => {
  const request = {
    title: "The Reel Dated Tomorrow",
    brief: BRIEF,
    genre: "Mystery" as const,
    tone: "Tense" as const,
    targetMinutes: 4,
  };
  const revised = writeStory({ ...request, notes: "End on the roof at dawn, with the reel unspooled." });
  assert.match(revised.text, /roof at dawn/);
});

test("human script corrections survive a round trip", () => {
  const text = [
    "FADE IN:",
    "",
    "INT. ARCHIVE - NIGHT",
    "",
    "The bench is cold.",
    "",
    "MAYA",
    "(quietly)",
    "The reel is dated tomorrow.",
    "",
    "JONAH (V.O.)",
    "Then we watch it before dawn.",
    "",
    "FADE OUT.",
    "",
  ].join("\n");
  const scenes = parseScreenplay(text);
  assert.equal(scenes.length, 1);
  assert.equal(scenes[0].dialogue[0].line, "The reel is dated tomorrow.");
  assert.equal(scenes[0].dialogue[0].parenthetical, "quietly");
  assert.equal(scenes[0].dialogue[1].extension, "V.O.");
  const again = parseScreenplay(formatScreenplay(scenes));
  assert.equal(again[0].dialogue[0].line, "The reel is dated tomorrow.");
  assert.equal(again[0].dialogue[1].line, "Then we watch it before dawn.");
});

test("packs whole scenes up to the reel limit", () => {
  const scenes = [40, 40, 50, 200].map((durationSec, index) => ({
    id: `scene-${index + 1}`,
    number: index + 1,
    heading: "INT. ROOM - DAY",
    location: "ROOM",
    timeOfDay: "DAY",
    interior: true,
    action: "They wait.",
    dialogue: [],
    durationSec,
  }) satisfies Scene);
  const groups = packScenes(scenes, 100);
  assert.deepEqual(groups.map((group) => group.map((scene) => scene.durationSec)), [[40, 40], [50], [200]]);
});

test("approval gates block the picture until consent is on file", () => {
  let project = createProduction({
    title: "The Reel Dated Tomorrow",
    brief: BRIEF,
    genre: "Mystery",
    tone: "Tense",
    targetMinutes: 3,
  });
  assert.equal(project.story?.approved, false);
  assert.throws(() => approveScript(project, "INT. ROOM - DAY\n\nMAYA\nHello.\n"), StudioError);
  project = approveStory(project, project.story!.text);
  assert.equal(project.script?.approved, false);
  project = approveScript(project, [
    "FADE IN:",
    "",
    "INT. ARCHIVE - NIGHT",
    "",
    "The bench is cold.",
    "",
    "MAYA",
    "The reel is dated tomorrow.",
    "",
    "JONAH",
    "Then we watch it before dawn.",
    "",
    "FADE OUT.",
  ].join("\n"));
  assert.equal(project.parts.length, 1);
  assert.ok(listBlockers(project).some((reason) => /18 or older/.test(reason)));
  project = reviseStory({ ...project, story: { ...project.story!, approved: false } }, "Move the last scene onto the roof.");
  assert.equal(project.script, null);
  assert.equal(project.parts.length, 0);
});

test("renders a consented reel and merges it", async () => {
  process.env.STUDIO_DATA_DIR = mkdtempSync(path.join(tmpdir(), "proscenium-"));
  process.env.STUDIO_PYTHON = path.join(process.cwd(), ".venv", "bin", "python");
  const { saveProject } = await import("../lib/store");
  const { renderReel, assemblePicture } = await import("../lib/render");
  const { approveReel } = await import("../lib/actions");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  let project = createProduction({
    title: "Gate Test",
    brief: BRIEF,
    genre: "Mystery",
    tone: "Grounded",
    targetMinutes: 3,
  });
  project = approveStory(project, project.story!.text);
  project = approveScript(project, [
    "FADE IN:",
    "",
    "INT. ARCHIVE - NIGHT",
    "",
    "Rain touches the glass.",
    "",
    "MAYA",
    "The reel is dated tomorrow.",
    "",
    "JONAH",
    "Then we watch it before dawn.",
    "",
    "FADE OUT.",
  ].join("\n"));
  project.adultCastAttested = true;
  const root = path.join(process.env.STUDIO_DATA_DIR, project.id, "cast");
  for (const [id, name, actor] of [
    ["11111111-1111-4111-8111-111111111111", "MAYA", "Maya Chen"],
    ["22222222-2222-4222-8222-222222222222", "JONAH", "Jonah Adler"],
  ] as const) {
    const dir = path.join(root, id);
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "photo.png"), png);
    writeFileSync(path.join(dir, "consent.txt"), `Signed consent for ${actor}\n`);
    project.cast.push({
      id,
      characterName: name,
      actorLegalName: actor,
      photoFile: `cast/${id}/photo.png`,
      consentFile: `cast/${id}/consent.txt`,
      consentOriginalName: "consent.txt",
      consentSha256: "abc123abc123abc123abc123abc123ab",
      attested: true,
      consentDate: "2026-09-21",
      uploadedAt: new Date().toISOString(),
    });
  }
  assert.equal(listBlockers(project).length, 0);
  project = saveProject(project);
  project = await renderReel(project, project.parts[0].id);
  assert.equal(project.parts[0].status, "ready");
  assert.ok((project.parts[0].durationSec ?? 0) > 3);
  project = saveProject(approveReel(project, project.parts[0].id));
  project = await assemblePicture(project);
  assert.ok(project.finalMovie);
  const movie = path.join(process.env.STUDIO_DATA_DIR, project.id, project.finalMovie!.file);
  const probe = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_type",
    "-of", "csv=p=0",
    movie,
  ], { encoding: "utf8" });
  assert.equal(probe.status, 0);
  assert.match(probe.stdout, /video/);
  assert.match(probe.stdout, /audio/);
  assert.ok(readFileSync(movie).length > 1000);
});
