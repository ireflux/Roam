import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

/** Neon Auth 代理：把 better-auth 客户端请求转发到托管认证服务。未配置时整体 404。 */
export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (!auth) return NextResponse.json({ error: "auth_not_configured" }, { status: 404 });
  return auth.handler().GET(request, ctx);
}

export async function POST(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (!auth) return NextResponse.json({ error: "auth_not_configured" }, { status: 404 });
  return auth.handler().POST(request, ctx);
}