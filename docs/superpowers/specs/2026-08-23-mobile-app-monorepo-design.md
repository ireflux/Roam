# Roam 移动端（iOS / Android）与 Monorepo 化架构设计

日期：2026-08-23　|　状态：待评审

## 1. 背景与已确认约束

Roam Web 版（Next.js 16 + React 19 + 高德 JS API + Neon Postgres，部署 Vercel）功能已完善。本期新增 iOS 与 Android 原生 App。

已确认的决策：

| 决策点 | 结论 |
|---|---|
| 开发方式 | AI 辅助开发（Claude Code / opencode），语言不设限 |
| 技术路线 | **Expo（React Native）+ TypeScript**，方案 A |
| 目标市场 | 仅国内：延续高德体系；需 ICP 备案 + 软件著作权 |
| 设备能力 | **离线优先**（local-first）：无网可查看/编辑，联网自动同步 |
| 账号体系 | 匿名设备身份开箱即用 + 可选绑定登录跨设备同步 |
| 代码组织 | 现有仓库**原地迁移为 monorepo**，两端共享核心逻辑 |

核心依据：`src/lib/trip/*`（不可变 ops / geo / validation）与 `lib/types.ts` 是零 DOM 依赖的纯函数层，可在 RN 中原样复用；Flutter 则需 Dart 全量重写并长期双实现。App 最重的部分是高德地图交互，两端最终都桥接高德原生 SDK，Flutter 的自绘优势无从发挥。

## 2. 目标与非目标

**目标**

1. iOS / Android 功能对齐 Web 全部能力（编辑器 + 分享查看）
2. 离线优先体验：首屏瞬时加载、断网可编辑、恢复后自动同步
3. Web 端行为零回归（仅做仓库迁移 + 身份层小改）

**非目标**

- 海外版 / 双地图源（Google Maps 等）
- 实时多人协作编辑
- v1 不做天/地点级细粒度冲突合并（先做行程级）
- 不重构 Web UI；不统一 Web 的 POST/PATCH/DELETE 为 upsert（记入后续工作）

## 3. 技术选型总览

| 层 | 选型 | 说明 |
|---|---|---|
| 跨平台框架 | Expo（React Native）+ TypeScript | 核心逻辑零重写；单一类型契约 |
| 仓库 | pnpm workspaces monorepo（原地迁移） | 共享 packages/core；Vercel 支持 Root Directory |
| 导航 | expo-router | 文件式路由，与 Next.js 心智一致 |
| 状态 | zustand | 与 Web 同栈，undo/redo 结构化共享模式直接复用 |
| 地图 | 高德 iOS/Android SDK，经 MapAdapter 接入 | 自由绘制/顶点拖拽需原生渲染与精细手势 |
| 本地存储 | expo-sqlite | 官方维护，同步 API 够用 |
| 敏感存储 | expo-secure-store | 存 device token / 会话凭证 |
| 构建 | EAS Build（development / preview / production） | 免自建打包机 |
| 热更新 | EAS Update（OTA） | JS 层修复免商店审核，原生变更才发版 |

否决项：Flutter（Dart 重写全部领域逻辑）；Capacitor/WebView 套壳（自由绘制等重交互体验不可接受）；双端原生（工作量 ×1.8–2）。

⚠️ 本项目含自定义原生模块，**Expo Go 不可用**，日常调试使用 dev client（本地 `expo run:ios/android` 或 EAS Build development 包）。

## 4. Monorepo 结构与迁移（M0）

```
roam/
├─ apps/
│  ├─ web/                  # 现有 Next.js 原样迁入
│  └─ mobile/               # create-expo-app 生成的 RN 应用
├─ packages/
│  ├─ core/                 # 领域层：types.ts + trip/{ops,geo,validation}.ts 及其测试
│  └─ api-client/           # 类型化 API 客户端（注入 fetch/baseUrl）
├─ pnpm-workspace.yaml
├─ package.json             # 根脚本：逐包 lint/typecheck/test
└─ .github/workflows/ci.yml # matrix 各包检查
```

**packages/core 边界规则**：禁止 import react / react-native / next / expo / DOM 类型；IO 一律注入。这是它能同时跑在 Node 测试、Next.js 服务端与 RN 的前提。

**迁移步骤**（机械操作，全程测试保绿）：

