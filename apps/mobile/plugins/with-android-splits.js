/**
 * Expo config plugin：启用 Android ABI 分包（per-ABI APK）。
 * 通用 APK 内含全部四种架构的原生库（~100MB 级），分包后单包仅含一份（约 1/3）。
 * 现代设备全部为 arm64-v8a；armeabi-v7a 覆盖老设备，x86_64 供模拟器。
 */
const { withAppBuildGradle } = require("expo/config-plugins");

const SPLITS_BLOCK = `splits {
        abi {
            reset()
            enable true
            universalApk false
            include "arm64-v8a", "armeabi-v7a", "x86_64"
        }
    }

`;

module.exports = function withAndroidSplits(config) {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (!contents.includes("splits {")) {
      config.modResults.contents = contents.replace(
        "    defaultConfig {",
        `    ${SPLITS_BLOCK}    defaultConfig {`,
      );
    }
    return config;
  });
};
