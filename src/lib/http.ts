import { NextResponse } from "next/server";

interface JsonBodyResult {
  body: unknown;
  response: NextResponse | null;
}

/**
 * 读取并解析 JSON body，按字符串字节数限制防超大 payload。
 * 比仅检查 content-length 头可靠（chunked 编码无该头时可绕过）。
 */
export async function parseJsonBody(req: Request, maxBytes = 256_000): Promise<JsonBodyResult> {
  const text = await req.text();
  if (text.length > maxBytes) {
    return { body: undefined, response: NextResponse.json({ error: "payload_too_large" }, { status: 413 }) };
  }
  try {
    return { body: JSON.parse(text), response: null };
  } catch {
    return { body: undefined, response: NextResponse.json({ error: "invalid_json" }, { status: 400 }) };
  }
}