1. 引入 pnpm-workspace.yaml；package-lock → pnpm-lock（根 package.json 改 workspace 脚本）
2. `git mv` 应用至 `apps/web`（src、public、e2e、drizzle、配置文件），更新 tsconfig paths
3. 抽出 `packages/core`（types + trip/* + 测试随迁），apps/web 以 `workspace:*` 引用并删除本地副本
4. Vercel 项目设置 Root Directory = `apps/web`；CI 更新为 pnpm + per-package matrix
5. 验证：lint / typecheck / vitest / playwright 全绿后再进入 M1

## 5. 后端改造（apps/web 内）

现状：owner 身份 = 登录会话（Neon Auth/Better Auth）→ 匿名 httpOnly cookie；`repo.update` 已支持 `expectedUpdatedAt` 乐观并发；`remove` 为硬删除；`claimTrips/claimProfile` 已有匿名→用户合并能力——移动端方案直接复用这些既有机制。

### 5.1 身份决议扩展

`getOwnerId / getOrCreateOwnerId` 增加 Bearer 分支：`Authorization: Bearer <token>` → sha256(token) 查 `api_tokens` → 得 owner_id；未命中再走现有「会话 → cookie」。Web 行为完全不变；token 无效返回 401。

### 5.2 新表 api_tokens（drizzle 迁移）

```
api_tokens
├─ token_hash   text PK     -- sha256；原文仅在创建响应出现一次
├─ owner_id     text notNull -- 初始 = 设备匿名 ownerId；绑定时改指用户 id
└─ creator_id / updater_id / created_at / updated_at / is_deleted（沿用审计列规范）
```

### 5.3 新增端点（签名见附录 A）

| 端点 | 用途 |
|---|---|
| `POST /api/auth/device-token` | App 首启注册设备：创建匿名 owner + token（IP 限速） |
| `PUT /api/trips/[id]` | 移动端同步专用幂等 upsert：不存在则建（服务端生成 shareId）、存在则校验 owner + expectedUpdatedAt、支持 `deleted:true` 软删（tombstone 广播给其他设备） |
| `GET /api/recent?since=` | 增量拉取：updatedAt > since 的 trips + deletedIds；游标分页上限 100 |
| `POST /api/auth/bind` | 携 Bearer token + Better Auth 会话凭证：token.ownerId 改指用户 id，复用 claimTrips/claimProfile 合并旧设备数据 |

### 5.4 高德密钥

- 服务端 Web Service key 不变：route/search/regeocode/weather 仍全走服务端 API，**App 不持有任何 Web Service 密钥**
- 新增高德**原生 SDK key**：iOS 绑 Bundle ID，Android 绑包名 + SHA1；经 EAS secrets / `app.config` extra 下发，不入 git
- `/_AMapService` JS API 代理与 App 无关（原生 SDK 使用原生鉴权）

## 6. Mobile 应用分层架构

```
apps/mobile/
├─ app/                        # expo-router
│  ├─ index.tsx                # 首页：新建 + 最近行程列表
│  ├─ editor/[tripId].tsx      # 编辑器（内部切换：地图 / 行程面板）
│  ├─ t/[shareId].tsx          # 分享查看（公开只读，在线加载）
│  └─ settings.tsx             # 昵称 / 登录绑定 / 缓存管理
├─ src/
│  ├─ features/                # 页面级 UI（editor / home / share）
│  ├─ map/                     # ★ MapAdapter 接口 + amap3d 实现
│  ├─ store/                   # useTripStore（复用 core ops；db/sync 依赖注入）
│  ├─ services/
│  │  ├─ db.ts                 # SQLite 读写
│  │  ├─ sync.ts               # 同步引擎（§8）
│  │  └─ net.ts                # NetInfo 断网事件源
│  └─ lib/
└─ app.config.ts               # dev / preview / production 三 profile
```

依赖方向单向：`app(UI) → features → store → services → @roam/core`。store 不 import 任何 RN/expo/DOM 模块，因此可在 Node + vitest 中跑单测（沿用 Web store 测试方法）。

**功能对齐清单**（全部保留）：POI 搜索与点击加景点（逆地理自动命名）、四模式分段路线与距离智能建议、自由绘制（端点吸附 <100m）、顶点拖拽吸附（标记 snapped）、多天管理/跨天移动/拖拽排序/备注、undo/redo（工具栏按钮 + 系统手势）、1.5s 防抖自动保存、规划失败降级直线 + 重试徽章、分段 pending/ok/error 状态、公交段实线 + 步行虚线子段渲染、分享页回放动画、收藏（复制分享行程）。

## 7. 地图层设计

### 7.1 MapAdapter 两阶段策略

业务代码只依赖 MapAdapter 接口（附录 B），不直接接触任何地图库：

- **阶段 1**：`react-native-amap3d`（社区库）实现——覆盖 MapView / Marker / Polyline / 基础手势事件
- **阶段 2（按需，预期必做两项）**：Expo Modules API 自封装薄原生模块补齐——
  - 手势锁粒度：绘制模式锁 pan、放行双指缩放（amap3d 手势开关过粗）
  - 高频折线性能：绘制时增量 setPoints 而非整线重建（节流采样：≥3m 或 ≥50ms）

### 7.2 交互映射

| Web | Mobile |
|---|---|
| 按住拖动画线 | 绘制模式下单指拖动 = 落笔（pan 锁定，双指缩放放行） |
| 点选分段 → 拖顶点 | 点选分段 → 顶点显手柄 → 拖动吸附 |
| Ctrl+Z | 工具栏按钮 + iOS 摇动/三指撤销系统约定 |

### 7.3 离线降级

搜索 / 规划 / 天气均需网络（服务端代理）。断网时：搜索入口置灰提示；规划请求立即失败 → 复用 `degraded` 直线 + 重试徽章，NetInfo 恢复后按 stale-guard 思路批量自动重试；天气显示最近缓存或隐藏。

## 8. 本地存储与同步引擎

### 8.1 SQLite schema

```sql
CREATE TABLE trips (
  id TEXT PRIMARY KEY,             -- 客户端 crypto.randomUUID()（离线可建行程）
  share_id TEXT,
  title TEXT,
  data TEXT NOT NULL,              -- TripData JSON 快照（与服务端同构）
  base_updated_at TEXT NOT NULL,   -- 上次与服务端一致的版本（乐观并发基准）
  dirty INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL      -- 本地最后修改时间
);
CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT);  -- last_pull_at 等
```

读路径永远走本地（首屏瞬时）；UI 经 zustand 订阅。

### 8.2 写路径（在线与否同一代码路径）

编辑 → core ops 产出新快照 → zustand → 立即写 SQLite（dirty=1）→ 防抖 1.5s 触发 `sync.push()`。

### 8.3 同步循环

**push**（dirty trips 串行，单批 ≤10）：

`PUT /api/trips/[id] { title?, data?, deleted?, expectedUpdatedAt: base_updated_at }`

- 200 → 清 dirty，base_updated_at ← 响应版本
- 409 → 进入冲突流程：拉远端对比，「云端版本 / 我的版本」二选一（保守默认；设置项预留自动 LWW，v1 关闭）
- 网络错误 → 保留 dirty，指数退避（30s 起 ×2，封顶 10min）

**pull**（冷启动 / 回前台 / NetInfo 恢复）：

`GET /api/recent?since=last_pull_at` → 变更项 upsert（本地非 dirty 才覆盖，dirty 项走冲突流程）→ 应用 deletedIds（删除本地非 dirty 副本）→ 推进 last_pull_at。

顺序：先 push 后 pull。

### 8.4 边界情况

- 离线创建：本地 UUID 直接入库 dirty；PUT 幂等建档，shareId 由服务端生成后回填
- Web 端 DELETE 是硬删除、不产生 tombstone：另一台设备会残留副本——v1 已知怪癖，记录在案；后续把 Web 删除改软删即可闭环
- 多端同时编辑同一行程：v1 行程级解决，不做字段合并

## 9. 认证与账号绑定

1. 首启：`POST /api/auth/device-token` → `{ownerId, token}` 存 SecureStore；此后所有请求带 Authorization
2. 未登录即完整可用（匿名 owner 名下，与 Web 匿名 cookie 同构）
3. 可选绑定：「设置」页经 Better Auth REST 登录（邮箱密码/验证码，视服务端开启方式）→ `POST /api/auth/bind` → claim 合并旧设备行程与昵称 → 该 token 从此代表用户 id，Web 同账号可见同一批行程
4. 登出 = 重置为新匿名设备（最简且安全，避免残留授权）
5. 分享查看页无需任何身份

## 10. 测试策略

| 层 | 工具 | 内容 |
|---|---|---|
| packages/core | vitest（现测试随迁） | ops / geo / validation 全量 |
| store / sync / db | vitest + Node | db/sync 以接口注入 fake；同步状态机表驱动测试（冲突、断网、乱序、离线创建） |
| api-client | vitest + msw | 契约与错误分支 |
| mobile UI | jest-expo + RNTL | 组件冒烟（工具条、面板、列表交互） |
| web | 现状不变 | vitest + Playwright |
| mobile E2E | Maestro | 冒烟：新建→加点→连线→保存→飞行模式重启→数据仍在→联网恢复同步 |

## 11. 构建、发布与合规

- EAS Build profiles：development（dev client）/ preview（安卓内测 apk）/ production（aab + ipa）
- EAS Update OTA：JS 层热修不发版；原生变更才走商店审核
- 合规关键路径（**M0 即并行启动**，周期不受开发控制）：
  - 软件著作权登记（国内安卓商店必需，数周）
  - ICP 备案 + App 备案（工信部要求；App Store 中国区亦需备案号）
  - 华为 / 小米 / OPPO / vivo / 应用宝开发者账号逐一注册提审
  - 隐私政策、权限用途说明（定位等）
- Apple Developer $99/年；TestFlight 内测

## 12. 实施里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| M0 | monorepo 迁移 + CI/Vercel 更新 | Web 全部测试绿、预览环境正常 |
| M1 | 移动骨架：路由 / SQLite / 设备 token / 地图显示 / 创建保存在线链路 | 真机创建的行程能在 Web 打开 |
| M2 | 编辑器对齐①：搜索 / 点击加景点 / 四模式规划 / 多天管理 / undo-redo / 自动保存 | 功能过半且真机流畅 |
| M3 | 编辑器对齐②：自由绘制 / 顶点吸附 / 回放动画 / 降级重试 | 重交互达 Web 水准 |
| M4 | 同步引擎全量 + 冲突 UI + 断网场景 | 状态机表驱动全覆盖 + Maestro 离线用例通过 |
| M5 | 分享页 / 收藏 / 登录绑定 / 设置页 | 绑定后 Web 可见同一批行程 |
| M6 | EAS 三渠道构建 + 合规材料提交 + 商店提审 | TestFlight / 内测包可安装 |

## 13. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| amap3d 社区维护停滞 | 地图能力受限 | MapAdapter 隔离实现；阶段 2 自封装兜底（约 1–2 周） |
| 绘制高频折线掉帧 | 编辑体验差 | 原生侧增量更新 points；节流采样 ≥3m 或 ≥50ms |
| 同步冲突体验生硬 | 用户疑虑丢数据 | v1 保守「二选一」策略；单人编辑为主冲突率低 |
| 备案 / 软著周期卡发布 | 上架延期 | M0 即启动材料准备，与开发并行 |
| Expo 原生构建链学习成本 | 初期迭代变慢 | dev client + EAS Build 文档成熟；AI 辅助降低门槛 |

## 附录 A：新增 API 签名草案

```
POST /api/auth/device-token
  无身份；IP 限速
  → 200 { ownerId: string, token: string }   // token 明文仅此一次

PUT /api/trips/[id]
  Authorization: Bearer
  body { title?, data?, deleted?, expectedUpdatedAt? }
  → 200 { trip }                             // 建/改成功，trip.updatedAt为新基准
  → 404 { error: "not_found_or_forbidden" }
  → 409 { trip: PublicTrip }                 // 版本冲突，附当前远端快照

GET /api/recent?since=<ISO>&cursor=
  Authorization: Bearer 或 cookie
  → 200 { trips: Trip[], deletedIds: string[], nextCursor?: string }

POST /api/auth/bind
  Authorization: Bearer (device token)
  body { betterAuthSessionToken: string }
  → 200 { ownerId: string, claimedTrips: number }
```

## 附录 B：MapAdapter 接口草案

```ts
interface MapAdapter {
  setCamera(center: [number, number], zoom: number): void;
  renderStops(stops: TripStop[], selectedId?: string): void;        // 增量 diff
  renderSegments(segments: TripSegment[]): void;                    // 含 parts 子段样式
  setGestureLock(locked: boolean): void;                            // 锁 pan，双指缩放始终放行
  onTap(cb: (latlng: [number, number]) => void): void;              // 加景点
  onStopPress(cb: (stopId: string) => void): void;
  onSegmentPress(cb: (segmentId: string) => void): void;
  drawStream(cb: (points: [number, number][]) => void): () => void; // 自由绘制触摸流，返回解绑
  hitTestStop(latlng: [number, number], radiusM: number): string | null; // 吸附命中
}
```
