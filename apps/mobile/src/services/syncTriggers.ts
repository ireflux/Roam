import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { syncNow } from "@/services/sync";

/** 同步触发器：回前台 / 网络恢复时自动 syncNow。返回清理函数。 */
export function initSyncTriggers(): () => void {
  const appSub = AppState.addEventListener("change", (state) => {
    if (state === "active") void syncNow().catch(() => {});
  });
  const netUnsub = NetInfo.addEventListener((netState) => {
    if (netState.isConnected) void syncNow().catch(() => {});
  });
  return () => {
    appSub.remove();
    netUnsub();
  };
}
