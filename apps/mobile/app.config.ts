import type { ExpoConfig } from "expo/config";

const amapAndroidKey = process.env.AMAP_ANDROID_KEY ?? "";
const amapIOSKey = process.env.AMAP_IOS_KEY ?? "";

const config: ExpoConfig = {
  name: "Roam",
  slug: "roam",
  scheme: "roam",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "io.github.ireflux.roam",
    supportsTablet: true,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: "用于定位当前位置作为路线起点，以及地图交互。",
      NSAppTransportSecurity: {
        // 高德 SDK 部分接口仍为 HTTP；仅豁免高德域名
        NSAllowsArbitraryLoads: false,
        NSExceptionDomains: {
          "amap.com": { NSIncludesSubdomains: true, NSExceptionAllowsInsecureHTTPLoads: true },
        },
      },
    },
  },
  android: {
    package: "io.github.ireflux.roam",
    permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
    blockedPermissions: [],
  },
  extra: {
    amapAndroidKey,
    amapIOSKey,
  },
  plugins: [
    "expo-router",
    "./plugins/with-amap.js",
  ],
};

export default config;
