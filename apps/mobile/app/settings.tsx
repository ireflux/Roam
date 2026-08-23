import * as React from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BRAND } from "@/lib/theme";
import { API_BASE_URL } from "@/lib/env";
import { api } from "@/lib/env";
import { resetIdentity } from "@/services/session";
import { syncNow } from "@/services/sync";

/** 设置页：同步 / 设备身份 / 账号绑定（配对码流程，spec §9）。 */
export default function SettingsScreen() {
  const [syncing, setSyncing] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<string | null>(null);
  const [pairCode, setPairCode] = React.useState<string | null>(null);
  const [pairBusy, setPairBusy] = React.useState(false);

  const onSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const { pushed, conflicts, pulled } = await syncNow();
      setLastResult(`推送 ${pushed} · 拉取 ${pulled}${conflicts > 0 ? ` · ${conflicts} 个冲突待处理` : ""}`);
    } finally {
      setSyncing(false);
    }
  };

  /** 生成一次性配对码：用户在已登录的网页 /pair 输入完成绑定。 */
  const onCreatePair = async () => {
    if (pairBusy) return;
    setPairBusy(true);
    try {
      const { code, expiresAt } = await api().createDevicePair();
      const minutes = Math.max(1, Math.round((Date.parse(expiresAt) - Date.now()) / 60000));
      setPairCode(code);
      Alert.alert(
        "配对码已生成",
        `在已登录的电脑/手机浏览器打开\n${API_BASE_URL}/pair\n输入配对码完成绑定（${minutes} 分钟内有效）。`,
      );
    } catch (err) {
      const status = (err as { status?: number }).status;
      Alert.alert(status === 401 ? "设备身份未就绪" : "生成失败", "请检查网络后重试");
    } finally {
      setPairBusy(false);
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
          setPairCode(null);
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
        <Text style={styles.desc}>{lastResult ?? "把本地改动推送到服务端并拉取更新"}</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>绑定账号</Text>
        <Text style={styles.desc}>
          与 Web 端账号共享行程。生成配对码后，在已登录的网页版 /pair 页面输入即可。
        </Text>
        {pairCode ? (
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{pairCode}</Text>
            <Text style={styles.codeHint}>{API_BASE_URL}/pair</Text>
            <Pressable hitSlop={6} onPress={() => setPairCode(null)}>
              <Text style={styles.codeDismiss}>收起</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.primaryBtn, pairBusy && styles.disabled]}
            disabled={pairBusy}
            onPress={() => void onCreatePair()}
          >
            <Text style={styles.primaryBtnText}>{pairBusy ? "生成中…" : "生成配对码"}</Text>
          </Pressable>
        )}
      </View>

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
    gap: 6,
  },
  disabled: { opacity: 0.5 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: BRAND.ink },
  desc: { fontSize: 12, color: BRAND.inkSoft, lineHeight: 17 },
  mono: { fontSize: 12, color: BRAND.ink },
  primaryBtn: {
    height: 38,
    borderRadius: 10,
    backgroundColor: BRAND.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  codeBox: {
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.primary,
    backgroundColor: BRAND.primarySoft,
    alignItems: "center",
    paddingVertical: 12,
    gap: 4,
  },
  codeText: { fontSize: 32, fontWeight: "800", letterSpacing: 10, color: BRAND.primary },
  codeHint: { fontSize: 11, color: BRAND.inkSoft },
  codeDismiss: { fontSize: 12, color: BRAND.primary, fontWeight: "600", marginTop: 2 },
});
