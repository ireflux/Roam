// 客户端导航期间的即时反馈骨架（编辑器数据在服务端读取，Neon 冷启动时首屏会等待数秒）。
export default function EditorLoading() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-paper">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <div className="h-3.5 w-32 animate-pulse rounded-full bg-line" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-80 shrink-0 flex-col gap-3 border-r border-line p-4 md:flex">
          <div className="h-4 w-24 animate-pulse rounded-full bg-line" />
          <div className="h-24 animate-pulse rounded-xl bg-line/60" />
          <div className="h-24 animate-pulse rounded-xl bg-line/60" />
        </div>
        <div className="flex min-w-0 flex-1 animate-pulse items-center justify-center bg-surface">
          <div className="text-sm text-faint">加载路线中…</div>
        </div>
      </div>
    </div>
  );
}