import { Car, Footprints, Bike, TrainFront, type LucideIcon } from "lucide-react";
import type { Mode } from "@roam/core";

/** UI 中使用的地图出行方式图标（React 组件）。 */
export const MODE_ICON_COMPONENT: Record<Mode, LucideIcon> = {
  driving: Car,
  walking: Footprints,
  cycling: Bike,
  transit: TrainFront,
};

/** AMap 覆盖物 HTML 内容使用的小号内联 SVG（Marker content 是字符串，无法放 React 组件）。 */
const MODE_SVG_PATH: Record<Mode, string> = {
  driving:
    '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  walking:
    '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 0 1-2 2Z"/><path d="M4 20v-2a0 0 0 0 1 0 0"/><path d="M20 16v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 2 14 3.8 14 5.5c0 3.11 2 5.66 2 8.68V16a2 2 0 0 0 2 2Z"/><path d="M20 22v-2a0 0 0 0 0 0 0"/>',
  cycling:
    '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
  transit:
    '<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/>',
};

/** 地图线段方式标签徽章里的小图标。 */
export function modeIconSvg(mode: Mode, size = 12): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${MODE_SVG_PATH[mode]}</svg>`;
}