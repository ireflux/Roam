import { NextResponse } from "next/server";

interface JsonBodyResult {
  body: unknown;
  response: NextResponse | null;
}

/**
 * 流式读取 body 并限制最大字节数：
 * - 先查 content-length 头快速拒绝（chunked 编码无该头时兜底走流式上限）；
 * - 逐块累积，一旦超过 maxBytes 立即取消读取，避免超大 payload 占满内存。
 * 返回 null 表示超过上限（调用方返回 413）。
 */
async function readBodyText(req: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const body = req.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export async function parseJsonBody(req: Request, maxBytes = 256_000): Promise<JsonBodyResult> {
  const text = await readBodyText(req, maxBytes);
  if (text === null) {
    return { body: undefined, response: NextResponse.json({ error: "payload_too_large" }, { status: 413 }) };
  }
  try {
    return { body: JSON.parse(text), response: null };
  } catch {
    return { body: undefined, response: NextResponse.json({ error: "invalid_json" }, { status: 400 }) };
  }
}
