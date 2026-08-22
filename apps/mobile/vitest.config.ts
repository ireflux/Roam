import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // 单测环境用 stub 替代原生地图库
      "react-native-amap3d": path.resolve(__dirname, "src/test/stubs/amap3d.ts"),
    },
  },
});
