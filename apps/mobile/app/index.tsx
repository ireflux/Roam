import * as React from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import type { Trip } from "@roam/core";
import { BRAND } from "@/lib/theme";
import { tripDb } from "@/services/db";
import { useTripStore } from "@/store/useTripStore";

/** 首页：新建行程 + 本地行程列表（本地优先，离线可用）。 */
export default function HomeScreen() {
  const router = useRouter();
  const [trips, setTrips] = React.useState<Trip[]>([]);
  const [draft, setDraft] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const createLocal = useTripStore((s) => s.createLocal);

  const refresh = React.useCallback(() => {
    void tripDb.list().then(setTrips);
  }, []);

  useFocusEffect(refresh);

  const onCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const id = await createLocal(draft.trim() || undefined);
      setDraft("");
      router.push(`/editor/${id}`);
    } finally {
      setCreating(false);
    }
  };

  const onOpen = (trip: Trip) => {
    router.push(`/editor/${trip.id}`);
  };

  const onDelete = (trip: Trip) => {
    Alert.alert("删除行程", `确定删除「${trip.title || "未命名"}」？`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => {
          void tripDb.softDelete(trip.id).then(() => {
            void tripDb.list().then(setTrips);
          });
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.createRow}>
        <TextInput
          style={styles.input}
          placeholder="给行程起个名字（可留空）"
          placeholderTextColor={BRAND.inkSoft}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => void onCreate()}
        />
        <Pressable style={[styles.button, creating && styles.buttonDisabled]} onPress={() => void onCreate()}>
          <Text style={styles.buttonText}>新建</Text>
        </Pressable>
      </View>

      <FlatList
        data={trips}
        keyExtractor={(t) => t.id}
        contentContainerStyle={trips.length === 0 ? styles.emptyWrap : styles.list}
        ListEmptyComponent={<Text style={styles.empty}>还没有行程，新建一个开始规划吧</Text>}
        renderItem={({ item }) => {
          const stopCount = item.data.stops.length;
          const dayCount = item.data.days.length;
          return (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => onOpen(item)}
              onLongPress={() => onDelete(item)}
            >
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title || "未命名行程"}
                </Text>
                <Text style={styles.cardMeta}>
                  {dayCount} 天 · {stopCount} 个地点
                  {item.shareId ? "" : " · 未同步"}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fa" },
  createRow: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.border,
  },
  input: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
    paddingHorizontal: 12,
    fontSize: 15,
    color: BRAND.ink,
  },
  button: {
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: BRAND.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  list: { padding: 12, gap: 8 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: BRAND.inkSoft, fontSize: 14 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  cardPressed: { backgroundColor: BRAND.primarySoft },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 16, fontWeight: "600", color: BRAND.ink },
  cardMeta: { fontSize: 12, color: BRAND.inkSoft },
  chevron: { fontSize: 22, color: BRAND.inkSoft, marginLeft: 8 },
});
