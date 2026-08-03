"use client";

import { Map as MaplibreMap, NavigationControl } from "maplibre-gl";
import { useEffect, useRef } from "react";

const DEFAULT_STYLE = "https://tiles.openfreemap.org/styles/liberty";
export const DEFAULT_CENTER: [number, number] = [104.1954, 35.8617];
export const DEFAULT_ZOOM = 4;

export interface MapViewHandle {
  getMap: () => MaplibreMap | null;
}

export default function MapView({
  className,
  onLoad,
}: {
  className?: string;
  onLoad?: (map: MaplibreMap) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const onLoadRef = useRef(onLoad);

  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = new MaplibreMap({
      container: containerRef.current,
      style: DEFAULT_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    });
    map.addControl(new NavigationControl(), "top-right");
    mapRef.current = map;
    map.on("load", () => onLoadRef.current?.(map));
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className={className} />;
}
