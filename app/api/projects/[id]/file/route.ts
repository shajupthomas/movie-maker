import fs from "fs";
import { Readable } from "stream";
import { StudioError } from "@/lib/errors";
import { fail } from "@/lib/http";
import { resolveInside } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
};

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const relative = url.searchParams.get("path") || "";
    if (!/^(cast|reels|final)\/[a-zA-Z0-9._/-]+$/.test(relative) || relative.includes("..")) {
      throw new StudioError("That file is not available.", 404);
    }
    const absolute = resolveInside(id, relative);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new StudioError("That file is not available.", 404);
    }
    const download = url.searchParams.get("download") === "1";
    const filename = relative.split("/").pop() || "file";
    return fileResponse(absolute, request, download ? filename : undefined);
  } catch (error) {
    return fail(error);
  }
}

function fileResponse(absolute: string, request: Request, downloadName?: string): Response {
  const stat = fs.statSync(absolute);
  const extension = absolute.slice(absolute.lastIndexOf(".")).toLowerCase();
  const type = TYPES[extension] || "application/octet-stream";
  const range = request.headers.get("range");
  if (range && type === "video/mp4") {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    if (!match) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    }
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : stat.size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= stat.size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    }
    const capped = Math.min(end, stat.size - 1);
    const stream = fs.createReadStream(absolute, { start, end: capped });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": type,
        "Content-Length": String(capped - start + 1),
        "Content-Range": `bytes ${start}-${capped}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      },
    });
  }
  const stream = fs.createReadStream(absolute);
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Content-Length": String(stat.size),
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  };
  if (downloadName) headers["Content-Disposition"] = `attachment; filename="${downloadName.replace(/"/g, "")}"`;
  return new Response(Readable.toWeb(stream) as ReadableStream, { headers });
}
