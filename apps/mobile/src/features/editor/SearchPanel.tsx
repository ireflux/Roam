import * as React from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "@/lib/env";
import { BRAND } from "@/lib/theme";

export interface SearchHit {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
}

/** POI 搜索面板：高德 Web Service 经服务端代理（key 不落端上）。 */
export function SearchPanel(props: {
  onSelect: (hit: SearchHit) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const hasQuery = query.trim().length > 0;
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // 300ms 防抖搜索；空词清空结果
  React.useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      setError(null);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      void api()
        .searchPlaces(q)
        .then((rows) => {
          setHits(rows as SearchHit[]);
          setError(null);
        })
        .catch(() => setHits([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <View style={styles.wrap}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="搜索地点，如：西湖"
          placeholderTextColor={BRAND.inkSoft}
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
        <Pressable onPress={props.onClose} hitSlop={6}>
          <Text style={styles.cancel}>取消</Text>
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 12 }} color={BRAND.primary} />
      ) : error ? (
        <Text style={styles.empty}>搜索失败，请检查网络</Text>
      ) : (
        <FlatList
          data={hits}
          keyExtractor={(h) => h.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={hasQuery ? <Text style={styles.empty}>没有找到相关地点</Text> : undefined}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => props.onSelect(item)}
            >
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              {item.address ? (
                <Text style={styles.address} numberOfLines={1}>
                  {item.address}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    zIndex: 50,
    paddingTop: 8,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.border,
  },
  input: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#f4f4f5",
    paddingHorizontal: 12,
    fontSize: 14,
    color: BRAND.ink,
  },
  cancel: { color: BRAND.primary, fontWeight: "600", fontSize: 14 },
  row: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.border },
  rowPressed: { backgroundColor: BRAND.primarySoft },
  name: { fontSize: 15, color: BRAND.ink, fontWeight: "500" },
  address: { fontSize: 12, color: BRAND.inkSoft, marginTop: 2 },
  empty: { textAlign: "center", color: BRAND.inkSoft, marginTop: 20, fontSize: 13 },
});
