import { NextResponse } from "next/server";

// 高德 JSAPI 2.0 生产环境安全代理（skill 最佳实践：securityJsCode 不暴露到浏览器）。
// 前端通过 _AMapSecurityConfig.serviceHost = "/api/amap-proxy/_AMapService" 把请求指向本路由，
// 服务端在此为所有 upstream 请求统一追加 jscode，再由 fetch 转发到对应的高德服务。
// 官方要求代理请求以 /_AMapService 作为固定一级路由（不可省略或修改），并按路径分发到不同上游：
//   /v4/map/styles  -> webapi.amap.com（自定义地图样式）
//   /v3/vectormap   -> fmap01.amap.com（海外矢量地图）
//   其余 Web 服务    -> restapi.amap.com
// 仅在服务端配置 AMAP_SECURITY_JS_CODE 时启用；未配置则返回 503（避免明文回退）。

const UPSTREAMS: Record<string, string> = {
  "v4/map/styles": "https://webapi.amap.com",
  "v3/vectormap": "https://fmap01.amap.com",
};
const DEFAULT_TARGET = "https://restapi.amap.com";
const TIMEOUT_MS = 10_000;

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, { params }: Ctx) {
  const jscode = process.env.AMAP_SECURITY_JS_CODE;
  if (!jscode) {
    return NextResponse.json({ error: "proxy_not_configured" }, { status: 503 });
  }
  try {
    const { path } = await params;
    // 兼容旧配置：路径可能以 _AMapService 开头（serviceHost 的固定前缀），转发前剥离。
    let segments = path;
    if (segments[0] === "_AMapService") segments = segments.slice(1);
    const pathname = segments.join("/");

    const url = new URL(req.url);
    const base = UPSTREAMS[pathname] ?? DEFAULT_TARGET;
    const target = new URL(`${base}/${pathname}`);
    url.searchParams.forEach((value, name) => target.searchParams.set(name, value));
    target.searchParams.set("jscode", jscode);
    // 透传客户端 IP：经代理后高德拿不到用户 IP，IP 兜底定位（Geolocation）会定到代理服务器位置，
    // 官网建议附加 ip 参数（nginx 示例为 $remote_addr）。Next 部署层未填充 X-Forwarded-For 时忽略。
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) target.searchParams.set("ip", forwarded.split(",")[0].trim());

    const upstream = await fetch(target, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await upstream.text();
    // JSONP 响应（带 callback 参数）必须以 JS MIME 返回，否则浏览器 strict MIME checking
    // 会拒绝执行 script，控制台报 "Refused to execute script ... not executable"。
    const isJsonp = target.searchParams.has("callback");
    const contentType = isJsonp
      ? "application/javascript;charset=utf-8"
      : (upstream.headers.get("content-type") ?? "application/json;charset=utf-8");
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "map_service_unavailable" }, { status: 502 });
  }
}