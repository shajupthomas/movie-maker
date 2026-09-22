import { createHash } from "crypto";
import { StudioError } from "./errors";

const PHOTO_TYPES = new Map<string, string>([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

const CONSENT_TYPES = new Map<string, string>([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["application/pdf", ".pdf"],
  ["text/plain", ".txt"],
]);

export interface StoredUpload {
  bytes: Buffer;
  extension: string;
  sha256: string;
  originalName: string;
}

export async function readPhoto(file: File | null): Promise<StoredUpload> {
  return readUpload(file, PHOTO_TYPES, 8 * 1024 * 1024, "Upload a face photo as JPEG, PNG, or WebP.");
}

export async function readConsent(file: File | null): Promise<StoredUpload> {
  return readUpload(
    file,
    CONSENT_TYPES,
    12 * 1024 * 1024,
    "Upload the signed consent letter as PDF, text, JPEG, PNG, or WebP.",
  );
}

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readUpload(
  file: File | null,
  allowed: Map<string, string>,
  maxBytes: number,
  message: string,
): Promise<StoredUpload> {
  if (!file || file.size === 0) throw new StudioError(message);
  if (file.size > maxBytes) throw new StudioError("That file is too large.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = extensionFor(bytes, file.type, allowed);
  if (!extension) throw new StudioError(message);
  return {
    bytes,
    extension,
    sha256: sha256(bytes),
    originalName: (file.name || "upload").split(/[/\\]/).pop()?.slice(0, 120) || "upload",
  };
}

function extensionFor(bytes: Buffer, mime: string, allowed: Map<string, string>): string | null {
  const sniffed = sniff(bytes);
  if (!sniffed || !allowed.has(sniffed)) return null;
  if (mime && allowed.has(mime) && mime !== sniffed && !(mime === "image/jpg" && sniffed === "image/jpeg")) {
    if (sniffed !== mime) return null;
  }
  return allowed.get(sniffed) ?? null;
}

function sniff(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (bytes.length && !bytes.subarray(0, Math.min(bytes.length, 800)).includes(0)) return "text/plain";
  return null;
}
