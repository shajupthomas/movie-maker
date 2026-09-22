import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { listBlockers } from "../lib/actions";
import { StudioError } from "../lib/errors";
import { assertPhotorealAdult } from "../lib/faces";
import { runQueued } from "../lib/models/fal";
import { setLlmFetch } from "../lib/models/llm";
import { maskKey, publicSettings, saveSettings } from "../lib/models/settings";
import { klingDuration, speechForModel } from "../lib/models/motion";
import { polishScript, scriptDraftAcceptable, storyDraftAcceptable } from "../lib/models/writer";
import type { CastMember, Project, Scene } from "../lib/types";

const VIEWS = {
  front: "cast/a/front.jpg",
  threeQuarterLeft: "cast/a/three-quarter-left.jpg",
  threeQuarterRight: "cast/a/three-quarter-right.jpg",
  profileLeft: "cast/a/profile-left.jpg",
  profileRight: "cast/a/profile-right.jpg",
};

test("scene clips use the longest duration the picture model allows", () => {
  assert.equal(klingDuration(2), "5");
  assert.equal(klingDuration(6), "6");
  assert.equal(klingDuration(9), "9");
  assert.equal(klingDuration(10), "15");
  assert.equal(klingDuration(40), "15");
  assert.equal(speechForModel("The reel is dated tomorrow."), "the reel is dated tomorrow.");
  assert.equal(speechForModel("Then we watch Lisbon."), "then we watch LISBON.");
});

test("generated faces clear the gate without a consent letter", () => {
  const project = shell();
  project.cast = [generated("MAYA"), generated("JONAH", "b")];
  assert.deepEqual(listBlockers(project), []);
  project.cast = [generated("MAYA")];
  assert.ok(listBlockers(project).some((reason) => /JONAH/.test(reason)));
  assert.ok(listBlockers(project).some((reason) => /18 or older/.test(reason)));
});

test("a photographed person still needs a signed letter", () => {
  const project = shell();
  project.adultCastAttested = true;
  project.cast = [
    generated("MAYA"),
    {
      id: "person-1",
      characterName: "JONAH",
      source: "person",
      actorLegalName: "",
      photoFile: "",
      consentFile: "",
      consentOriginalName: "",
      consentSha256: "",
      attested: false,
      consentDate: "",
      uploadedAt: "",
    },
  ];
  const reasons = listBlockers(project);
  assert.ok(reasons.some((reason) => /legal name/.test(reason)));
  assert.ok(reasons.some((reason) => /consent letter/.test(reason)));
});

test("photoreal generation stays with fictional adults", () => {
  assert.throws(() => assertPhotorealAdult("MAYA", "a 7 year old with brown eyes", ""), StudioError);
  assert.throws(() => assertPhotorealAdult("THE CHILD", "Fictional adult, age 34, oval face.", ""), StudioError);
  assert.throws(() => assertPhotorealAdult("LILA", "looks like a famous actor", ""), StudioError);
  assert.doesNotThrow(() => assertPhotorealAdult(
    "LILA",
    "Fictional adult, age 34, a narrow oval face and short dark curls.",
    "LILA finds a child's drawing.",
  ));
});

test("saved model keys are masked and a blank field keeps the key", () => {
  const previousFile = process.env.STUDIO_SETTINGS_FILE;
  const previousKey = process.env.STUDIO_LLM_API_KEY;
  const previousFal = process.env.FAL_KEY;
  const previousStudioFal = process.env.STUDIO_FAL_KEY;
  delete process.env.STUDIO_LLM_API_KEY;
  delete process.env.FAL_KEY;
  delete process.env.STUDIO_FAL_KEY;
  process.env.STUDIO_SETTINGS_FILE = path.join(mkdtempSync(path.join(tmpdir(), "proscenium-settings-")), "studio-settings.json");
  try {
    saveSettings({ llmApiKey: "sk-test-1234", falKey: "fal-secret-9876", llmModel: "gpt-4.1" });
    const saved = publicSettings();
    assert.equal(saved.llmConfigured, true);
    assert.equal(saved.falConfigured, true);
    assert.equal(saved.keyHints.llm, "••••1234");
    assert.equal(saved.keyHints.fal, "••••9876");
    assert.equal(maskKey("abcd"), "••••");
    saveSettings({ llmApiKey: "   ", falKey: "" });
    assert.equal(publicSettings().keyHints.llm, "••••1234");
    saveSettings({ clearLlm: true });
    assert.equal(publicSettings().llmConfigured, false);
    assert.equal(publicSettings().falConfigured, true);
    process.env.STUDIO_LLM_API_KEY = "env-key-5555";
    assert.equal(publicSettings().keyHints.llm, "••••5555");
    assert.equal(publicSettings().llmFromEnvironment, true);
  } finally {
    restore("STUDIO_SETTINGS_FILE", previousFile);
    restore("STUDIO_LLM_API_KEY", previousKey);
    restore("FAL_KEY", previousFal);
    restore("STUDIO_FAL_KEY", previousStudioFal);
  }
});

