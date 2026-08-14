"use client";

import { createAuthClient } from "@neondatabase/auth/next";

/**
 * 轻量账号（Neon Auth / Better Auth）。
 * 未配置 AUTH_URL 时整体不可用（页面隐藏收藏/登录 UI）。
 */
const authClient = createAuthClient();

export type AuthStatus = "unconfigured" | "loading" | "anon" | "authed";

export interface AuthUser {
  name?: string | null;
  email?: string | null;
}

export interface AuthState {
  status: AuthStatus;
  user?: AuthUser;
}

export function isAuthConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_AUTH_URL);
}

/** 派生式会话状态：无 effect、无中间态写入。 */
export function useAuthState(): AuthState {
  const configured = isAuthConfigured();
  const session = authClient.useSession();
  if (!configured) return { status: "unconfigured" };
  if (session.isPending) return { status: "loading" };
  const user = session.data?.user;
  return user
    ? { status: "authed", user: { name: user.name, email: user.email } }
    : { status: "anon" };
}

/** 发送邮箱验证码（sign-in 类型）。 */
export async function requestSignIn(email: string): Promise<void> {
  const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
  if (error) throw new Error(error.message ?? "send_otp_failed");
}

/** 校验验证码并登录（失败抛错）。 */
export async function verifySignIn(email: string, code: string): Promise<void> {
  const { error } = await authClient.signIn.emailOtp({ email, otp: code.trim() });
  if (error) throw new Error(error.message ?? "verify_failed");
}

export async function signOut(): Promise<void> {
  await authClient.signOut();
}