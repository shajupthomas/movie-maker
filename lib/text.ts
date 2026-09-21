export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pick<T>(items: readonly T[], seed: string): T {
  if (!items.length) {
    throw new Error("Cannot pick from an empty list.");
  }
  return items[hashString(seed) % items.length];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function sentences(text: string): string[] {
  const parts = text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function ensurePeriod(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

const STOP = new Set([
  "about", "after", "again", "against", "before", "being", "between", "could",
  "every", "from", "have", "into", "just", "more", "only", "other", "over",
  "some", "than", "that", "their", "them", "then", "there", "these", "they",
  "this", "those", "through", "until", "very", "were", "what", "when", "where",
  "which", "while", "with", "would", "your", "film", "story", "movie", "scene",
]);

export function notableWord(text: string): string {
  const words = text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || [];
  const ranked = words.filter((word) => !STOP.has(word));
  ranked.sort((a, b) => b.length - a.length || a.localeCompare(b));
  return ranked[0] || "truth";
}

export function titleCaseName(cue: string): string {
  return cue
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function cueName(name: string): string {
  return name.replace(/\s+/g, " ").trim().toUpperCase();
}

export function chunks(text: string, maxChars: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return [];
  const out: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      out.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) out.push(current);
  return out;
}
