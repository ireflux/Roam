import { Platform } from "react-native";
import { AMapSdk } from "react-native-amap3d";
import { AMAP_ANDROID_KEY, AMAP_IOS_KEY } from "@/lib/env";

/** 高德原生 SDK 运行时 key 初始化（iOS/Android 同一入口）。 */
export function initAmapSdk(): void {
  AMapSdk.init(Platform.OS === "ios" ? AMAP_IOS_KEY : AMAP_ANDROID_KEY);
}
