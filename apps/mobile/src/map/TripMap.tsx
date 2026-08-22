import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import { MapView, Marker, Polyline } from "react-native-amap3d";
import type { LatLng } from "react-native-amap3d";
import type { Position, TripSegment, TripStop } from "@roam/core";
import { SEGMENT_COLORS, BRAND } from "@/lib/theme";

export interface TripMapProps {
  stops: TripStop[];
  segments: TripSegment[];
  /** 停留点显示序号（按天内顺序）。 */
  stopOrder: Map<string, number>;
  selectedStopId?: string | null;
  selectedSegId?: string | null;
  gestureLocked: boolean;
  initialCenter: Position;
  initialZoom: number;
  onTap?: (latlng: [number, number]) => void;
  onStopPress?: (stopId: string) => void;
  onSegmentPress?: (segmentId: string) => void;
}

/**
 * 高德地图渲染层（amap3d 实现）。业务屏幕只依赖本组件的 props 契约；
 * 更换为自封装原生模块时仅需重写此文件（spec §7.1 阶段 2）。
 */
export function TripMap(props: TripMapProps) {
  const {
    stops,
    segments,
    stopOrder,
    selectedStopId,
    selectedSegId,
    gestureLocked,
    initialCenter,
    initialZoom,
    onTap,
    onStopPress,
    onSegmentPress,
  } = props;

  const center: LatLng = { latitude: initialCenter[1], longitude: initialCenter[0] };

  return (
    <MapView
      style={StyleSheet.absoluteFill}
      initialCameraPosition={{ target: center, zoom: initialZoom }}
      myLocationEnabled={false}
      // 绘制/改线时锁单指拖动，保留双指缩放与旋转
      scrollGesturesEnabled={!gestureLocked}
      onPress={(event) => {
        const p = event.nativeEvent;
        if (p && typeof p.latitude === "number") {
          onTap?.([p.longitude, p.latitude]);
        }
      }}
    >
      {segments.flatMap((seg) => {
        const color = seg.degraded ? SEGMENT_COLORS.degraded : SEGMENT_COLORS[seg.mode];
        const selected = seg.id === selectedSegId;
        const width = selected ? 8 : seg.kind === "freehand" ? 5 : 6;
        const dotted = Boolean(seg.degraded);
        const lines: React.ReactNode[] = [];
        if (seg.parts && seg.parts.length > 0) {
          // 公交段：公交实线 + 步行虚线子段分别渲染
          for (const [i, part] of seg.parts.entries()) {
            lines.push(
              <Polyline
                key={`${seg.id}-p${i}`}
                points={part.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))}
                width={part.kind === "walking" ? width - 2 : width}
                color={part.kind === "walking" ? SEGMENT_COLORS.walking : color}
                dotted={part.kind === "walking"}
                zIndex={selected ? 30 : 20}
                onPress={() => onSegmentPress?.(seg.id)}
              />,
            );
          }
        } else {
          lines.push(
            <Polyline
              key={seg.id}
              points={seg.geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))}
              width={width}
              color={color}
              dotted={dotted}
              zIndex={selected ? 30 : 20}
              onPress={() => onSegmentPress?.(seg.id)}
            />,
          );
        }
        return lines;
      })}
      {stops.map((stop) => {
        const selected = stop.id === selectedStopId;
        return (
          <Marker
            key={stop.id}
            position={{ latitude: stop.lat, longitude: stop.lng }}
            zIndex={40}
            onPress={() => onStopPress?.(stop.id)}
          >
            <View style={[styles.badge, selected && styles.badgeSelected]}>
              <Text style={[styles.badgeText, selected && styles.badgeTextSelected]}>
                {stopOrder.get(stop.id) ?? "?"}
              </Text>
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: BRAND.primary,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeSelected: {
    backgroundColor: BRAND.primary,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: BRAND.primary,
  },
  badgeTextSelected: {
    color: "#fff",
  },
});
