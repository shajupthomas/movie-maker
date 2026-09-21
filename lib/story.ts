import { formatScreenplay } from "./screenplay";
import { applyDurations, totalDuration } from "./shots";
import type { AgentTraceEntry, DialogueLine, Genre, Scene, Tone } from "./types";
import {
  cueName,
  ensurePeriod,
  hashString,
  notableWord,
  pick,
  sentences,
  wordCount,
} from "./text";

export interface StoryRequest {
  title: string;
  brief: string;
  genre: Genre;
  tone: Tone;
  targetMinutes: number;
  notes?: string;
}

export interface WrittenStory {
  text: string;
  trace: AgentTraceEntry[];
}

export interface WrittenScript {
  text: string;
  scenes: Scene[];
  trace: AgentTraceEntry[];
  totalDurationSec: number;
}

interface Person {
  name: string;
  role: string;
  want: string;
  need: string;
}

interface Canon {
  title: string;
  brief: string;
  genre: Genre;
  tone: Tone;
  targetMinutes: number;
  notes?: string;
  place: string;
  word: string;
  protagonist: Person;
  secondary: Person;
  clauses: string[];
}

interface Beat {
  act: 1 | 2 | 3;
  interior: boolean;
  location: string;
  time: string;
  prose: string;
}

const FEMALE = ["Mara", "Adele", "Priya", "Noor", "Lila", "Amira", "Rosa", "Helen", "Leah", "Ines", "Clara", "Nadia"];
const MALE = ["Elias", "Jonah", "Samuel", "Hugo", "Owen", "Theo", "Idris", "Jonas", "Farid", "Paul", "Mateo", "Arthur"];
const FAMILY = ["Voss", "Keller", "Okoye", "March", "Dalal", "Petrov", "Nguyen", "Adler", "Singh", "Moreau", "Costa", "Ibrahim", "Berg", "Silva", "Cho"];

const PLACE_WORDS: Array<[RegExp, string, boolean]> = [
  [/\blighthouse\b/i, "LIGHTHOUSE", true],
  [/\barchive|archivist\b/i, "ARCHIVE", true],
  [/\bapartment\b/i, "APARTMENT", true],
  [/\bkitchen\b/i, "KITCHEN", true],
  [/\bhospital\b/i, "HOSPITAL", true],
  [/\bstation\b/i, "STATION", true],
  [/\bharbou?r\b/i, "HARBOR", false],
  [/\bdesert\b/i, "DESERT", false],
  [/\bforest\b/i, "FOREST", false],
  [/\bschool\b/i, "SCHOOL", true],
  [/\boffice\b/i, "OFFICE", true],
  [/\bship\b/i, "SHIP", true],
  [/\btrain\b/i, "TRAIN", true],
  [/\bdiner\b/i, "DINER", true],
  [/\bchurch\b/i, "CHURCH", true],
  [/\blaboratory|\blab\b/i, "LABORATORY", true],
  [/\bmotel\b/i, "MOTEL", true],
  [/\bbridge\b/i, "BRIDGE", false],
  [/\btheat(?:re|er)\b/i, "THEATER", true],
  [/\bfarm\b/i, "FARM", false],
  [/\bprison\b/i, "PRISON", true],
  [/\blibrary\b/i, "LIBRARY", true],
  [/\bmuseum\b/i, "MUSEUM", true],
  [/\brooftop\b/i, "ROOFTOP", false],
  [/\balley\b/i, "ALLEY", false],
  [/\bbeach\b/i, "BEACH", false],
  [/\bisland\b/i, "ISLAND", false],
  [/\bvillage\b/i, "VILLAGE", false],
  [/\bcastle\b/i, "CASTLE", true],
];

const ROLE_PATTERN =
  /\b(?:a|an|the)\s+((?:[a-z]+\s){0,3}(?:keeper|detective|doctor|teacher|pilot|chef|queen|king|soldier|scientist|artist|driver|captain|nurse|lawyer|farmer|singer|archivist|librarian|widow|stranger|girl|boy|woman|man|child|daughter|son|sister|brother|mother|father|friend|officer|agent|engineer|journalist|sailor|miner|priest|guard|student|professor|waiter|bartender|mechanic|astronaut|inventor|witch|ghost|courier|night-shift archivist|editor|projectionist))\b/gi;

