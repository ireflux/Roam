import * as React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { PublicTrip } from "@roam/core";
import { api, API_BASE_URL } from "@/lib/env";
import { BRAND } from "@/lib/theme";

/** 分享查看页：公开只读，在线加载（spec §6）。 */
export default function ShareScreen() {
  const { shareId } = useLocalSearchParams<{ shareId: string }>();
  const [trip, setTrip] = React.useState<PublicTrip | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!shareId) return;
    void api()
      .shareTrip(shareId)
      .then(setTrip)
      .catch(() => setError("无法加载该行程，请检查网络后重试"));
  }, [shareId]);

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
      <Text style={styles.footer}>在网页查看完整地图与回放：{API_BASE_URL}/t/{shareId}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fa" },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
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
  footer: { fontSize: 11, color: BRAND.inkSoft, textAlign: "center", paddingVertical: 12 },
});
