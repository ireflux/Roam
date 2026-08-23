import * as React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BRAND } from "@/lib/theme";
import { API_BASE_URL } from "@/lib/env";
import { resetIdentity } from "@/services/session";
import { syncNow } from "@/services/sync";

/** 设置页：同步状态 / 设备身份管理。登录绑定在 M5 接入（配对码流程）。 */
export default function SettingsScreen() {
  const [syncing, setSyncing] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<string | null>(null);

  const onSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const { pushed, conflicts, pulled } = await syncNow();
      setLastResult(
        `推送 ${pushed} · 拉取 ${pulled}${conflicts > 0 ? ` · ${conflicts} 个冲突待处理` : ""}`,
      );
    } finally {
      setSyncing(false);
    }
  };

  const onReset = () => {
    Alert.alert("重置设备身份", "将生成新的匿名身份并重新绑定本机数据，确定继续？", [
      { text: "取消", style: "cancel" },
      {
        text: "重置",
        style: "destructive",
        onPress: () => {
          void resetIdentity().catch(() => {});
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>服务端</Text>
        <Text style={styles.mono}>{API_BASE_URL || "未配置 EXPO_PUBLIC_API_BASE_URL"}</Text>
      </View>

      <Pressable style={[styles.card, syncing && styles.disabled]} onPress={() => void onSync()}>
        <Text style={styles.cardTitle}>立即同步</Text>
        <Text style={styles.desc}>{lastResult ?? "把本地改动推送到服务端"}</Text>
      </Pressable>

      <Pressable style={styles.card} onPress={onReset}>
        <Text style={[styles.cardTitle, { color: "#b91c1c" }]}>重置设备身份</Text>
        <Text style={styles.desc}>登出当前匿名身份并生成新的</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fa" },
  content: { padding: 12, gap: 10 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    gap: 4,
  },
  disabled: { opacity: 0.5 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: BRAND.ink },
  desc: { fontSize: 12, color: BRAND.inkSoft },
  mono: { fontSize: 12, color: BRAND.ink },
});
