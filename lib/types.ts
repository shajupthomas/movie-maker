export const GENRES = [
  "Drama",
  "Thriller",
  "Science Fiction",
  "Romance",
  "Comedy",
  "Adventure",
  "Fantasy",
  "Mystery",
] as const;

export const TONES = ["Grounded", "Lyrical", "Tense", "Warm", "Dark", "Wry"] as const;

export type Genre = (typeof GENRES)[number];
export type Tone = (typeof TONES)[number];

export interface AgentTraceEntry {
  step: string;
  detail: string;
}

export interface DialogueLine {
  character: string;
  line: string;
  parenthetical?: string;
  extension?: string;
}

export interface Scene {
  id: string;
  number: number;
  heading: string;
  location: string;
  timeOfDay: string;
  interior: boolean;
  action: string;
  dialogue: DialogueLine[];
  durationSec: number;
}

export interface StoryDraft {
  version: number;
  text: string;
  approved: boolean;
  approvedAt?: string;
  notes?: string;
  trace: AgentTraceEntry[];
  updatedAt: string;
}

export interface ScriptDraft {
  version: number;
  text: string;
  scenes: Scene[];
  approved: boolean;
  approvedAt?: string;
  notes?: string;
  trace: AgentTraceEntry[];
  totalDurationSec: number;
  updatedAt: string;
}

export type CastSource = "person" | "generated";

export type FaceView =
  | "front"
  | "threeQuarterLeft"
  | "threeQuarterRight"
  | "profileLeft"
  | "profileRight";

export interface CastMember {
  id: string;
  characterName: string;
  source?: CastSource;
  actorLegalName: string;
  photoFile: string;
  consentFile: string;
  consentOriginalName: string;
  consentSha256: string;
  attested: boolean;
  consentDate: string;
  uploadedAt: string;
  identity?: string;
  views?: Partial<Record<FaceView, string>>;
}

export type ReelStatus =
  | "planned"
  | "rendering"
  | "ready"
  | "approved"
  | "changes_requested"
  | "failed";

export interface VideoPart {
  id: string;
  index: number;
  sceneNumbers: number[];
  sceneIds: string[];
  durationSec: number;
  status: ReelStatus;
  videoFile?: string;
  version: number;
  notes?: string;
  error?: string;
  updatedAt: string;
}

export interface FinalMovie {
  file: string;
  durationSec: number;
  createdAt: string;
  sizeBytes: number;
  consentLedger: ConsentLedgerEntry[];
}

export interface ConsentLedgerEntry {
  characterName: string;
  actorLegalName: string;
  consentSha256: string;
  consentDate: string;
  consentOriginalName: string;
}

export interface Project {
  id: string;
  title: string;
  brief: string;
  genre: Genre;
  tone: Tone;
  targetMinutes: number;
  adultCastAttested: boolean;
  story: StoryDraft | null;
  script: ScriptDraft | null;
  cast: CastMember[];
  parts: VideoPart[];
  finalMovie: FinalMovie | null;
  createdAt: string;
  updatedAt: string;
}

export interface StepState {
  id: "brief" | "story" | "script" | "cast" | "reels" | "picture";
  label: string;
  phase: "done" | "current" | "locked";
  hint: string;
}

export interface StudioPayload {
  project: Project;
  characters: string[];
  blockers: string[];
  assembleReady: boolean;
  steps: StepState[];
}

export interface CreateProjectInput {
  title: string;
  brief: string;
  genre: Genre;
  tone: Tone;
  targetMinutes: number;
}
