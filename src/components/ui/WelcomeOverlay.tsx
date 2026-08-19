"use client";

import { useEffect, useState } from "react";
import { MapPin, PenLine, ArrowRight, Sparkles } from "lucide-react";

interface WelcomeOverlayProps {
  onDone: () => void;
}

const STEPS = [
  {
    icon: MapPin,
    title: "地点之间，自动连线",
    desc: "添加两个以上地点，它们之间会自动规划驾车、步行或公交路线。",
  },
  {
    icon: PenLine,
    title: "自由手绘 + 微调",
    desc: "点「绘制」在图上直接画路线；切「改线」拖动紫色圆点，就能把路线拉到想要的位置。",
  },
];

/** L0 欢迎层：首次进入编辑器展示的 2 步轻量引导，可跳过，只出现一次。 */
export default function WelcomeOverlay({ onDone }: WelcomeOverlayProps) {
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);

  // 是否存在取决于 localStorage（useOnboarding），首帧必须与 SSR HTML 一致，
  // 否则 hydration mismatch。mount 后再揭晓——新用户会看到，老用户也不会闪。
  // mounted 门是此处有意为之，set-state-in-effect 规则不适用。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  if (!mounted) return null;

  const current = STEPS[step];
  const CurrentIcon = current.icon;
  const last = step === STEPS.length - 1;

  return (
    <div
      data-testid="welcome-overlay"
      className="anim-fade-in absolute inset-0 z-40 flex items-center justify-center bg-ink/50 p-6 backdrop-blur-sm"
      onClick={(e) => e.currentTarget === e.target && onDone()}
    >
      <div className="anim-scale-in w-full max-w-sm overflow-hidden rounded-3xl border border-line bg-surface shadow-float-lg">
        <div className="relative px-6 pb-6 pt-8">
          {/* 顶部装饰：旅程轨迹线（签名元素） */}
          <JourneyMark className="absolute right-0 top-0" />
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <CurrentIcon size={24} strokeWidth={1.75} aria-hidden />
          </div>
          <h2 className="mt-4 text-lg font-semibold tracking-tight">{current.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{current.desc}</p>
          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={onDone}
              className="rounded-full px-3 py-2 text-sm text-faint transition-interact hover:text-muted"
            >
              跳过
            </button>
            <button
              onClick={() => (last ? onDone() : setStep(step + 1))}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2 text-sm font-medium text-white shadow-sm transition-interact hover:bg-brand-deep active:scale-95"
            >
              {last ? "开始规划" : "下一步"}
              {last ? <Sparkles size={15} /> : <ArrowRight size={15} />}
            </button>
          </div>
        </div>
        <div className="flex items-end justify-between border-t border-line bg-surface-soft px-6 py-3">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? "w-5 bg-brand" : "w-1.5 bg-line-strong"}`}
              />
            ))}
          </div>
          <span className="text-[11px] tracking-wide text-faint">
            {step + 1} / {STEPS.length}
          </span>
        </div>
      </div>
    </div>
  );
}

/** 迷你旅程轨迹：一条弯折的路线 + 两个路点（签名元素的浓缩版）。 */
function JourneyMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="120"
      height="64"
      viewBox="0 0 120 64"
      fill="none"
      aria-hidden
    >
      <path
        d="M4 56 C 30 56, 26 20, 56 20 S 92 44, 116 12"
        stroke="var(--brand)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 6"
        className="anim-route-dash"
        opacity="0.55"
      />
      <circle cx="56" cy="20" r="5" fill="var(--surface)" stroke="var(--brand)" strokeWidth="2" />
      <circle cx="116" cy="12" r="5" fill="var(--gold)" />
      <circle cx="24" cy="46" r="3" fill="var(--line-strong)" />
    </svg>
  );
}