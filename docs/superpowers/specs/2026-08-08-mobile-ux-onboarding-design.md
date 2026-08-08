# Roam 移动端适配与引导设计

- 日期：2026-08-08
- 状态：已确认，待实施
- 范围：P0 移动端编辑器完整适配 + P1 引导与可发现性（混合式）
- 前置设计：2026-08-03-route-planner-design.md（架构决策不变）

## 0. 总体结论

本次改动**零 schema / API 变更**。分两层：

- **P0 移动端**：断点 `<768px` 启用移动布局 —— 地图全屏 + 底部抽屉（Bottom Sheet），
  核心 4 工具常驻不滚动；绘制/改线改为 pointer events，触及 touch 手势全流程；
  桌面双栏布局与行为不变。
- **P1 引导**：分层混合式（L0 轻量欢迎层 → L1 情境首启提示 → L2 常驻可发现性），
  localStorage 驱动，桌面与移动共用一套。

## 1. P0 移动端布局

### 1.1 断点策略

- `< 768px`（Tailwind `md`）：移动布局 —— 地图全屏 + 底部抽屉
- `≥ 768px`：现有桌面双栏（侧栏在右），不改动
- 不做第三档（平板横屏视同移动布局）；手机横屏亦按 768px 判定

### 1.2 移动端页面骨架

```
┌──────────────────────────────────┐
│ ① 工具行（常驻、不横向滚动）        │ 选择/添加/绘制/改线 | 模式 chip | 路况
│ ② 搜索行（全宽；聚焦时收工具行）     │ 🔍 搜索地点…
├──────────────────────────────────┤
│ ③ 地图（全屏，marker/线路/线段浮条） │
│    · 绘制/改线时右上角：🔒 已锁定地图（可点击解除）
├──────────────────────────────────┤
│ ④ 底部抽屉（默认 ~42% 屏高）        │
│    头部：标题✏️ · ✓保存状态 · ↩ · ↪ · ⤴分享
│    天 tab：📅 第1天 [第2天] [+天] 天气徽标
│    stop 卡片：序号 名称 备注 ✎   （点卡片→地图定位+高亮）
└──────────────────────────────────┘
```

### 1.3 抽屉（MobileDrawer）交互

- **档位**：半开 42%（浏览/点选）↔ 全屏 92%（完整编辑）。拖动柄 + 内容区上拉/下拉（下拉越过阈值回半开），橡皮筋回弹
- **全屏态**：stop 卡片展开完整编辑行（名称/备注/换天/删除/上移/下移）；工具行走常驻；地图仍可全屏操作
- **联动**：点地图 marker → 抽屉滚动定位该卡片 + 高亮闪烁；点卡片 → 地图 flyTo 定位 + 高亮
- **抽屉持续状态**：保存状态 chip 只出现在抽屉头部（移动端）；工具行不含撤销/重做（分级原则）
- **实现**：`MobileDrawer` 组件 + `useDrawer` 状态机；桌面侧栏与移动抽屉共享同一
  `TripSidebarContent` 内容组件，布局容器按断点渲染侧栏或抽屉

### 1.4 工具行与搜索

- **第一行（地图上下文，常驻）**：选择/添加/绘制/改线 4 工具 + 当前默认交通模式
  折叠 chip（点开弹出 4 模式选择器）+ 路况开关 —— 全部不滚动
- **第二行**：全宽搜索框；聚焦时第一行收起（flex 高度动画）减少遮挡，失焦恢复
- 所有按钮触达区 ≥ 44×44px（含桌面工具行按 44px 重算触达区）
- 分享：`navigator.share` 优先，fallback 复制链接 + toast

### 1.5 移动端搜索与列表

- 搜索结果下拉浮在地图上方，结果行 ≥48px 高；点结果添加 stop 后面板自动收起
- 降级路段提示条可展开，与桌面共用组件

## 2. P0 手势与绘制（touch 化）

### 2.1 事件层改造

- `useFreehandDraw` / `useVertexSnap` 由 mouse 事件改为 **pointer events**（捕获
  pointerId，`setPointerCapture`），桌面鼠标行为保持兼容
- 拖拽排序等列表拖拽（原 HTML5 DnD 鼠标可用但 touch 不可用）→ 改 pointer 拖拽
  （`/editor/...TripSidebarContent` 内 stop 卡片）

### 2.2 绘制/改线流程（移动端）

进入绘制或改线工具时：

1. **地图锁定**：单指 = 绘制/拖顶点；双指 = 缩放平移照常；绘制锁定在切换到选择工具时解除
2. **抽屉自动收起** → 显示底部悬浮提示条（见 P1 L1）
3. 右上角显示 `🔒 地图已锁定` chip，点击解除（地图恢复可用，绘制工具保持激活）
4. 绘制/改线完成（pointup）→ 提示条消失 → 抽屉恢复原档位

### 2.3 线段模式选择浮条

- 跟随 segment 选择的底部浮条（桌面已在）位置自适应：桌面 bottom-center，
  移动端 bottom 高于抽屉边缘；移动端浮条模式按钮触达区 ≥44px

## 3. P1 引导与可发现性（混合式）

分层结构，localStorage 驱动，**不重复打扰**；桌面/移动共用。

