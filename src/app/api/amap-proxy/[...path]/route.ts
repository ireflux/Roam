import { NextResponse } from "next/server";

// 高德 JSAPI 2.0 生产环境安全代理（skill 最佳实践：securityJsCode 不暴露到浏览器）。
// 前端通过 _AMapSecurityConfig.serviceHost = "/api/amap-proxy" 把请求指向本路由，
// 服务端在此为所有 upstream 请求统一追加 jscode，再由 fetch 转发到高德 REST 服务。
// 仅在服务端配置 AMAP_SECURITY_JS_CODE 时启用；未配置则返回 503（避免明文回退）。

const TARGET = "https://restapi.amap.com";
const TIMEOUT_MS = 10_000;

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, { params }: Ctx) {
  const jscode = process.env.AMAP_SECURITY_JS_CODE;
  if (!jscode) {
    return NextResponse.json({ error: "proxy_not_configured" }, { status: 503 });
  }
  try {
    const { path } = await params;
    const url = new URL(req.url);
    const target = new URL(`${TARGET}/${path.join("/")}`);
    url.searchParams.forEach((value, name) => target.searchParams.set(name, value));
    target.searchParams.set("jscode", jscode);
    // 透传客户端 IP：经代理后高德拿不到用户 IP，IP 兜底定位（Geolocation）会定到代理服务器位置，
    // 官网建议附加 ip 参数（nginx 示例为 $remote_addr）。Next 部署层未填充 X-Forwarded-For 时忽略。
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) target.searchParams.set("ip", forwarded.split(",")[0].trim());

    const upstream = await fetch(target, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json;charset=utf-8",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "map_service_unavailable" }, { status: 502 });
  }
}