export function writeStory(request: StoryRequest): WrittenStory {
  const canon = buildCanon(request);
  const beats = buildBeats(canon);
  const text = renderStory(canon, beats);
  return {
    text,
    trace: [
      { step: "Read the brief", detail: `Kept ${canon.clauses.length} clause${canon.clauses.length === 1 ? "" : "s"} as canon, including “${trimWords(canon.brief, 18)}”.` },
      { step: "Cast the story", detail: `${canon.protagonist.name}, ${canon.protagonist.role}. ${canon.secondary.name}, ${canon.secondary.role}.` },
      { step: "Write the picture", detail: `${beats.length} beats across three acts, aimed at a ${canon.targetMinutes}-minute film. Place: ${canon.place}.` },
      { step: "Leave the gate open", detail: canon.notes ? "Rewrote the draft with your note treated as story fact." : "The draft is not locked. Edit it, send a note, or approve it." },
    ],
  };
}

export function writeScript(request: StoryRequest, storyText: string): WrittenScript {
  const canon = buildCanon(request);
  const parsed = parseStory(storyText, canon);
  const targetSec = request.targetMinutes * 60;
  let scenes = scenesFromStory(parsed, canon);
  scenes = fitDuration(scenes, targetSec, canon);
  scenes = applyDurations(scenes);
  const text = formatScreenplay(scenes);
  const totalDurationSec = totalDuration(scenes);
  const names = parsed.characters.map((person) => person.name).join(", ");
  return {
    text,
    scenes,
    totalDurationSec,
    trace: [
      { step: "Read the approved story", detail: parsed.characters.length ? `Speaking parts come from the story: ${names}.` : "The story had no character headings, so the brief supplied the cast." },
      { step: "Write the screenplay", detail: `${scenes.length} scenes. Estimated picture length ${Math.round(totalDurationSec)} seconds, against a ${request.targetMinutes}-minute aim.` },
      { step: "Hold for correction", detail: request.notes ? "Your note was written into the script as a scene you can still edit." : "Change any line before you approve. Approval is what the reels are cut from." },
    ],
  };
}