### L0 欢迎层（首次进编辑器）

- 条件：`useOnboarding` 首次进入（`roam_onb_level0: done`）
- 内容 2 步 overlay 卡片：
  1. 「地点之间会自动规划线路」（配小示意图：两地点 + 连线）
  2. 「点画笔可自由手绘，紫色圆点可微调」
- 右上角「跳过」或「开始使用」；展示一次，永不再播；仅首次进入编辑器时出现

### L1 情境首启提示（首次触发某操作时）

每个功能一个 localStorage flag（key: `roam_hint_<feature>`）：

| 触发时机        | 提示文案                                   | 位置      |
|-----------------|--------------------------------------------|-----------|
| 首试点绘制工具  | 按住地图开始绘制 · 松手完成                  | 底部提示条 |
| 首次点改线工具   | 点击路线选择，再拖动紫色圆点调整            | 底部提示条 |
| 首次搜索添加结果 | 点地点加入行程                                | 搜索结果面板顶部 |
| 首次降级失败      | 当前路段无法规划，可切换步行或改自由绘制    | 降解浮条 |
| 首次删除 stop    | 删除后路线会自动重连                        | 确认弹窗旁 |

- 提示非阻塞：3.5s 自动消失 + 「知道了」按钮；提示条自身可点击，地图手势不受阻
- 同一提示只出现在 1 次（localStorage flag 标记）

### L2 常驻可发现性

- 应用 icon 均带 tooltip：桌面 hover / 移动端长按
- 空状态引导：
  - 空行程抽屉占位卡：「🔍 搜索地点开始 · 或在地图上点一下」
  - 空行程 + 地图点击 → 地图中央气泡「点这里添加第一个地点」
- 保存失败时 chip 显示：附「重试」按钮 + 原因摘要

### L3 可选（不承诺实现）

- 快捷键提示（Ctrl+Z 撤销）在桌面 tooltip 尾部
- 首次绘制成功后 toast「路段已保存 ✓」正反馈

### 3.5 实现要点

- `useOnboarding` hook：状态 = `{ l0Done, seen: Set<HintKey>, l2Dismissed }`；
  localStorage JSON；key 独立于 tripId（L0 跨行程唯一进步）
- 统一 `<TipBanner>` / `<HintPopover>` 基础组件（位置/时长/可关闭），全部情境提示
  复用，避免重复实现
- 提示 DOM 结构独立于地图容器，pointer-events 仅作用于提示自身

## 4. 测试

### 4.1 Vitest 组件测试（新增，jsdom territory）

- `useDrawer` 状态机：挡位切换阈值、回弹、恢复档位
- pointer 手势：绘制流程（pointerdown/move/up 模拟）、锁定态下双指缩放不打断绘制、
  点击线段选择
- `useOnboarding`：flag 状态机、持久化与重置

### 4.2 Playwright E2E 冒烟（首次引入）

- 安装：`npm i -D @playwright/test` + `npx playwright install --with-deps chromium`
  （Arch无需预装，install-with-deps 原生支持 Arch）
- 关键用例（移动视口 375×812 + 桌面 1440×900 两处跑）：
  1. 首页新建 → 编辑器打开（移动端抽屉默认 42% 可见）
  2. 移动端搜索添加 stop → 卡片出现在抽屉 → 地图出现 marker
  3. 绘制工具 → 锁图标出现 → 拖画手势绘制 → 路径保存
  4. 改线工具 → 拖顶点 → 路段更新
  5. 保存状态最终变为 ✓ 已保存
- CI 不是本次范围（本地 `npm run test:e2e`）

## 5. 文件改动清单

```
src/components/editor/MobileDrawer.tsx      # 新增：底部抽屉容器+手势
src/hooks/useDrawer.ts                      # 新增：抽屉状态机
src/hooks/useOnboarding.ts                  # 新增：L0/L1/L2 状态与查询
src/components/editor/TipBanner.tsx         # 新增：统一提示条
src/components/editor/HintPopover.tsx       # 新增：tooltip 统一组件
src/components/editor/Editor.tsx            # 改：断点布局接入/MobileDrawer 渲染分支
src/components/editor/TripSidebarContent.tsx# 拆出：侧栏内容（与桌面共用）
src/components/editor/useFreehandDraw.ts    # 改：pointer events + 锁定态
src/components/editor/useVertexSnap.ts      # 改：pointer events + 锁定态
src/components/editor/MapLayers.tsx         # 改：锁定指示、线段选择 touch
src/components/editor/SearchBox.tsx         # 改：移动面板化、结果行≥48px
src/components/editor/weather/useDayWeather.tsx # 微调：抽屉天 tab 位置
package.json                                # playwright 依赖 + test:e2e 脚本
playwright.config.ts                        # 新增
e2e/*.spec.ts                               # 新增
```

## 6. 明确不做

- 不引入交互式 step-by-step 大教程 / 动画演示播放器
- 不做强制「完成引导才可用」门槛
- 不做瀑布流 item 手势（swipe-to-delete 等约定俗成之外不引入）
- 不做编辑手势与地图手势的 AI 意图猜测（全局区分器方案）
- 不调整桌面双栏样式（断点以上保持现状）