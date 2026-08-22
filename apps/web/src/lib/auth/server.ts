import { createNeonAuth } from "@neondatabase/auth/next/server";

/**
 * Neon Auth 服务端 SDK（Better Auth 代理）。
 * 未配置环境变量时返回 null，所有调用方走匿名 cookie 流程（收藏等功能自动隐藏）。
 */
export const auth = isAuthConfigured()
  ? createNeonAuth({
      baseUrl: process.env.NEON_AUTH_BASE_URL!,
      cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
    })
  : null;

export function isAuthConfigured(): boolean {
  return Boolean(process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET);
}

export interface SessionUser {
  id: string;
  email?: string;
  name?: string;
}

/** 读取当前请求的登录会话（无会话返回 null）。 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!auth) return null;
  try {
    const { data: session, error } = await auth.getSession();
    if (error || !session?.user) return null;
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    };
  } catch {
    // 认证服务不可达时按未登录处理，不阻断匿名主流程
    return null;
  }
}