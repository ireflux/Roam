# Roam 路线图

旅行路线规划工具：自动规划路线、自由绘制、道路吸附改线、多日行程、短链接分享。

## 功能

- **添加地点**：Photon 搜索（OSM 地名）或直接点击地图，自动生成两地点间的真实路线
- **多出行方式**：驾车 / 步行 / 骑行，可逐段混搭
- **自由绘制**：按住拖动画线，端点自动吸附到附近站点（<100m）或新建站点
- **吸附改线**：选中线段拖拽顶点，实时吸附到最近道路
- **多日行程**：按天组织站点，拖拽排序，站点备注
- **撤销/重做**、自动保存（防抖）
- **分享**：短链接只读页面 + 站点卡片流 + 全程动画播放

## 技术栈

- Next.js 16 (App Router) + TypeScript + Tailwind v4
- MapLibre GL JS + OpenFreeMap 瓦片（免费，无需 key）
- 路线计算：**ORS API key（可选）**，未配置时自动用免费的 Valhalla demo
- 道路吸附：ORS snap（有 key）/ OSRM nearest demo（无 key）
- 地点搜索：Photon（免费匿名）
- 数据库：Neon Postgres（drizzle ORM），本地无数据库时自动降级为内存存储

## 本地开发

```bash
cp .env.example .env.local   # 填入 DATABASE_URL（Neon 连接串）
npm install
npm run db:push              # 建表（仅首次 / schema 变更后）
npm run dev
```

- 可选：注册 OpenRouteService 免费账号获取 `ORS_API_KEY`，可提升配额与稳定性
- 打开 http://localhost:3000 新建路线

## 命令

```bash
npm run dev         # 开发
npm run build       # 构建
npm run start       # 运行生产构建
npm run lint        # ESLint
npm test            # Vitest 单元测试
npm run db:push     # 同步数据库 schema
```

## 目录结构

```
src/
├─ app/
│  ├─ page.tsx              首页（新建 / 最近路线）
│  ├─ editor/[tripId]/      编辑器页面
│  ├─ t/[shareId]/          分享页
│  └─ api/                  后端接口（trips / route / snap / claim / recent）
├─ components/
│  ├─ editor/               编辑器（MapLayers 渲染、自由绘制、顶点吸附 hooks）
│  └─ share/                分享页（地图 + 卡片流 + 动画）
└─ lib/
   ├─ db/                   数据仓库（Neon / 内存降级）
   ├─ routing/              路线服务 adapter（ORS / Valhalla / OSRM + 缓存）
   └─ trip/                 纯函数核心（站点增删、重排、绘制、几何）

设计文档：docs/superpowers/specs/2026-08-03-route-planner-design.md