test("the picture queue returns the finished image", async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method || "GET"} ${url}`);
    const auth = new Headers(init?.headers).get("authorization");
    assert.equal(auth, "Key test-key");
    if (init?.method === "POST") {
      return Response.json({
        request_id: "req_1",
        status_url: "https://queue.fal.run/status",
        response_url: "https://queue.fal.run/response",
      });
    }
    if (url.endsWith("/status")) return Response.json({ status: "COMPLETED" });
    return Response.json({
      images: [{ url: "https://cdn.example/face.jpg" }],
      video: { url: "https://cdn.example/clip.mp4" },
    });
  };
  const result = await runQueued("fal-ai/flux-pro/v1.1", { prompt: "fictional adult" }, {
    fetch: fetchImpl,
    key: "test-key",
    sleep: async () => undefined,
    now: () => 1_000,
    timeoutMs: 5_000,
  }) as { images: Array<{ url: string }>; video: { url: string } };
  assert.equal(result.images[0].url, "https://cdn.example/face.jpg");
  assert.equal(result.video.url, "https://cdn.example/clip.mp4");
  assert.equal(calls[0], "POST https://queue.fal.run/fal-ai/flux-pro/v1.1");
  assert.ok(calls.some((call) => call.startsWith("GET https://queue.fal.run/status")));
});

test("an unreadable model screenplay leaves the studio draft in place", async () => {
  const previousFile = process.env.STUDIO_SETTINGS_FILE;
  const previousKey = process.env.STUDIO_LLM_API_KEY;
  delete process.env.STUDIO_LLM_API_KEY;
  process.env.STUDIO_SETTINGS_FILE = path.join(mkdtempSync(path.join(tmpdir(), "proscenium-llm-")), "studio-settings.json");
  saveSettings({ llmApiKey: "sk-writer-4242" });
  setLlmFetch(async () => Response.json({ choices: [{ message: { content: "this is not a screenplay" } }] }));
  try {
    const project = scripted();
    const polished = await polishScript(project);
    assert.equal(scriptDraftAcceptable(polished.script?.text || ""), true);
    assert.match(polished.script?.text || "", /FADE IN:/);
    assert.match((polished.script?.trace ?? []).map((entry) => entry.detail).join(" "), /studio draft/i);
    assert.equal(storyDraftAcceptable("# Title\n\n## Logline\n\nOne line.\n\n## Act I\n\nshort"), false);
  } finally {
    setLlmFetch(null);
    restore("STUDIO_SETTINGS_FILE", previousFile);
    restore("STUDIO_LLM_API_KEY", previousKey);
  }
});

function restore(name: "STUDIO_SETTINGS_FILE" | "STUDIO_LLM_API_KEY" | "FAL_KEY" | "STUDIO_FAL_KEY", value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function generated(name: string, id = "a"): CastMember {
  const views = Object.fromEntries(Object.entries(VIEWS).map(([view, file]) => [view, file.replace("/a/", `/${id}/`)]));
  return {
    id,
    characterName: name,
    source: "generated",
    actorLegalName: "Generated character",
    photoFile: views.front,
    consentFile: "",
    consentOriginalName: "",
    consentSha256: "",
    attested: true,
    consentDate: "",
    uploadedAt: "2026-09-22T00:00:00.000Z",
    identity: "Fictional adult, age 34, oval face, short dark curls.",
    views,
  };
}

function shell(): Project {
  const scene: Scene = {
    id: "scene-1",
    number: 1,
    heading: "INT. ARCHIVE - NIGHT",
    location: "ARCHIVE",
    timeOfDay: "NIGHT",
    interior: true,
    action: "MAYA waits.",
    dialogue: [
      { character: "MAYA", line: "Hello." },
      { character: "JONAH", line: "Dawn." },
    ],
    durationSec: 20,
  };
  return {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Gate",
    brief: "An archivist finds a reel dated tomorrow and waits for dawn.",
    genre: "Mystery",
    tone: "Tense",
    targetMinutes: 3,
    adultCastAttested: false,
    story: null,
    script: {
      version: 1,
      text: "FADE IN:\n",
      approved: true,
      scenes: [scene],
      trace: [],
      totalDurationSec: 20,
      updatedAt: "2026-09-22T00:00:00.000Z",
    },
    cast: [],
    parts: [],
    finalMovie: null,
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
  };
}

function scripted(): Project {
  const project = shell();
  project.story = {
    version: 1,
    text: `${"# Gate\n\n## Logline\n\nShe waits.\n\n## Act I\n\n".padEnd(220, "A ")}\n`,
    approved: true,
    trace: [],
    updatedAt: "2026-09-22T00:00:00.000Z",
  };
  project.script = {
    ...project.script!,
    text: [
      "FADE IN:",
      "",
      "INT. ARCHIVE - NIGHT",
      "",
      "The bench is cold.",
      "",
      "MAYA",
      "The reel is dated tomorrow.",
      "",
      "FADE OUT.",
      "",
    ].join("\n"),
    trace: [{ step: "Write the screenplay", detail: "One scene." }],
  };
  return project;
}
