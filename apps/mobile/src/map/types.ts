import type { TripSegment, TripStop } from "@roam/core";

export type LatLng = [number, number];

/**
 * 地图适配层（spec §7 / 附录 B）：业务代码只依赖此接口，
 * 底层实现可在 react-native-amap3d 与自封装原生模块之间整体替换。
 */
export interface MapAdapter {
  setCamera(center: LatLng, zoom: number): void;
  /** 增量渲染停留点；selectedId 高亮。 */
  renderStops(stops: TripStop[], selectedId?: string | null): void;
  /** 渲染分段折线：mode 决定颜色，parts 子段（公交实线+步行虚线）、degraded 虚线样式由实现处理。 */
  renderSegments(segments: TripSegment[]): void;
  /** 锁定/解锁单指拖动（绘制模式用）；双指缩放始终放行。 */
  setGestureLock(locked: boolean): void;
  onTap(cb: (latlng: LatLng) => void): () => void;
  onStopPress(cb: (stopId: string) => void): () => void;
  onSegmentPress(cb: (segmentId: string) => void): () => void;
  /**
   * 自由绘制触摸流：进入绘制模式后持续回调采样点，返回解绑函数。
   * M3 实现；当前返回 noop 解绑并抛出未实现错误以尽早暴露调用路径。
   */
  drawStream(cb: (points: LatLng[]) => void): () => void;
  /** 命中测试：latlng 半径 radiusM 内的最近停留点 id；无则 null。 */
  hitTestStop(latlng: LatLng, radiusM: number): string | null;
}
