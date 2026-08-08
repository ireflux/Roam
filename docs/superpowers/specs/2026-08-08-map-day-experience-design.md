# Roam 地图「按天组织」与「自动定位」体验设计

- 日期：2026-08-08
- 状态：已确认，待实施
- 范围：3 项体验优化（相机自动跟随 / 地图按天过滤与归属 / 列表点击定位 vs 编辑）
- 前置设计：2026-08-07-product-hardening-design.md（不改变其架构决策；本次零 schema 变更）

## 0. 总体结论

三个体验问题的根源均已定位：

1. **相机不跟随**：`MapView` 构造地图写死 `center=中国中心, zoom=4`（`MapView.tsx:47-52`），编辑器内没有任何 fit-bounds 调用；唯一 `setFitView` 在分享页 `ShareView.tsx:49`。移动端「点击地点会自动定位」其实是抽屉列表的 `locateStop`（`Editor.tsx:84-91`），只接了移动端。
2. **路线进错天**：`activeDayId` 只是 `Editor.tsx:39` 的组件本地 state，从未传给创建路径；`addStopAt`/`completeFreehand` 缺省全部回落 `days[0]`（`useTripStore.ts:238`、`ops.ts:354`）。
3. **地图不随标签变化**：`MapLayers` 一次性渲染全部天的 overlay，无按天过滤。

**核心思路**：`activeDayId` 提升为 store 级状态（单一事实），地图渲染与新增归属都以它为基准；相机 fit 逻辑放入 `MapLayers`（它持有 overlay 引用）；列表行统一「单击 = 定位，编辑 = 显式按钮」。

架构分层不变：纯函数 ops + Zustand store + 命令式地图副作用。

## 1. 天数状态入 store（解决路线归属错乱）

### 1.1 state 与 action

- `useTripStore` 新增 `activeDayId: string | null` 与 `setActiveDayId(id)`；`null` 语义 = 「未显式选择，回落 `days[0]`」（沿用 `Editor.tsx:51` 的兜底表达式，收敛到 store 内一个 getter 或调用点统一处理）。
- `Editor.tsx` 删除本地 `useState<activeDayId>`（line 39），改用 store；`setActiveDayId` 替换 `onDayChange`。
- `DayTabs` 的 `onDayChange` 指向 `store.setActiveDayId`。

### 1.2 归属规则

- `addStopAt`：`input.dayId ?? get().activeDayId ?? days[0]?.id ?? "d1"`（`useTripStore.ts:238`）。地图点击（`MapLayers.tsx:196`）、搜索（`Editor.tsx:80`）均不传 dayId，由 store 自动采用当前标签。
- `completeFreehand`：`ops.ts:354` 的兜底链改为 `start?.dayId ?? end?.dayId ?? activeDayId ?? days[0]`（先吸附端点，无吸附才落当前天）。

### 1.3 增删天时的 active 协调（移到 store，单一入口）

- `addDay`：新天创建后自动 `setActiveDayId(新 id)`（「+ 天」后直接编辑新天，且相机跟随 3.2 自然生效）。
- `removeDay`：若被删叶天恰是 active，自动迁移到相邻天（复用 `DayTabs` 现有 `idx+1 ?? idx-1` 逻辑，`TripSidebarContent.tsx:275-279` 移除局部 fallback，收敛进 store action，杜绝双源）。

## 2. MapLayers 按天渲染

- 渲染过滤器提取为两个纯函数（放 `ops.ts` 或 `MapLayers.tsx` 顶部，便于单测）：
  - `dayStops(data, dayId)`：`stops.filter(s => s.dayId === dayId)`
  - `daySegments(data, dayId)`：`segments.filter(seg => fromStop 的 dayId === dayId)`；**跨天段的归属 = 起点站所在天**（`fromStop` 站被移天时随起点迁移）。
- 现有增量 diff 机制（按 id 增删改，`MapLayers.tsx:82-141`）无需改造：过滤后的渲染集合变化，diff 自动移除不属当天的 overlay、保留当天的。
- `stopLabels` 编号仍按天独立（已如此，`MapLayers.tsx:34-47`）。
- 地图点击的吸附（freehand 找 100m 内站点）可能吸到「当天不可见」的站点——保持现状（吸附是几何行为，不分天），但归入天链在 1.2 已兜底。

