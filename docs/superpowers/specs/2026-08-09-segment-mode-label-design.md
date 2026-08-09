# Roam 线段出行方式标签设计

- 日期：2026-08-09
- 状态：已确认，待实施
- 范围：编辑器内线段方式悬浮标签 + 缩放显隐
- 前置设计：2026-08-09-auto-mode-design.md（自动判型后段不再有全局方式按钮，需就地可读）

## 0. 总体结论

零 schema / API 变更。在 `MapLayers` 现有「增量同步 overlay」模式上新增一层线段标签：

- **标签**：每段路径长度 50% 处放一个迷你徽章（图标+方式名），标记该段出行方式；
- **显隐**：`zoom >= 12` 显示（常量 `LABEL_ZOOM_THRESHOLD = 12`），否则隐藏；监听
  `zoomchange` 增量切换，不重建；
- **特例**：降级段标「已降级」（琥珀），手绘（freehand）/吸附（snapped）段不标。

## 1. 标签形态

- 实现：`AMap.Marker`（同现有站点 marker），`content = HTML 字符串`，如
  `<span style="…">🚗 驾车</span>`；
- 内容：`MODE_ICON[mode] + MODE_LABEL[mode]`；白底、圆角、11px，左边框/圆点用
  `COLORS[mode]`（MapLayers 已有该色彩表，标签与线段颜色同一来源）；
- 降级段：内容「已降级」，边框琥珀 `COLORS.degraded`；
- 位置：沿折线按**累计长度 50% 处插值**（非两端中点，长线标签才不飘到空白处）。
  transit 段（可能拆 parts）仍以整段 geometry 统一取中点，只标一次。

## 3. 生命周期（复用现有增量同步）

- 新增 `labelsRef: Map<segId, AmapOverlay>`，与 `linesRef` 同批增删：
  - 天切换/数据变化的清理循环里同步剔除不存在的段标签；
  - 段几何/方式变化时更新 `setPosition` + `setContent`（不重建）；
- 点击标签 = 选中该线段（`selectSeg`），与线条一致，依旧 60ms 冒泡守卫内更新标记；
- 缩放事件：`map.on("zoomchange")` 里按 `getZoom() >= Threshold` 对全部标签
  `setVisible`；新增 overlay 类型成员 `setVisible?(v)`（markers 自带）。

## 4. 范围外

- 分享页只读卡片流不加标签（当前颜色语义已够，见后续按需）；
- 图例（B 方案）本次不做。

## 5. 测试

- 路径插值函数单测（`geo.test.ts` 或随 ops 测试：50% 处采样正确、首尾边界）；
- 组件级 vitest（参照 `useFreehandDrawing.test.tsx` 的 mock AMap 模式）：
  缩放阈值切换显隐、标签随段增删的增量同步最小场景；
- e2e：标签 DOM 可查询（`getByText("驾车")` 等），冒烟回归。见笔记：Marker content
  插入 DOM 而非 canvas，playwright 可定位。

## 6. 不在本设计内

- 参数（阈值 12、文字尺寸）调整走常量，后续可改。