"use client";

import { useState } from "react";

interface WelcomeOverlayProps {
  onDone: () => void;
}

const STEPS = [
  {
    emoji: "📍",
    title: "地点之间，自动连线",
    desc: "添加两个以上地点，它们之间会自动规划驾车、步行或公交路线。",
  },
  {
    emoji: "🖊️",
    title: "自由手绘 + 微调",
    desc: "点「绘制」在图上直接画路线；切「改线」拖动紫色圆点，就能把路线拉到想要的位置。",
  },
];

/** L0 欢迎层：首次进入编辑器展示的 2 步轻量引导，可跳过，只出现一次。 */
export default function WelcomeOverlay({ onDone }: WelcomeOverlayProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  return (
    <div
      data-testid="welcome-overlay"
      className="absolute inset-0 z-40 flex items-center justify-center bg-zinc-950/50 p-6 backdrop-blur-sm"
      onClick={(e) => e.currentTarget === e.target && onDone()}
    >
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="text-center text-4xl">{current.emoji}</div>
        <h2 className="mt-3 text-center text-lg font-semibold dark:text-zinc-100">{current.title}</h2>
        <p className="mt-2 text-center text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          {current.desc}
        </p>
        <div className="mt-5 flex items-center justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? "w-4 bg-emerald-600" : "w-1.5 bg-zinc-300 dark:bg-zinc-700"}`}
            />
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={onDone}
            className="text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            跳过
          </button>
          <button
            onClick={() => (step < STEPS.length - 1 ? setStep(step + 1) : onDone())}
            className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white shadow hover:bg-emerald-700"
          >
            {step < STEPS.length - 1 ? "下一步" : "开始规划"}
          </button>
        </div>
      </div>
    </div>
  );
}