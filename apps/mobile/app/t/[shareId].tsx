import * as React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Marker } from "react-native-amap3d";
import { useLocalSearchParams } from "expo-router";
import type { Position, PublicTrip } from "@roam/core";
import { api } from "@/lib/env";
import { BRAND } from "@/lib/theme";
import { TripMap } from "@/map/TripMap";

/** 全路线点序列：按天顺序拼接各段几何（去重接缝点）。 */
function buildRoutePath(trip: PublicTrip): Position[] {
  const path: Position[] = [];
  const push = (p: Position) => {
    const last = path[path.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) path.push(p);
  };
  const stopsByDay = new Map<string, typeof trip.data.stops>();
  for (const s of [...trip.data.stops].sort((a, b) => a.order - b.order)) {
    const list = stopsByDay.get(s.dayId) ?? [];
    list.push(s);
    stopsByDay.set(s.dayId, list);
  }
  for (const day of trip.data.days) {
    const stops = stopsByDay.get(day.id) ?? [];
    for (let i = 0; i < stops.length - 1; i++) {
      const seg = trip.data.segments.find(
        (sg) =>
          (sg.fromStop === stops[i].id && sg.toStop === stops[i + 1].id) ||
          (sg.fromStop === stops[i + 1].id && sg.toStop === stops[i].id),
      );
      if (!seg) continue;
      const coords = seg.geometry.coordinates;
      // 统一为正向（from→当前站）；接缝重复点由 push 去重
      const ordered = seg.fromStop === stops[i].id ? coords : [...coords].reverse();
      for (const c of ordered) push(c);
    }
  }
  return path;
}

const PLAY_MS_PER_POINT = 24;
const PLAY_MAX_MS = 45_000;

/** 分享查看页：只读地图 + 按天卡片 + 全路线回放动画。 */
export default function ShareScreen() {
  const { shareId } = useLocalSearchParams<{ shareId: string }>();
  const [trip, setTrip] = React.useState<PublicTrip | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [head, setHead] = React.useState<Position | null>(null);
  const rafRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!shareId) return;
    void api()
      .shareTrip(shareId)
      .then(setTrip)
      .catch(() => setError("无法加载该行程，请检查网络后重试"));
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [shareId]);

  const routePath = React.useMemo(() => (trip ? buildRoutePath(trip) : []), [trip]);

  const onPlay = () => {
    if (playing || routePath.length < 2) return;
    setPlaying(true);
    const duration = Math.min(routePath.length * PLAY_MS_PER_POINT, PLAY_MAX_MS);
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const idx = Math.min(routePath.length - 1, Math.floor(t * (routePath.length - 1)));
      setHead(routePath[idx]);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setPlaying(false);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: BRAND.inkSoft }}>{error}</Text>
      </View>
    );
  }
  if (!trip) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={BRAND.primary} />
      </View>
    );
  }

  const stopOrder = new Map<string, number>();
  let n = 0;
  for (const day of trip.data.days) {
    for (const s of [...trip.data.stops].sort((a, b) => a.order - b.order)) {
      if (s.dayId === day.id) stopOrder.set(s.id, ++n);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapWrap}>
        <TripMap
          stops={trip.data.stops}
          segments={trip.data.segments}
          stopOrder={stopOrder}
          gestureLocked={false}
          initialCenter={routePath[0] ?? [116.397428, 39.90923]}
          initialZoom={11}
        />
        {head ? (
          <Marker position={{ latitude: head[1], longitude: head[0] }} zIndex={60}>
            <View style={styles.playhead}>
              <Text style={{ fontSize: 14 }}>🧭</Text>
            </View>
          </Marker>
        ) : null}
        <Pressable style={[styles.playBtn, playing && styles.playBtnActive]} onPress={onPlay}>
          <Text style={styles.playBtnText}>{playing ? "回放中…" : "▶ 回放全程"}</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{trip.title || "未命名行程"}</Text>
        {trip.data.days.map((day, di) => {
          const stops = trip.data.stops
            .filter((s) => s.dayId === day.id)
            .sort((a, b) => a.order - b.order);
          return (
            <View key={day.id} style={styles.dayCard}>
              <Text style={styles.dayName}>{`${di + 1} · ${day.name || "未命名"}`}</Text>
              {stops.length === 0 ? (
                <Text style={styles.empty}>暂无地点</Text>
              ) : (
                stops.map((s) => (
                  <View key={s.id} style={styles.stopRow}>
                    <Text style={styles.stopDot}>•</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.stopName}>{s.name}</Text>
                      {s.note ? <Text style={styles.stopNote}>{s.note}</Text> : null}
                    </View>
                  </View>
                ))
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fa" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  mapWrap: { height: 320 },
  playBtn: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    backgroundColor: BRAND.primary,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 9,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  playBtnActive: { opacity: 0.7 },
  playBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  playhead: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: BRAND.primary,
  },
  list: { flex: 1 },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: "800", color: BRAND.ink },
  dayCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    gap: 8,
  },
  dayName: { fontSize: 15, fontWeight: "700", color: BRAND.primary },
  empty: { fontSize: 13, color: BRAND.inkSoft },
  stopRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  stopDot: { color: BRAND.primary, lineHeight: 20 },
  stopName: { fontSize: 14, color: BRAND.ink, fontWeight: "500" },
  stopNote: { fontSize: 12, color: BRAND.inkSoft, marginTop: 1 },
});