## 3. 相机自动跟随（MapLayers 内新增副作用）

在 `MapLayers` 增加一个 effect（依赖 `[map, data, activeDayId]`），首次渲染后或 day 改变时调用：

### 3.1 时机

1. **进入行程**：数据加载 + overlay 构建完成后，fit 全行程（全部天的段与站点）。以 `trip.id` 记一次（`fittedTripIdRef`），再次进入同一 trip 不重复 fit。无任何站点 → 跳过（保持默认中国视图）。
2. **切换天数标签**：fit 到 target 天的 overlay；**空天不移动相机**（避免空白跳动）。
3. **绘制完成不做 fit**（用户确认不需要——绘制时相机本就在合适位置，强制 fit 打断手势）。
### 3.2 用户交互守卫

- `userInteractedRef`（模块/组件内）：地图首次 `dragstart`/`zoomstart` 后置 true，此后所有自动 fit 跳过（「用户接管了相机，不再强制」）。
- 监听在一次 effect 内注册，随 map 实例变化重置。
### 3.3 实现

- overlay 数组取 `linesRef`/`markersRef` 中当前天的实例（已有引用，无需重建），调 `map.setFitView(overlays, true, padding, 16)`。
- padding：桌面 `[48, 48, 48, 380]`（右侧栏约 320px 宽），移动 `[48, 48, 48, 48]`；`MapLayers` 内部 `useIsMobile()` 取值（复用 `src/hooks/useIsMobile`，避免加 prop）。
- `setFitView` 已在 `mapTypes.ts:11` 声明，无需改类型。
- 若当天仅有 stop 无段，overlay 只含 markers，fit 仍正确收敛到点。

## 4. 列表「单击定位 / 显式编辑」双操作

- **统一行为**：`TripSidebarContent` 的地点行（desktop 与 mobile）单击都调用 `onLocateStop(stop)`——复用现有 `locateStop`（选中 + 居中 zoom 15，见 `Editor.tsx:84-91`），删除 `else setEditing(true)` 分支。
- `Editor.tsx` 桌面 `<aside>` 补传 `onLocateStop={locateStop}`（目前只传了移动端 drawer）。
- **编辑入口**：桌面行 hover 时显示铅笔按钮（`opacity-0 group-hover:opacity-100` 过渡，录入行聚焦也可用）；移动端保持当前「常显铅笔」。
- 拖拽手柄、删除按钮位置/行为不变；桌面「拖拽排序」文字提示保留。
- `selectStop` 顺带高亮 marker（现有 `stopContent(selected)` 逻辑），行内其余交互无改动。

## 5. 边界情况

| 场景 | 行为 |
|---|---|
| 空行程进入 | 不 fit，默认中国视图 |
| 切到空天 | 不动相机，地图清空为无 overlay |
| 删除 active 天 | store 迁到相邻天并 fit 新天 |
| 跨天段 | 归属起点站所在天 |
| 用户手动拖/缩放 | 本次会话不再自动 fit（守卫） |
| 全行程有几个天 | 进入 fit 全行程（一次），之后每切天 fit |
| stop 被移走另一天（moveStopToDay） | diff 自动消失，段归属随起点 |
| map 实例更换（StrictMode/路由） | overlay 注册表重建，fit 守卫重置 |

## 6. 测试

- 单测（vitest）：
  - `dayStops`/`daySegments` 纯函数（含跨天归属、移天后的归属变化）
  - store：`addStopAt` 在 `activeDayId` 有/无时的归属；`completeFreehand` 兜底链（端点吸附优先于 activeDay）
  - `removeDay` 删除 active 天后的 active 迁移
- e2e（playwright, `e2e/editor.spec.ts` 追加）：
  - 切换天标签 → 侧栏地点/段数量变化且 map 上绘制后归属正确天（侧栏标签计数断言）
  - 桌面单击地点行 → 不再立刻进入编辑态（无输入框出现），铅笔按钮可进入编辑
- 手动验证：fit 行为、hover 出现编辑按钮、跨端手感

## 7. 不在本次范围

- `ShareView` 已有 fit 行为不改
- 地图聚合/多天同时查看开关（如「全部天概览」模式）不做（派生成本低，先不加）
- 相机位置持久化到行程数据（可后续做）