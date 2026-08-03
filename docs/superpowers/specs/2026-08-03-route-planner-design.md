# Roam 路线图 — 旅行路线规划产品设计

- 日期：2026-08-03
- 状态：已确认，待实施
- 技术栈：Next.js 全栈 + MapLibre GL JS + OpenFreeMap + Neon Postgres

## 1. 产品定位

类小红书的旅行路线创建工具，区别在于**深度的路线编辑能力**：
- 「半社交」产品：匿名可创建和编辑行程，可选昵称，通过短链接分享只读行程
- 核心差异化：除自动路网规划外，支持**自由绘制**和**拖拽吸附**的手动改线

## 2. 页面结构

- `/` 首页：简介 + 新建路线 + 最近编辑（cookie owner_id 关联）
- `/editor/[tripId]` 编辑器（全屏地图 + 侧栏），响应式：桌面双栏 / 移动单栏折叠
- `/t/[share_id]` 分享页：只读地图 + 站点卡片流 + 沿线动画播放

## 3. 技术选型

| 能力 | 方案 |
|---|---|
| 地图 | MapLibre GL JS + OpenFreeMap 瓦片 |
| 线路规划 | OpenRouteService 免费 API（驾车/步行/骑行，浏览器直连） |
| 地点搜索 | Photon（OSM 地名搜索，浏览器直连，绑定自有域名 CORS） |
| 道路吸附 | ORS nearest（拖拽时调用） |
| 部署 | Vercel |
| 数据库 | Neon Postgres |

关键决策：**地图、路线、搜索全部浏览器直连，后端不代理**。ORS 免费配额为 IP/账号级，匿名用户浏览器 IP 分摊更宽裕，且省去服务器请求量。

## 4. 数据模型

单表 JSONB（`trips` 表），每次保存写全量快照，原子且天然无并发冲突：

```
trips
├─ id          UUID
├─ share_id    nanoid(8) 短链 → /t/{share_id}
├─ owner_id    匿名 cookie UUID（编辑权限）
├─ nickname    可选昵称
├─ title       标题
├─ cover       封面（可选）
├─ created_at / updated_at
└─ data        JSONB
   └─ days: [{ id, name, note }]
   └─ stops: [{ id, dayId, name, lat, lng, category, note, order }]
   └─ segments: [{ id, fromStop, toStop, mode, kind: auto|freehand|snapped,
                 geometry: LineString, distanceM, durationMin }]
   └─ mapView: { center, zoom, pitch }
```

## 5. 编辑器核心（差异化）

### 设计思想
路线 = 站点序列 + 每段一个 geometry。所有操作都是对该序列的局部修改。

### 三种线段类型
| 类型 | 含义 | 产生时机 |
|---|---|---|
| auto | ORS 路网真实路线 | 添加站点后自动生成 |
| freehand | 手绘自由线（不走路网） | 自由绘制模式 |
| snapped | 手绘/拖拽后吸附到最近道路 | 吸附模式拖拽节点 |

### 交互流程
1. **添加站点**：搜索（Photon）或点地图 → marker → 插入当日尾部 → ORS 重算前后两段
2. **拖拽排序**：侧栏卡片重排 → 受影响段标记 auto 重算，其余不动
3. **自由绘制**：绘制模式按住拖动画折线；端点若接近站点（<50m）自动连入，可替换任意两站之间线段
4. **吸附修改**：选中线段进入吸附编辑 → 拖顶点实时调 ORS nearest 吸附到最近道路 → 只重算拖动的顶点相邻两小段（局部，避免整线抖动）；若移动后离站点 <50m 提示「并入站点」
5. **出行方式**：逐段独立设置（驾车/步行/骑行混搭）；切换时仅重算 auto 段，freehand/snapped 提示需重算
6. **撤销/重做**：本地命令栈（操作粒度，非保存粒度），Ctrl+Z
7. **自动保存**：debounce 2s → PATCH 全量 JSONB；断网 pending → LocalStorage 兜底补存

### 性能与降级
- >30 段按视野降采样渲染
- ORS 失败 → 该段降级为 freehand 直线 + 红警示，一键重试
- 相机跟随用 flyTo + bezier 缓动，与播放动画共用插值逻辑

## 6. 后端 API

```
POST /api/trips                  创建行程 → { id, shareId }
PATCH /api/trips/[id]           保存全量快照（owner 校验）
GET   /api/trips/[id]           获取行程（编辑器/分享页共用）
GET   /api/trips/share/[shareId] 短链公开读取（无需 cookie）
GET   /api/recent                最近行程（owner_id 匹配）
POST  /api/claim?nickname=       设置昵称
```

### 安全
- PATCH 校验 owner_id == trips.owner_id，否则 403
- share_id nanoid 8 位（~180 亿组合）不可枚举，读取免鉴权（匿名只读分享符合定位）
- 无上传内容，XSS 面小；昵称渲染转义

## 7. 错误处理

- 前端统一 `useTripStore`：数据 + 每段请求状态（pending/ok/error），段级错误不影响整图
- ORS 错误 → 段降级直线 + 重试
- API 统一 `{ ok, message }`：404/403/429（前端对 PATCH 节流）
- 断网 → 编辑器只读本地排队 + 离线暂存

## 8. 测试策略

1. **纯函数层**（Vitest）：段重算逻辑、吸附顶点局部重算、撤销重做栈、JSON 迁移
2. **集成层**（Vitest + mock adapter）：ORS/Photon 封装 thin 接口，假响应测状态机（降级/重试/限流）
3. **E2E（后期）**：Playwright 画线 → 切换模式 → 断言 UI + 转发

覆盖目标：1、2 层核心函数 ≥ 80%，UI 人工验收为主。

## 9. 实施里程碑

| 里程碑 | 内容 |
|---|---|
| M1 骨架 | Next.js + MapLibre 地图 + trips 表 + 匿名身份 + 首页 |
| M2 自动路线 | 站点增删 + ORS 计算 + 侧栏排序 + 多模式切换 |
| M3 手工编辑 | 自由绘制 + 吸附编辑 + 段降级 |
| M4 行程组织 | 多日、备注、撤销重做、自动保存 |
| M5 分享 | 分享页 + 卡片流 + 动画播放 + GPX 导出（可选） |