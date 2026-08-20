import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 高德 JSAPI 安全模式要求 serviceHost 以 /_AMapService 作为一级路由（不可省略或修改）。
  // Next 路由文件夹不允许下划线开头，故用 rewrite 把该前缀转发到同源代理。
  async rewrites() {
    return [{ source: "/_AMapService/:path*", destination: "/api/amap-proxy/:path*" }];
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
      ],
    }];
  },
};

export default nextConfig;
