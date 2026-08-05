import { NextResponse } from "next/server";

export function requestTooLarge(request: Request, maxBytes = 256_000): NextResponse | null {
  const length = Number(request.headers.get("content-length") ?? 0);
  return Number.isFinite(length) && length > maxBytes
    ? NextResponse.json({ error: "payload_too_large" }, { status: 413 })
    : null;
}
