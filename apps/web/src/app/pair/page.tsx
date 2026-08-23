import Link from "next/link";
import { getSessionUser } from "@/lib/auth/server";
import { PairForm } from "./pair-form";

export const dynamic = "force-dynamic";

/** 设备配对确认页：App「设置 → 绑定账号」展示的 6 位配对码在此输入。 */
export default async function PairPage() {
  const user = await getSessionUser();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0E7A5C]">绑定移动设备</h1>
        <p className="mt-2 text-sm text-zinc-500">
          在 App「设置 → 绑定账号」中生成 6 位配对码，在此输入完成绑定。
          绑定后 App 与本账号共享行程，并可跨设备同步。
        </p>
      </div>
      {user ? (
        <PairForm />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
          请先登录本网站，再回到此页面输入配对码。
          <Link href="/" className="ml-1 font-semibold text-[#0E7A5C] underline">
            去登录
          </Link>
        </div>
      )}
    </main>
  );
}
