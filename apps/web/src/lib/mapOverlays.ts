import type { AmapMap, AmapOverlay } from "@/lib/mapTypes";
import type { Position } from "@roam/core";

// 段 id → 渲染中的 Polyline 注册表。
// 顶点拖拽时指令式更新单条路径，避免每帧写 store 导致整幅 overlay 重建、被拖 marker 销毁。
const segmentLines = new WeakMap<AmapMap, Map<string, AmapOverlay>>();

export function setSegmentLine(map: AmapMap, segId: string, line: AmapOverlay): void {
  let lines = segmentLines.get(map);
  if (!lines) {
    lines = new Map();
    segmentLines.set(map, lines);
  }
  lines.set(segId, line);
}

export function updateSegmentLinePath(map: AmapMap, segId: string, path: Position[]): void {
  const line = segmentLines.get(map)?.get(segId);
  if (line?.setPath) line.setPath(path);
}