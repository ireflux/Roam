/**
 * Expo config plugin：注入高德 iOS/Android 原生 SDK key。
 * key 经 app.config.ts extra（构建时环境变量 AMAP_ANDROID_KEY / AMAP_IOS_KEY）传入。
 */
const { withInfoPlist } = require("expo/config-plugins");
const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");
const { withAppDelegate } = require("expo/config-plugins");

const ANDROID_KEY_META = "com.amap.api.v2.apikey";

const withAndroidAmapKey = (config, { androidKey }) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    if (!androidKey) return config;
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    application["meta-data"] = [
      ...(application["meta-data"] ?? []).filter((m) => m.$?.name !== ANDROID_KEY_META),
      { $: { "android:name": ANDROID_KEY_META, "android:value": androidKey } },
    ];
    return config;
  });
};

const withIosAmapKey = (config, { iosKey }) => {
  // Info.plist 键：AMapServices 启动时读取；同时写 AppDelegate 兜底（不同版本 SDK 读取路径不一）
  config = withInfoPlist(config, (config) => {
    if (iosKey) config.modResults.AMapApiKey = iosKey;
    return config;
  });
  config = withAppDelegate(config, (config) => {
    if (!iosKey) return config;
    const contents = config.modResults.contents;
    if (contents.includes("AMapServices")) return config;
    // 在 didFinishLaunchingWithOptions 开头注入 key 设置
    config.modResults.contents = contents.replace(
      /(didFinishLaunchingWithOptions[^{]*\{)/,
      `$1\n  [AMapServices sharedServices].apiKey = @"${iosKey}";`,
    );
    if (!contents.includes("#import <AMapFoundationKit/AMapFoundationKit.h>")) {
      config.modResults.contents = config.modResults.contents.replace(
        /( #import .*)/,
        "#import <AMapFoundationKit/AMapFoundationKit.h>\n$1",
      );
    }
    return config;
  });
  return config;
};

module.exports = (config) => {
  const androidKey = process.env.AMAP_ANDROID_KEY || config.extra?.amapAndroidKey || "";
  const iosKey = process.env.AMAP_IOS_KEY || config.extra?.amapIOSKey || "";
  config = withAndroidAmapKey(config, { androidKey });
  config = withIosAmapKey(config, { iosKey });
  return config;
};
