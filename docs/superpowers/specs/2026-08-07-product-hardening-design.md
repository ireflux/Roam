# Roam 产品完善与问题修复设计

- 日期：2026-08-07
- 状态：已确认，待实施
- 范围：3 项功能完善（删除行程 / 天组织 / 分享安全）+ 7 项代码问题修复
- 前置设计：2026-08-03-route-planner-design.md（本次不改变其架构决策）

## 0. 总体结论

本次改动 **零 schema 变更**（`TripDay.name`、`profiles` 表、`shareId` 字段均已存在），
唯一存量代码调整是 shareId 正则长度放宽。所有操作继续遵循「纯函数 ops + Zustand store +
命令式地图副作用」的分层。

## 1. 功能完善

### 1.1 删除行程（硬删除 + 二次确认）

- **Repo**：`TripRepo` 新增 `remove(id: string, ownerId: string): Promise<boolean>`
  - Neon：`delete().where(and(eq(id), eq(ownerId))).returning({ id })` → 有行 true
  - Memory：owner 比对后 `map.delete`
- **API**：`DELETE /api/trips/[id]`；ownerId 不匹配或不存在均 404（防枚举，与 GET 一致）
- **UI**：
  - 首页最近列表：hover 出现删除按钮 → 确认弹窗 → 成功后移除列表项
  - 编辑器侧栏 header：删除入口 → 确认后 `router.push("/")`
- **行为**：删除后 shareId 即 404，分享链接自然失效

### 1.2 天的命名 + 拖拽重排

- **语义**：重排只动 `days[]` 数组顺序（纯展示顺序），不改任何站点的 dayId/order；
  命名用已有 `TripDay.name`，为空时 fallback「第 N 天」
- **ops**（纯函数）：`renameDay(data, dayId, name)`、`reorderDays(data, fromIdx, toIdx)`，
  no-op 返回原引用 + `changed: false`（见 2.3）
- **store**：`renameDay`、`reorderDays` 两个 action，均 pushHistory + scheduleSave
- **UI**（编辑器天数 Tab 区）：
  - Tab 显示 `day.name ?? 第 N 天`；双击 inline 编辑，空值提交 → 恢复自动命名
    （trim、≤50 字）
  - 拖拽排序：复用 StopCard 的 HTML5 DnD 模式
  - `activeDayId` 是稳定 id，改名/重排不丢当前选中
- **ShareView**：同样 fallback 显示（`day.name ?? 第 N 天`）

### 1.3 分享安全（加长 shareId）

- `nanoid(8)` → `nanoid(16)`（96 bits，枚举不可行）；不迁移历史数据，老链接继续有效
- 放宽 shareId 正则 `/^[A-Za-z0-9_-]{4,16}$/` → `{4,32}`，共 2 处：
  - `src/app/t/[shareId]/page.tsx`
  - `src/app/api/trips/share/[shareId]/route.ts`
- 定位明确：提高不可猜测性，不引入权限模型

### 1.4 补齐昵称功能（修复原问题 4）

- 新增 `GET /api/nickname`：返回当前 owner 昵称（cookie 优先，无则查 DB）
- **首页**：header 显示昵称；未设置时提供「设置昵称」inline 输入，调已有 `POST /api/claim`
- **分享页**：RSC 中 `getRepo().getNickname(trip.ownerId)` 直读，`ShareView` 标题下显示
  「by 昵称」——无需新 API

## 2. 问题修复（最优解）

### 2.1 标题撤销语义解耦（原问题 1）

标题编辑**不进 undo/redo**（undo 语义为几何/站点/天等编辑操作，标题是元数据），
保留 1.5s 防抖保存。改动：`setTitle` 移除 `pushHistory`。

### 2.2 undo 深拷贝 → 结构性共享（原问题 2）

- 论证：`ops.ts` 全部操作不可变（spread + 新数组/新对象），全文核查无 in-place mutation，
  历史版本天然不可变 → 可安全持有引用
- 实现：`pushHistory` 直接存 `data` 引用，删除 `JSON.parse(JSON.stringify(...))`
- 收益：undo O(1)；内存从 50 份全量副本降为共享子树；无序列化 CPU 开销
- 保留 `UNDO_LIMIT=50`；在 `ops.ts` 头部注释确立不可变契约

### 2.3 引址判定 → 显式 `changed` 标志（原问题 3）

- `OpsResult` 增加 `changed: boolean`（op 内以 `data !== input` 计算）
- store 中 `reorder`/`moveStopToDay` 的 `res.data === trip.data` 判定改为 `res.changed`
- 「no-op 返回原引用」保留为内部优化，但调用方不再依赖引址约定
- 补 no-op 单测（重排同位置、moveStopToDay 同天等）

### 2.4 缓存 FIFO → 真 LRU（原问题 5）

- `setCachedRoute` 改为先 `delete` 再 `set`（Map 重插刷新顺序），淘汰取 `keys().next()`
  即最久未使用
- 注释说明单实例局限与未来迁移路径（DB 表 / Redis）
- 核心改动 3 行

### 2.5 dragEnable 状态单点化（原问题 6）

- `MapLayers.tsx` 现有 cursor 管理 effect（`setDefaultCursor`）并入 dragEnable：
  `map.setStatus({ dragEnable: tool !== "draw" })`，由 tool 单一驱动
- `useFreehandDraw` 删除自己的 `setStatus` 调用/恢复逻辑 → 无恢复时序问题

### 2.6 段降级反馈：失败 badge + 重试（原问题 7）

- 顶部工具条新增 badge：「⚠ N 段路线降级」（selector 派生自 `segState` error 计数）
- 点击展开列表：每项显示段名 +「重试」→ store 新增 `retrySegment(segId)`，
  复用 `runNeeded([segmentRequest(seg)])`
- 重试成功 `segState → ok`，badge 消失；段已删除时守卫自动忽略
- `useTripStore` 增加 `segmentRequest` 函数导入

## 3. 测试与验证

- ops 新增单测：`renameDay`/`reorderDays`（含 no-op 断言）、`changed` 标志全量回归
- memory repo：`remove`、昵称读取单测
- 全量 `npm test` 保持绿、`npm run lint` 干净
- 手工验收：删除流程、天拖拽、老 8 位分享链接可访问、绘制工具拖拽禁用行为不变

## 4. 实施顺序

1. 2.1 / 2.2 / 2.3 / 2.4 / 2.5（纯代码小改，无 UI）
2. 1.3 分享安全（shareId + 正则）
3. 1.1 删除行程（API + UI）
4. 1.2 天组织（ops + store + UI）
5. 2.6 失败 badge（唯一有交互量的修复）
6. 1.4 昵称 UI（首页 + 分享页）
