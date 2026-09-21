import fs from "fs";
import path from "path";
import { invalidateReels, present, setAdultAttestation } from "@/lib/actions";
import { StudioError } from "@/lib/errors";
import { fail, json } from "@/lib/http";
import { projectDir, resolveInside } from "@/lib/paths";
import { clearRenderedMedia, readProject, saveProject } from "@/lib/store";
import type { CastMember } from "@/lib/types";
import { cueName, nowIso } from "@/lib/text";
import { readConsent, readPhoto } from "@/lib/uploads";
import { speakingCharacters } from "@/lib/shots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const project = readProject(id);
    if (!project.script?.approved) throw new StudioError("Approve the script before casting.");
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const next = setAdultAttestation(project, Boolean(body.adultCastAttested));
      if (!body.adultCastAttested) clearRenderedMedia(id);
      return json(present(saveProject(next)));
    }

    const form = await request.formData();
    const characterName = cueName(String(form.get("characterName") || ""));
    const speakers = speakingCharacters(project.script.scenes);
    if (!speakers.includes(characterName)) {
      throw new StudioError("That character does not speak in the approved script.");
    }
    const actorLegalName = String(form.get("actorLegalName") || "").replace(/\s+/g, " ").trim();
    const consentDate = String(form.get("consentDate") || "").trim();
    const attested = String(form.get("attested") || "") === "true";
    if (actorLegalName.length < 2 || actorLegalName.length > 80) {
      throw new StudioError("Enter the actor's legal name.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(consentDate)) {
      throw new StudioError("Enter the date on the signed consent letter.");
    }
    if (!attested) {
      throw new StudioError("Attest that the letter is signed by that actor, and that the actor is 18 or older.");
    }

    const existing = project.cast.find((member) => member.characterName === characterName);
    const memberId = existing?.id || crypto.randomUUID();
    const photo = form.get("photo");
    const consent = form.get("consent");
    let photoFile = existing?.photoFile || "";
    let consentFile = existing?.consentFile || "";
    let consentSha256 = existing?.consentSha256 || "";
    let consentOriginalName = existing?.consentOriginalName || "";

    if (photo instanceof File && photo.size > 0) {
      const stored = await readPhoto(photo);
      photoFile = path.posix.join("cast", memberId, `photo${stored.extension}`);
      writeUpload(id, photoFile, stored.bytes);
    }
    if (consent instanceof File && consent.size > 0) {
      const stored = await readConsent(consent);
      consentFile = path.posix.join("cast", memberId, `consent${stored.extension}`);
      consentSha256 = stored.sha256;
      consentOriginalName = stored.originalName;
      writeUpload(id, consentFile, stored.bytes);
    }
    if (!photoFile || !consentFile) {
      throw new StudioError("Each speaking part needs both a face photo and a signed consent letter.");
    }

    const member: CastMember = {
      id: memberId,
      characterName,
      actorLegalName,
      photoFile,
      consentFile,
      consentOriginalName,
      consentSha256,
      attested: true,
      consentDate,
      uploadedAt: nowIso(),
    };
    const cast = existing
      ? project.cast.map((item) => item.characterName === characterName ? member : item)
      : [...project.cast, member];
    const next = invalidateReels({ ...project, cast });
    clearRenderedMedia(id);
    return json(present(saveProject(next)));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const memberId = new URL(request.url).searchParams.get("member");
    if (!memberId) throw new StudioError("Missing cast member.");
    const project = readProject(id);
    const member = project.cast.find((item) => item.id === memberId);
    if (!member) throw new StudioError("That cast member is not on this picture.", 404);
    fs.rmSync(path.join(projectDir(id), "cast", member.id), { recursive: true, force: true });
    const next = invalidateReels({
      ...project,
      cast: project.cast.filter((item) => item.id !== memberId),
    });
    clearRenderedMedia(id);
    return json(present(saveProject(next)));
  } catch (error) {
    return fail(error);
  }
}

function writeUpload(id: string, relativePath: string, bytes: Buffer): void {
  const absolute = resolveInside(id, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, bytes);
}
