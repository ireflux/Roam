import type { Position } from "@/lib/types";

export type AmapMouseEvent = { lnglat: { getLng(): number; getLat(): number }; originalEvent?: MouseEvent };
export type AmapOverlay = { on(event: string, listener: (event: AmapMouseEvent) => void): void; off?(event: string, listener: (event: AmapMouseEvent) => void): void; setMap(map: AmapMap | null): void; setPath?(path: Position[]): void; setPosition?(position: Position): void; setContent?(content: string): void; setOptions?(options: Record<string, unknown>): void; setVisible?(visible: boolean): void };
export type AmapLngLat = { getLng(): number; getLat(): number };
export type AmapMap = {
  on(event: string, listener: (event: AmapMouseEvent) => void): void;
  off(event: string, listener: (event: AmapMouseEvent) => void): void;
  add(overlays: AmapOverlay | AmapOverlay[]): void;
  remove(overlays: AmapOverlay | AmapOverlay[]): void;
  setFitView(overlays?: AmapOverlay[], immediately?: boolean, avoid?: number[], maxZoom?: number): void;
  setStatus(status: { dragEnable?: boolean }): void;
  setDefaultCursor(cursor: string): void;
  getZoom(): number;
  setZoomAndCenter(zoom: number, center: Position): void;
  setCenter(center: Position): void;
  resize(): void;
  destroy(): void;
  /** 地图容器 DOM（绘制事件挂载点）。 */
  getContainer(): HTMLElement;
  /** 像素坐标 → 经纬度（须传入 container 内相对坐标）。 */
  containerToLngLat(pos: Position): AmapLngLat;
};

export type AmapNamespace = {
  plugin(plugins: string[], callback: () => void): void;
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AmapMap;
  ToolBar: new () => AmapOverlay;
  Polyline: new (options: Record<string, unknown>) => AmapOverlay;
  Marker: new (options: Record<string, unknown>) => AmapOverlay;
  TileLayer: {
    Traffic: new (options?: Record<string, unknown>) => AmapOverlay;
  };
};

declare global {
  interface Window {
    AMap?: AmapNamespace;
    _AMapSecurityConfig?: { securityJsCode?: string; serviceHost?: string };
  }
}
