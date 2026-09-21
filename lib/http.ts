import { NextResponse } from "next/server";
import { StudioError } from "./errors";
import type { StudioPayload } from "./types";

export function json(payload: StudioPayload | Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function fail(error: unknown): NextResponse {
  const status = error instanceof StudioError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Something went wrong.";
  if (!(error instanceof StudioError)) console.error(error);
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
