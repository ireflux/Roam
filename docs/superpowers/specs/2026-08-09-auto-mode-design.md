# Roam 自动出行方式设计

- 日期：2026-08-09
- 状态：已确认，待实施
- 范围：新段出行方式自动推荐 + 移除顶栏方式按钮（工具行视觉归一）
- 前置设计：2026-08-03-route-planner-design.md（架构决策不变）

## 0. 总体结论

本次改动**零 schema / API 变更**。分两层：

- **自动判型**：所有"创建新段"的路径按两点直线距离启发式选出行方式，替代现在的固定
  `currentMode: "driving"` 默认值；
- **顶栏精简**：删除桌面/移动顶栏的出行方式选择按钮，解决"工具按钮与方式按钮同处一个
  工具行、只靠细线分隔、视觉上混为一类"的问题；手动改方式的口子保留在
  「点击选中线段 → 底部方式弹窗」（现有 `setMode`，已实现，零改动）。

## 1. 启发式规则

```ts
// ops.ts（或同层工具函数）
suggestMode(distanceM: number): Mode
  distanceM < 1500   → "walking"
  1500 ≤ distanceM ≤ 8000 → "cycling"
  distanceM > 8000   → "driving"
```

- 输入为两点 haversine 直线距离（复用现有 `roughDistanceM`），路由前即可算出；
- `transit` 永不自动：涉及等车/换乘，纯按距离判断不合理，需要时用户手动切；
- 距离 0（重复坐标）→ walking；
- 阈值定义为核心层常量，便于后续调整。

## 2. 应用点（全部走启发式）

| 路径 | 现状 | 改动后 |
|---|---|---|
| `addStop`（点击/搜索添加，生成 prev→new 段） | 传 `input.mode`（= currentMode） | `autoSegment` 内部按距离计算 |
| `completeFreehand`（自由绘制段） | 传 `mode`（= currentMode） | 同按距离启发式，仅作标签 |
| `removeStop` 重连段 | `?? "driving"` 兜底 | 兜底换启发式 |
| `reorderStops` / `inheritNeighborMode` | `?? "driving"` 兜底 | 兜底换启发式 |

「手动优先」继承逻辑不变：存在相邻段明确方式时优先沿用（用户在线的调整不回退），
仅无谓偏好时落回启发式。

## 3. 顶栏精简与状态清理

- 桌面顶栏：删除方式按钮组（与 4 工具同处一组的 4 个 MODE 按钮 + 分隔线），
  工具行只剩 选择/添加/绘制/改线；
- 移动端：删除「默认交通方式」chip 及其弹出选择器；
- 删除 `useTripStore.currentMode` / `setCurrentMode`；
- 更新调用点（不再传 mode）：
  - `MapLayers.tsx` 点击添加
  - `Editor.tsx` `pickStop` / `completeFreehand`
- 保留：点击选中线段后底部弹出的「方式」切换弹窗（唯一手动入口，现有功能）。

## 4. 数据兼容

- 段存储的 `mode` 值域不变（四值均为合法），老数据无需迁移；
- validate 逻辑不变。

## 5. 边界情况

- `addStopAt` 首个站点：无前段，不产生段，无需判型；
- 相同坐标站点：距离 0 → walking；
- 手绘段（freehand）：启发式只定标签；用户切换方式后走既有 `setSegmentMode`
  （转 auto 并触发路由）。

## 6. 测试

- **ops 单测**：`suggestMode` 阈值边界（1499/1500/8000/8001）、`addStop` 不传
  mode 时新段自动判型、`removeStop`/`reorder` 兜底判型；
- **store 单测**：调用签名更新（移除 mode 传参）；
- **e2e**：顶栏方式按钮无直接引用，回归跑通即可。

## 7. 不在范围内

- 路由结果回流后按真实里程二次切换方式（会扰民，不做）；
- 顶栏保留任何"默认方式"设置入口（YAGNI）；
- 交通方式图标的视觉升级。