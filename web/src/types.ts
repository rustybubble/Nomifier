// Shared app types. Wire shapes mirror contracts/api.md (plan §5); Nomi shapes come from vendor/nomi/ts.
import type {
  Condition,
  Contribution,
  ExplanationLine,
  MedicationType,
  Persona,
  Product,
  TermTables,
  Tier,
  TriggeredHardStop,
  Unii,
} from "@nomi/ts/index";

export type {
  Condition,
  MedicationType,
  Persona,
  Product,
  TermTables,
  Tier,
  Unii,
};

// ---------- /ws/scan ----------
export type TrackStatus = "named" | "family" | "unknown" | "pending";

export interface Track {
  id: number;
  box: [number, number, number, number]; // x1, y1, x2, y2 in frame pixels
  status: TrackStatus;
  product_id: string | null; // ndc11
  family: string | null;
  similarity: number;
  source?: "vision" | "barcode";
  age: number;
}

export interface FrameHeader {
  type: "frame";
  frame_id: number;
  w: number;
  h: number;
  ts: number;
}

export interface TracksMsg {
  type: "tracks";
  frame_id: number;
  proc_ms: number;
  fps: number;
  dropped?: number;
  tracks: Track[];
}

export interface CropMsg {
  type: "crop";
  track_id: number;
  crop_url: string;
}

export interface ErrorMsg {
  type: "error";
  frame_id?: number;
  message?: string;
}

export type ServerMsg = TracksMsg | CropMsg | ErrorMsg;

export interface PinMsg {
  type: "pin";
  track_id: number;
  product_id: string;
}

export interface CropRequestMsg {
  type: "crop_request";
  track_id: number;
}

// ---------- On-device profile (never sent anywhere) ----------
export interface UserProfile {
  id: string;
  name: string;
  persona: Persona;
  conditions: Condition[];
  medication_types: MedicationType[];
}

// The picker offers only what the demo term table has rows for (plan §5).
export const PROFILE_SCOPE = {
  personas: ["adult_18_64", "adult_65_plus"] as Persona[],
  conditions: [
    "hypertension",
    "kidney_disease",
    "glaucoma",
    "enlarged_prostate",
  ] as Condition[],
  medication_types: ["anticoagulants"] as MedicationType[],
};

// ---------- Static data files (/data/*.json) ----------
export type Templates = Record<string, string>; // "<dimension>_<low|moderate|high>" -> text with {ingredient}
export type Questions = Record<string, string[]>; // "<dimension>" -> questions with {ingredient}
export type LabelStatus = Record<
  string,
  {
    status: "ok" | "label_updated" | "recall";
    url?: string;
    checked_at?: string;
  }
>;
export type Families = Record<string, string[]>; // family -> ndc11[]

export interface AppData {
  products: Product[];
  productsByNdc: Map<string, Product>;
  termTables: TermTables;
  rated: Set<Unii>;
  templates: Templates;
  questions: Questions;
  labelStatus: LabelStatus;
  families: Families;
}

// ---------- Scoring results ----------
export interface Scored {
  status: "scored";
  score: number;
  tier: Tier;
  contributions: Contribution[];
  hard_stops_triggered: TriggeredHardStop[];
  explanation: ExplanationLine[];
}

export interface Unrated {
  status: "unrated";
  missing: Unii[];
}

export type ScoreResult = Scored | Unrated;
