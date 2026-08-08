# Roam 路线图

旅行路线规划工具：自动规划路线、自由绘制、道路吸附改线、多日行程、短链接分享。

## 功能

- **添加地点**：高德 POI 搜索或直接点击地图，自动生成两地点间的真实路线
  （点击地图添加的站点会自动逆地理编码命名）
- **多出行方式**：驾车 / 步行 / 骑行，可逐段混搭
- **实时路况**：编辑器中一键开启高德实时路况图层，查看拥堵段
- **自由绘制**：按住拖动画线，端点自动吸附到附近站点（<100m）或新建站点
- **吸附改线**：选中线段拖拽顶点，实时吸附到最近道路
- **多日行程**：按天组织站点，拖拽排序，站点备注
- **撤销/重做**、自动保存（防抖）
- **分享**：短链接只读页面 + 站点卡片流 + 全程动画播放

## 技术栈

- Next.js 16 (App Router) + TypeScript + Tailwind v4
- 高德地图 JS API + 高德 Web Service API
- 路线计算与地点搜索：高德 Web Service API
- 数据库：Neon Postgres（drizzle ORM），本地无数据库时自动降级为内存存储

## 本地开发

```bash
cp .env.example .env.local   # 填入 Neon 与高德环境变量
npm install
npm run db:migrate           # 应用已提交的数据库 migration
npm run dev
```

- 在高德控制台创建 Web 服务 API key，以及 Web 端（JS API）key 与安全密钥；前者仅保存为 `AMAP_WEB_SERVICE_KEY`。
- 开发环境：`NEXT_PUBLIC_AMAP_SECURITY_JS_CODE` 填写安全密钥（明文）。
- 生产环境（推荐）：`NEXT_PUBLIC_AMAP_PROXY=true` 并把安全密钥填入 `AMAP_SECURITY_JS_CODE`（仅服务端），
  前端经 `/api/amap-proxy` 代理，密钥不下发浏览器。
- 打开 http://localhost:3000 新建路线

## 命令

```bash
npm run dev         # 开发
npm run build       # 构建
npm run start       # 运行生产构建
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # Vitest 单元测试
npm run db:push     # 仅本地原型环境：同步 schema
npm run db:migrate  # 应用已提交的 migration（Preview / Production）
npm run db:generate # 依据 schema 变更生成新 migration
```

## 目录结构

```
src/
├─ app/
│  ├─ page.tsx              首页（新建 / 最近路线）
│  ├─ editor/[tripId]/      编辑器页面
│  ├─ t/[shareId]/          分享页
│  └─ api/                  后端接口（trips / route / search / claim / recent）
├─ components/
│  ├─ editor/               编辑器（MapLayers 渲染、自由绘制、顶点吸附 hooks）
│  └─ share/                分享页（地图 + 卡片流 + 动画）
└─ lib/
   ├─ db/                   数据仓库（Neon / 内存降级）
├─ routing/              高德路线服务 adapter 与缓存
   └─ trip/                 纯函数核心（站点增删、重排、绘制、几何）

设计文档：docs/superpowers/specs/2026-08-03-route-planner-design.md
