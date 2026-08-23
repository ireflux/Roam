import * as React from "react";
import { Pressable, Text } from "react-native";
import { Link, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ensureIdentity } from "@/services/session";
import { initSyncTriggers } from "@/services/syncTriggers";
import { initAmapSdk } from "@/map/amapInit";

function SettingsLink() {
  return (
    <Link href="/settings" asChild>
      <Pressable hitSlop={8}>
        <Text style={{ color: "#0b644b", fontWeight: "600", fontSize: 15 }}>设置</Text>
      </Pressable>
    </Link>
  );
}

export default function RootLayout() {
  React.useEffect(() => {
    // 设备身份与高德 SDK 初始化失败不阻塞 UI：编辑器保存时会再次触发重试
    initAmapSdk();
    let cleanup: (() => void) | undefined;
    // 身份就绪后再启动同步触发器（回前台/网络恢复），避免无凭证请求空转
    void ensureIdentity()
      .then(() => {
        cleanup = initSyncTriggers();
      })
      .catch(() => {});
    return () => cleanup?.();
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTitleStyle: { fontWeight: "700" },
          headerTintColor: "#0b644b",
        }}
      >
        <Stack.Screen name="index" options={{ title: "Roam", headerRight: SettingsLink }} />
        <Stack.Screen name="editor/[tripId]" options={{ title: "行程编辑", headerBackTitle: "返回" }} />
        <Stack.Screen name="t/[shareId]" options={{ title: "分享行程" }} />
        <Stack.Screen name="settings" options={{ title: "设置" }} />
      </Stack>
    </>
  );
}