export function extractLogline(storyText: string): string {
  const match = storyText.match(/## Logline\s*([\s\S]*?)(\n## |\s*$)/);
  if (!match) return "";
  return match[1].trim().split("\n").map((line) => line.trim()).filter(Boolean).join(" ");
}

function buildCanon(request: StoryRequest): Canon {
  const brief = request.brief.replace(/\s+/g, " ").trim();
  const names = extractNames(brief);
  const roles = extractRoles(brief);
  const female = /\b(she|her|hers)\b/i.test(brief) && !/\b(he|him|his)\b/i.test(brief);
  const male = /\b(he|him|his)\b/i.test(brief) && !/\b(she|her|hers)\b/i.test(brief);
  const protagonistName = names[0] || makeName(brief, female ? "f" : male ? "m" : "x", 1);
  const secondaryName = names[1] && names[1] !== protagonistName
    ? names[1]
    : makeName(brief + protagonistName, female ? "m" : "f", 2);
  const protagonistRole = roles[0] || "the person the day belongs to";
  const secondaryRole = roles[1] || secondaryRoleFor(request.genre);
  const place = extractPlace(brief);
  return {
    title: request.title.trim(),
    brief,
    genre: request.genre,
    tone: request.tone,
    targetMinutes: request.targetMinutes,
    notes: request.notes?.trim() || undefined,
    place,
    word: notableWord(brief),
    clauses: clausesOf(brief),
    protagonist: {
      name: protagonistName,
      role: protagonistRole,
      want: wantFor(request.genre, true),
      need: needFor(request.genre, true),
    },
    secondary: {
      name: secondaryName,
      role: secondaryRole,
      want: wantFor(request.genre, false),
      need: needFor(request.genre, false),
    },
  };
}

function buildBeats(canon: Canon): Beat[] {
  const target = Math.round(Math.min(18, Math.max(8, canon.targetMinutes * 1.35)));
  const spine: Array<(c: Canon, index: number) => string> = [
    ordinaryBeat,
    incitingBeat,
    reactionBeat,
    crossingBeat,
    midpointBeat,
    pressureBeat,
    lossBeat,
    climaxBeat,
    finalBeat,
  ];
  const extras: Array<(c: Canon, index: number) => string> = [
    detailBeat,
    refusalBeat,
    choiceBeat,
    aftermathBeat,
  ];
  const builders = [...spine];
  let extra = 0;
  while (builders.length < target && extra < extras.length) {
    builders.splice(3 + extra, 0, extras[extra]);
    extra += 1;
  }
  while (builders.length < target) {
    const index = builders.length;
    builders.splice(builders.length - 2, 0, (c, i) => complicationBeat(c, i + index));
  }
  const beats = builders.slice(0, target).map((builder, index) => {
    const setting = settingFor(canon, index);
    const act: 1 | 2 | 3 = index < 3 ? 1 : index < builders.length - 3 ? 2 : 3;
    return {
      act,
      interior: setting.interior,
      location: setting.location,
      time: setting.time,
      prose: builder(canon, index),
    };
  });
  if (canon.notes) {
    const at = Math.min(beats.length - 3, 4);
    beats[at] = {
      ...beats[at],
      prose: `${beats[at].prose} The day also turns on a correction that has to be played, not footnoted: ${ensurePeriod(canon.notes)} ${canon.protagonist.name} and ${canon.secondary.name} cannot leave that line outside the scene.`,
    };
  }
  return beats;
}

function renderStory(canon: Canon, beats: Beat[]): string {
  const act1 = beats.filter((beat) => beat.act === 1).map((beat) => beat.prose);
  const act2 = beats.filter((beat) => beat.act === 2).map((beat) => beat.prose);
  const act3 = beats.filter((beat) => beat.act === 3).map((beat) => beat.prose);
  const sections = [
    `# ${canon.title}`,
    "",
    "## Logline",
    "",
    logline(canon),
    "",
    "## Characters",
    "",
    `### ${canon.protagonist.name}`,
    `${cap(canon.protagonist.role)} in ${canon.place}. Wants ${canon.protagonist.want}. Needs ${canon.protagonist.need}.`,
    "",
    `### ${canon.secondary.name}`,
    `${cap(canon.secondary.role)}. Wants ${canon.secondary.want}. Needs ${canon.secondary.need}.`,
    "",
    "## Act I",
    "",
    act1.join("\n\n"),
    "",
    "## Act II",
    "",
    act2.join("\n\n"),
    "",
    "## Act III",
    "",
    act3.join("\n\n"),
    "",
    "## Theme",
    "",
    theme(canon),
    "",
  ];
  if (canon.notes) {
    sections.push("## What changed after your note", "", canon.notes, "");
  }
  return sections.join("\n");
}

interface ParsedStory {
  characters: Person[];
  paragraphs: string[];
}

function parseStory(text: string, canon: Canon): ParsedStory {
  const characters = parseCharacters(text);
  const paragraphs = parseActParagraphs(text);
  return {
    characters: characters.length >= 2
      ? characters
      : characters.length === 1
        ? [characters[0], canon.secondary]
        : [canon.protagonist, canon.secondary],
    paragraphs: paragraphs.length ? paragraphs : beatsToParagraphs(canon),
  };
}

function parseCharacters(text: string): Person[] {
  const section = sectionBody(text, "Characters");
  if (!section) return [];
  const blocks = section.split(/^###\s+/m).slice(1);
  return blocks.map((block) => {
    const [first, ...rest] = block.split("\n");
    const blurb = rest.join(" ").replace(/\s+/g, " ").trim();
    return {
      name: first.trim(),
      role: blurb || "as written in the story",
      want: "what the approved story gives them",
      need: "what the approved story will not let them avoid",
    };
  }).filter((person) => person.name);
}

function parseActParagraphs(text: string): string[] {
  const acts = ["Act I", "Act II", "Act III"]
    .map((heading) => sectionBody(text, heading))
    .filter((body): body is string => Boolean(body));
  const source = acts.length
    ? acts.join("\n\n")
    : fallbackProse(text);
  return source
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length > 40 && !paragraph.startsWith("#"));
}

function fallbackProse(text: string): string {
  return text
    .split(/\n\s*\n/)
    .filter((block) => !/^#{1,3}\s+/.test(block.trim()))
    .join("\n\n");
}

function sectionBody(text: string, heading: string): string | null {
  const pattern = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
  const match = pattern.exec(text);
  if (!match) return null;
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const next = rest.search(/^##\s+/m);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

function scenesFromStory(parsed: ParsedStory, canon: Canon): Scene[] {
  const people = parsed.characters;
  const note = canon.notes?.trim();
  const paragraphs = [...parsed.paragraphs];
  if (note) {
    paragraphs.push(
      `${people[0].name} stops and puts the correction in the scene where it can be heard: ${note} ${people[1]?.name || "The other person"} does not let the line stay theoretical.`,
    );
  }
  return paragraphs.map((prose, index) => {
    const setting = settingFor(canon, index);
    const names = people.map((person) => person.name);
    const spoken = dialogueFromParagraph(prose, names, canon, index);
    const actionSentences = sentences(prose).filter((sentence) => isActionSentence(sentence));
    const action = (actionSentences.length ? actionSentences : sentences(prose).slice(0, 2)).join(" ");
    return {
      id: `scene-${index + 1}`,
      number: index + 1,
      heading: `${setting.interior ? "INT." : "EXT."} ${setting.location} - ${setting.time}`,
      location: setting.location,
      timeOfDay: setting.time,
      interior: setting.interior,
      action: action || prose,
      dialogue: spoken,
      durationSec: 0,
    };
  });
}

function dialogueFromParagraph(prose: string, names: string[], canon: Canon, index: number): DialogueLine[] {
  const claim = sentences(prose).filter((sentence) => !isActionSentence(sentence));
  const pool = claim.length ? claim : sentences(prose);
  const count = Math.min(4, Math.max(2, pool.length));
  const lines: DialogueLine[] = [];
  for (let i = 0; i < count; i++) {
    const speaker = names[i % names.length] || names[0];
    const source = pool[i % pool.length];
    lines.push({
      character: cueName(speaker),
      parenthetical: i === 0 ? parenthetical(canon.tone, `${prose}:${i}`) : undefined,
      line: toSpeech(source, speaker, names[(i + 1) % names.length] || speaker, i, canon),
    });
  }
  if (index === 0) {
    const briefLine = trimWords(canon.brief, 36);
    lines.splice(1, 0, {
      character: cueName(names[0]),
      line: ensurePeriod(briefLine),
    });
  }
  return lines;
}

function toSpeech(sentence: string, speaker: string, other: string, index: number, canon: Canon): string {
  let spoken = sentence.replace(/^(In|Inside|Outside|At) the [^,]+,\s*/i, "");
  spoken = spoken.replace(new RegExp(`\\b${escapeReg(speaker)}\\b`, "g"), "I");
  spoken = trimWords(spoken, 32);
  const otherFirst = other.split(" ")[0];
  const prefixes = [
    "",
    "",
    `${otherFirst}, stay with this. `,
    "I need it said aloud. ",
    "No one else gets to tell it. ",
    `It still comes back to ${canon.word}. `,
  ];
  const prefix = prefixes[(hashString(`${sentence}:${index}`) + index) % prefixes.length];
  return ensurePeriod(`${prefix}${spoken.replace(/^[a-z]/, (letter) => letter.toUpperCase())}`);
}

function fitDuration(scenes: Scene[], targetSec: number, canon: Canon): Scene[] {
  const next = scenes.map((scene) => ({ ...scene, dialogue: [...scene.dialogue] }));
  let guard = 0;
  while (totalDuration(applyDurations(next)) < targetSec * 0.9 && guard < 48) {
    const scene = next[guard % next.length];
    if (scene.dialogue.length >= 6) {
      guard += 1;
      continue;
    }
    const speaker = scene.dialogue[scene.dialogue.length - 1]?.character
      || cueName(canon.protagonist.name);
    const other = scene.dialogue.find((line) => line.character !== speaker)?.character
      || cueName(canon.secondary.name);
    const clause = canon.clauses[guard % canon.clauses.length];
    scene.dialogue.push({
      character: guard % 2 === 0 ? speaker : other,
      line: ensurePeriod(pick([
        `I keep coming back to ${canon.word}`,
        `${titleCase(other)} if we leave now, this stays unfinished`,
        `Say the part about ${canon.place} that we keep skipping`,
        trimWords(clause, 22),
      ], `${clause}:${guard}`)),
    });
    guard += 1;
  }
  let trim = 0;
  while (totalDuration(applyDurations(next)) > targetSec * 1.18 && trim < 48) {
    const scene = [...next].sort((a, b) => b.dialogue.length - a.dialogue.length)[0];
    if (!scene || scene.dialogue.length <= 2) break;
    scene.dialogue.pop();
    trim += 1;
  }
  return next;
}

function beatsToParagraphs(canon: Canon): string[] {
  return buildBeats({ ...canon, notes: undefined }).map((beat) => beat.prose);
}

function ordinaryBeat(canon: Canon): string {
  return [
    `${canon.protagonist.name} keeps ${canon.place} by repetition, which is a private form of loyalty.`,
    `The work of a ${canon.protagonist.role} does not look like a plot from the doorway. It looks like a list, a light left on for a reason, and hands that already know the next task.`,
    `${canon.secondary.name} is in the day already, a ${canon.secondary.role}, not yet admitted to the middle of it.`,
    toneLine(canon, 1),
    `Nothing is wrong yet. That is the last easy fact the picture earns.`,
  ].join(" ");
}

function detailBeat(canon: Canon, index: number): string {
  const clause = canon.clauses[index % canon.clauses.length];
  return [
    `Before the turn, ${canon.place} still agrees with itself.`,
    `${canon.protagonist.name} can name the ordinary objects and trust them: a coat, a key, a clock a minute off.`,
    `${canon.secondary.name} watches the care in that, and does not interrupt it.`,
    `Under the detail sits the thing the brief will not let them keep small: ${lowerFirst(ensurePeriod(clause))}`,
    toneLine(canon, index),
  ].join(" ");
}

function incitingBeat(canon: Canon): string {
  return [
    `Then the day says the sentence it has been holding back. ${ensurePeriod(canon.brief)}`,
    `${canon.protagonist.name} does not get a cleaner version than the one that just happened.`,
    `The word that will not leave the room is ${canon.word}.`,
    `${canon.secondary.name} steps out of the margin and into the shot, because the story is no longer a private errand.`,
    toneLine(canon, 2),
  ].join(" ");
}

function reactionBeat(canon: Canon, index: number): string {
  return [
    `${canon.protagonist.name} tries the old explanation first, the one that would let ${canon.place} stay as it was an hour ago.`,
    `${canon.secondary.name} refuses the comfort of that explanation.`,
    `They say the event back to each other until it sounds less like weather and more like a decision someone already made.`,
    `What they do next will be the plot, whether they agree to call it that or not.`,
    toneLine(canon, index),
  ].join(" ");
}

function refusalBeat(canon: Canon, index: number): string {
  return [
    `There is a version of the afternoon where ${canon.protagonist.name} locks the door and calls the whole thing a mistake.`,
    `${canon.secondary.name} stands on the other side of that wish.`,
    genrePressure(canon, index),
    `Refusal costs a scene. It does not cost them the fact.`,
  ].join(" ");
}

function crossingBeat(canon: Canon, index: number): string {
  const clause = canon.clauses[index % canon.clauses.length];
  return [
    `They cross the threshold when staying put becomes the more dangerous choice.`,
    `${canon.protagonist.name} takes ${canon.secondary.name} as far as the first honest room, street, or edge ${canon.place} still has.`,
    `From here the brief is not background. It is the road: ${lowerFirst(ensurePeriod(clause))}`,
    genrePressure(canon, index + 1),
  ].join(" ");
}

function midpointBeat(canon: Canon, index: number): string {
  return [
    `At the middle, the story changes its mind about who it belongs to.`,
    `${canon.secondary.name} reveals the piece ${canon.protagonist.name} could not see from inside the work of a ${canon.protagonist.role}.`,
    `The revelation is not a trick. It makes ${canon.word} larger, and it makes retreat look like a lie.`,
    genrePressure(canon, index),
    `After this, kindness without truth is just another locked door.`,
  ].join(" ");
}

function pressureBeat(canon: Canon, index: number): string {
  return [
    `Pressure arrives as time, as a witness, as the particular logic of a ${canon.genre.toLowerCase()} picture.`,
    genrePressure(canon, index),
    `${canon.protagonist.name} and ${canon.secondary.name} start to want different survivals.`,
    `The scene gets smaller. The consequence does not.`,
    toneLine(canon, index),
  ].join(" ");
}

function complicationBeat(canon: Canon, index: number): string {
  const clause = canon.clauses[index % canon.clauses.length];
  return [
    `Another turn, because ${canon.place} is not finished with them.`,
    `${canon.protagonist.name} follows ${canon.word} one step further and finds it attached to a person, a debt, or a clock.`,
    `${canon.secondary.name} names the cost out loud.`,
    `The brief keeps its shape inside the complication: ${lowerFirst(ensurePeriod(clause))}`,
  ].join(" ");
}

function choiceBeat(canon: Canon): string {
  return [
    `${canon.protagonist.name} can protect the old day, or tell the truth that ends it.`,
    `${canon.secondary.name} will not choose for them, and will not pretend the choice is abstract.`,
    `They look at each other the way people look when the next line will be remembered.`,
    `The choice has to be made in ${canon.place}, not later, and not in a safer draft of this story.`,
  ].join(" ");
}

function lossBeat(canon: Canon, index: number): string {
  return [
    `Loss arrives without a speech to introduce it.`,
    `Something they were using as cover — a plan, an alibi, a kindness — fails in front of both of them.`,
    `${canon.secondary.name} is still in the frame. That is the only mercy the scene offers ${canon.protagonist.name}.`,
    genrePressure(canon, index),
    `For a moment the movie could end badly, and both of them know the picture would still be telling the truth.`,
  ].join(" ");
}

function climaxBeat(canon: Canon): string {
  return [
    `${canon.protagonist.name} chooses, and the choice answers what began when this happened: ${ensurePeriod(canon.brief)}`,
    `The answer is not a speech about ${canon.word}. It is an action, taken where ${canon.secondary.name} can see it and refuse it if it is false.`,
    `${canon.secondary.name} meets that action with one of their own, so the ending belongs to both of them.`,
    `What breaks is the lie that the brief was a small story.`,
    toneLine(canon, 9),
  ].join(" ");
}

function aftermathBeat(canon: Canon): string {
  return [
    `After the choice, ${canon.place} is still itself, only now it has been seen.`,
    `${canon.protagonist.name} does the next ordinary task with different hands.`,
    `${canon.secondary.name} stays long enough to prove the ending was shared.`,
    `Nobody rewinds the reel.`,
  ].join(" ");
}

function finalBeat(canon: Canon): string {
  return [
    `The last image is quiet enough to hear the cost.`,
    `${canon.protagonist.name} and ${canon.secondary.name} are in the same light, and the light is ordinary again.`,
    `${canon.word} is no longer a secret and no longer a weapon. It is simply part of the room.`,
    `The picture ends when staying would turn the truth into decoration.`,
  ].join(" ");
}

function logline(canon: Canon): string {
  return `When ${lowerFirst(trimWords(canon.brief, 28))}, ${canon.protagonist.name}, ${canon.protagonist.role} in ${canon.place}, has to finish the truth with ${canon.secondary.name} before the day can pretend it did not happen.`;
}

function theme(canon: Canon): string {
  return `${canon.title} is about the price of looking straight at a thing. ${canon.protagonist.name} can survive ${canon.word}. The harder question is whether ${canon.secondary.name.split(" ")[0]} is still beside them when the light comes back.`;
}

function toneLine(canon: Canon, index: number): string {
  const lines: Record<Tone, string[]> = {
    Grounded: [
      "The camera stays at eye level, close enough to see a decision and too close for a legend.",
      "Nobody makes a speech they would be ashamed to repeat in a kitchen.",
    ],
    Lyrical: [
      "The air has a color, and the color knows more than the people do, for a moment.",
      "A small sound carries, the way a bell carries across water.",
    ],
    Tense: [
      "Every pause is a little too long, as if the room is waiting for a second pair of feet.",
      "They lower their voices without agreeing to.",
    ],
    Warm: [
      "Even the fear has a human temperature. Someone could still make tea.",
      "A hand almost reaches, and the almost matters.",
    ],
    Dark: [
      "The light fails the way a promise fails, by degrees, then all at once.",
      "Humor, if it shows up, does not get to stay.",
    ],
    Wry: [
      "The situation is serious, and the people in it are one remark away from telling it badly on purpose.",
      "Dignity slips, and neither of them pretends not to notice.",
    ],
  };
  return pick(lines[canon.tone], `${canon.tone}:${index}`);
}

function genrePressure(canon: Canon, index: number): string {
  const who = canon.protagonist.name;
  const other = canon.secondary.name;
  const lines: Record<Genre, string[]> = {
    Drama: [
      `${who} has to say the private thing in a voice another person can hear.`,
      `The argument is not about the fact. It is about who has been carrying it alone.`,
    ],
    Thriller: [
      `Someone has already been through ${canon.place}; the hour ${who} trusted is a minute short.`,
      `${other} knows which detail was moved, and that knowledge puts a clock in the scene.`,
    ],
    "Science Fiction": [
      `The rule of the world breaks once, cleanly, and then it breaks again where they can measure it.`,
      `${who} wants a law that still holds. ${other} has already watched that law fail.`,
    ],
    Romance: [
      `The danger is not the event. It is saying the true thing and still being in the room afterward.`,
      `${other} is the complication ${who} keeps turning toward, even while pretending to solve something else.`,
    ],
    Comedy: [
      `The plan is sensible. Everyone around the plan is confident in the wrong direction.`,
      `${who} tries to keep a straight face and loses it at the exact wrong second.`,
    ],
    Adventure: [
      `The way back is longer than the way in, and the map they trusted was drawn by someone who stayed home.`,
      `${other} packed for a different journey, which turns out to be the useful one.`,
    ],
    Fantasy: [
      `The wish works. That is the problem, because the price was written in a smaller letter than the promise.`,
      `${other} knows the rule and is tired of being the only one who treats it as real.`,
    ],
    Mystery: [
      `The obvious answer fits every fact except the one ${other} will not stop repeating.`,
      `${who} realizes the missing piece was visible in the first room, misnamed on purpose.`,
    ],
  };
  return pick(lines[canon.genre], `${canon.genre}:${canon.word}:${index}`);
}

function settingFor(canon: Canon, index: number): { interior: boolean; location: string; time: string } {
  const found = PLACE_WORDS.find(([pattern]) => pattern.test(`${canon.brief} ${canon.place}`));
  const location = found ? found[1] : sanitizeLocation(canon.place);
  const interior = found ? found[2] : index % 2 === 0;
  const times = ["DAY", "DAY", "DUSK", "NIGHT", "NIGHT", "DAWN"];
  const variant = index % 3 === 0 ? location : index % 3 === 1 ? `${location} FLOOR` : `${location} THRESHOLD`;
  return {
    interior: index === 2 ? !interior : interior,
    location: variant,
    time: times[index % times.length],
  };
}

function parenthetical(tone: Tone, seed: string): string {
  const bank: Record<Tone, string[]> = {
    Grounded: ["quietly", "evenly", "after a breath"],
    Lyrical: ["softly", "almost to the room"],
    Tense: ["low", "without looking up"],
    Warm: ["gently"],
    Dark: ["flat", "tired"],
    Wry: ["dry", "almost amused"],
  };
  return pick(bank[tone], seed);
}

function wantFor(genre: Genre, lead: boolean): string {
  const wants: Record<Genre, [string, string]> = {
    Drama: ["to keep the day from becoming a confession", "to stop being the person who waits outside it"],
    Thriller: ["to stay ahead of whoever already knows", "to force the timetable into the open"],
    "Science Fiction": ["to prove the impossible is still bound by a rule", "to be believed before the rule breaks again"],
    Romance: ["to say the true thing without losing the person", "to be chosen in daylight, not only in crisis"],
    Comedy: ["to get through the mess with any dignity left", "to make the mess funny before it becomes permanent"],
    Adventure: ["to bring everyone back across the same threshold", "to be trusted with the map"],
    Fantasy: ["to use the gift without paying more than they owe", "to keep the rule from being spent cheaply"],
    Mystery: ["to name what everyone else is stepping around", "to stop being the only witness who was dismissed"],
  };
  return wants[genre][lead ? 0 : 1];
}

function needFor(genre: Genre, lead: boolean): string {
  const needs: Record<Genre, [string, string]> = {
    Drama: ["to tell the truth while someone is still there to hear it", "to stay for the answer"],
    Thriller: ["to trust one other person with the real hour", "to risk being seen helping"],
    "Science Fiction": ["to accept the evidence their training refuses", "to share the danger of being right"],
    Romance: ["to stop hiding inside competence", "to ask for the plain thing"],
    Comedy: ["to drop the performance", "to mean the joke"],
    Adventure: ["to admit they are afraid and keep walking", "to lead for a minute without apologizing"],
    Fantasy: ["to pay the real price", "to tell the truth about the bargain"],
    Mystery: ["to accuse the right silence", "to put their own name on the record"],
  };
  return needs[genre][lead ? 0 : 1];
}

function secondaryRoleFor(genre: Genre): string {
  const roles: Record<Genre, string> = {
    Drama: "the friend who stayed in the city",
    Thriller: "the stranger who already knows the timetable",
    "Science Fiction": "the witness from the other side of the event",
    Romance: "the person the day keeps turning toward",
    Comedy: "the colleague who improves nothing and means well",
    Adventure: "the one who packed for the wrong journey",
    Fantasy: "the keeper of the rule",
    Mystery: "the last person who saw it clearly",
  };
  return roles[genre];
}

function extractNames(brief: string): string[] {
  const skip = new Set([
    "The", "This", "That", "There", "Then", "When", "After", "Before", "Once", "During",
    "While", "Until", "Because", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
    "Saturday", "Sunday", "January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December", "She", "Her", "His", "They",
    "Their", "From", "With", "Into", "Over", "Under", "However", "Meanwhile", "Suddenly",
    "Later", "Soon", "Today", "Tomorrow", "Yesterday", "Night", "Morning", "Evening",
    "Lisbon", "Paris", "London", "Rome", "Cairo", "Tokyo", "Berlin", "Madrid", "Maine",
  ]);
  const found = brief.match(/\b[A-Z][a-z]{2,}(?:\s[A-Z][a-z]{2,})?\b/g) || [];
  const names: string[] = [];
  for (const token of found) {
    if (skip.has(token) || skip.has(token.split(" ")[0])) continue;
    if (!names.includes(token)) names.push(token);
  }
  return names;
}

function extractRoles(brief: string): string[] {
  const roles: string[] = [];
  for (const match of brief.matchAll(ROLE_PATTERN)) {
    const role = match[1].replace(/\s+/g, " ").trim();
    if (role && !roles.includes(role)) roles.push(role);
  }
  return roles;
}

function extractPlace(brief: string): string {
  const proper = brief.match(/\b(?:in|at|near|outside|inside)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2})\b/);
  if (proper) return proper[1];
  const common = brief.match(/\b(?:in|at|near|inside|outside)\s+(?:a|an|the)\s+([a-z][^,.]{2,40}?)(?=,|\.| who| that| where| when|$)/i);
  if (common) return common[1].trim();
  const known = PLACE_WORDS.find(([pattern]) => pattern.test(brief));
  if (known) return known[1].toLowerCase();
  return "the city they know";
}

function makeName(seed: string, lean: "f" | "m" | "x", salt: number): string {
  const givenBank = lean === "f" ? FEMALE : lean === "m" ? MALE : [...FEMALE, ...MALE];
  const given = pick(givenBank, `${seed}:given:${salt}`);
  const family = pick(FAMILY, `${seed}:family:${salt}`);
  return `${given} ${family}`;
}

function sanitizeLocation(place: string): string {
  const cleaned = place.replace(/[^a-zA-Z\s]/g, " ").replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").slice(0, 4).join(" ");
  return (words || "THE ROOM").toUpperCase();
}

function cap(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function titleCase(cue: string): string {
  return cue.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function trimWords(text: string, max: number): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  if (words.length <= max) return words.join(" ");
  return `${words.slice(0, max).join(" ").replace(/[.,;:]$/, "")}…`;
}

function escapeReg(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isActionSentence(sentence: string): boolean {
  return /\b(walks|stands|sits|opens|closes|runs|turns|looks|watches|holds|enters|leaves|rises|falls|waits|crosses|lifts|steps|keeps|tries|follows|locks|packs)\b/i.test(sentence);
}

function clausesOf(brief: string): string[] {
  const parts = brief.split(/[.;]+/).map((part) => part.trim()).filter((part) => wordCount(part) >= 3);
  return parts.length ? parts : [brief];
}
