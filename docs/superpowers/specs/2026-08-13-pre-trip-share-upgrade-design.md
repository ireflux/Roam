# Roam 行前规划体验与分享页升级设计

- 日期：2026-08-13
- 状态：已确认，待实施
- 范围：4 项功能 —— 天日期+多日预报 / 行程统计与密度体检 / 收藏+轻量账号 / 分享页视觉升级
- 前置设计：2026-08-03-route-planner-design.md 及后续 spec（架构分层不变：纯函数 ops + Zustand store + 命令式地图副作用）

## 0. 总体结论

- **数据模型**：`TripDay` 增加可选 `date` 字段（JSONB，零破坏性）；新增 `saved_trips` 表支持收藏去重；新增 drizzle 迁移 `0003`。
- **账号**：采用 Neon Auth（Better Auth 全托管），邮箱验证码登录；登录时认领匿名行程；`ownerId` 语义升级为「会话用户 id 优先，否则匿名 cookie」。
- **分享页**：视觉整体重做为「明信片时间线」方向，固定浅色纸面，不渲染暗色。
- **API 变更**：`POST /api/trips` 支持携带 `data`/`title`（收藏复制用）；`/api/weather` 支持 `date` 参数返回预报；新增 `POST /api/claim` 扩展（认领）+ 收藏相关接口。
- 无 AI、无 QQ/微信等第三方登录、无密码（仅验证码）。

## 1. 功能一：天绑定日期 + 多日天气预报

### 1.1 数据模型

```
TripDay += date?: string   // "YYYY-MM-DD"，可选；未设置 = 无日期
```

- 历史数据无 `date` → 视为未设置，行为与现状完全一致；
- 日期仅用于展示与天气取数，不影响天排序（排序仍按 `days[]` 数组顺序）。

### 1.2 ops（纯函数）

- `setDayDate(data, dayId, date: string | null): { data, changed }`（`null` 清除日期）；
- 日期格式校验：`/^\d{4}-\d{2}-\d{2}$/` 且为合法日历日，非法输入直接 no-op。

### 1.3 天气 API

`/api/weather` 增加可选 `date` 参数：

| date | 返回 |
|---|---|
| 无 | 现行：实时天气（`extensions=base`） |
| 有，且位于预报窗口（今天 ~ 今天+2） | 预报 `extensions=all`：白天天气 + 温度区间（如 `26~34`） |
| 有，超出窗口（含过去日期） | `{ forecast: null }`，前端显示「暂无预报」 |

- 服务端缓存：预报结果按 **city** 维度缓存（一次调用返回全部预报天），TTL 1h，沿用 `lbs.ts` 缓存结构；
- 响应结构向后兼容：实时字段不变，新增 `forecast?: { weather, tempHigh, tempLow, date } | null`。

### 1.4 UI（编辑器 / 分享页共用）

- **天 Tab 日期设置**：每个天 Tab 右侧新增小日历图标（`📅`-风格 SVG），点击弹原生 `input type="date"`（含「清除日期」），不与双击改名/拖拽排序冲突；
- **天气徽标升级**（`WeatherBadge` 扩展）：
  - 有日期且在窗口内：`城市 · ☀晴 26~34°`；
  - 有日期但超窗：`城市 · 暂无预报`；
  - 无日期：现行实时样式；
- `useDayWeather` 改为按 `(dayId, date)` 取数，返回结构增加 forecast 分支；分享页沿用同一 hook。

## 2. 功能二：行程统计与密度体检

### 2.1 统计纯函数（ops.ts）

```ts
summarizeDay(data, dayId):  { stops, distanceM, durationMin, segments }
summarizeTrip(data):        { days, stops, distanceM, durationMin, segments }
```

- 距离/时长来自段上的 `distanceM`/`durationMin`（0 或缺失不计）；
- ShareView 现有内联 `summarize`（ShareView.tsx:74）收敛进 ops，分享页与编辑器共用。

### 2.2 密度预警规则（纯函数，可单测）

单日任一命中 → `{ warn: true, reasons: string[] }`：

| 规则 | 阈值 |
|---|---|
| 驾车/骑行里程过远 | 单日总里程 > 150 km |
| 移动时间过长 | 单日总时长 > 5 h |
| 站点过多 | 单日站点 > 8 |

- 文案示例：「这天可能太赶：驾车约 3 小时」；无命中 → 不提示，无视觉变化。

### 2.3 UI

- **编辑器侧栏**：每天头部（天数 Tab 与列表之间）显示 `N 站 · X km · 约 Y 小时`；命中预警时琥珀色小提示条；
- **顶部总览**：侧栏标题下方一行 `N 天 · N 站 · X km · 约 Y 小时`（移动抽屉头部同样展示）；
- **分享页**：明信片封面 4 指标格的数据来自同一组函数（见 §5）。

## 3. 功能三：收藏 + 轻量账号（Neon Auth）

### 3.1 Neon Auth 开通（基础设施，实施第一步）

- 使用 Neon MCP `provision_neon_auth` 为项目开通托管认证（创建 `neon_auth` schema 与托管认证服务）——**执行前需用户确认**；
- 应用侧接入：better-auth 客户端（`npm i better-auth`），baseURL 指向托管认证地址；`trusted_origins` 配置含本站域名；
- 新增环境变量：`BETTER_AUTH_SECRET` 等，按官方接入文档核对（实施含一次技术验证 spike：确认「登录态如何从客户端传递到本站 API」的最终握手方式，默认方案见 3.3）。

### 3.2 数据模型

```sql
saved_trips:  -- 迁移 0003
  id             uuid pk defaultRandom
  owner_id       text not null      -- Neon Auth 用户 id
  source_share_id text not null     -- 被收藏行程的 shareId
  trip_id        uuid not null      -- 复制出的行程 id
  created_at     timestamp default now
  UNIQUE (owner_id, source_share_id)  -- 天然去重
```

- `trips.owner_id` 兼容：会话用户 id 与匿名 cookie UUID 都是 text，无需迁移；
- memory repo 同步支持保存收藏（进程内 Map，key `owner|shareId`）。

### 3.3 ownerId 决议与认领

- `getOrCreateOwnerId()` 升级：请求携带有效登录凭证 → 返回用户 id；否则回落匿名 cookie（现行逻辑）；
- 登录时认领：`POST /api/claim` 扩展为「昵称 + 认领」一体：
  ```
  UPDATE trips SET owner_id = :userId WHERE owner_id = :cookieId AND cookieId <> userId
  profiles: cookieId 行迁移到 userId（删除旧行，防主键冲突）
  ```
- 客户端在登录成功后调用认领接口一次；首页「最近的路线」按决议后的 ownerId 查询，认领后跨设备自然可见。

### 3.4 收藏流程（分享页）

- 按钮三态：`☆ 收藏`（未登录）→ 点击弹登录浮层（邮箱 → 验证码 → 登录，Neon Auth 托管邮件）→ 登录成功自动认领 + 收藏 → `★ 已收藏 · 打开`；
- 收藏动作 = `POST /api/trips` 携带 `{ title, data }`（白名单校验 + `validation.ts` 结构校验，新生成 shareId）→ 写入 `saved_trips`；
- 已登录状态 `GET` 收藏态：按 `owner_id + source_share_id` 查询；
- 无 DB（内存回退）或未配置认证时：收藏按钮隐藏，匿名主流程不受影响。

## 4. 功能四：分享页视觉升级（明信片时间线）

### 4.1 设计基调（固定浅色纸面，不做暗色）

```
纸色背景   #F7F3EC      主绿      #0D7A5F
卡片白     #FFFFFF      金色      #C9A86A（时间线终点/点缀）
墨色文字   #23262B      琥珀      #B45309（第二位日号等强调）
次要文字   #8A857A      印章底色  rgba(255,255,255,.5)
```

- 日号用衬线字体（Georgia）大号数字 01/02/03，正文系统字体；
- 移动端布局与桌面同一套卡片流（全页纵向滚动，小红书式），地图嵌入封面卡，非左右分栏。

### 4.2 页面结构（自上而下）

1. **Topbar**：`ROAM` 品牌（墨绿）+ 右侧 `路线 · 由 {昵称} 分享`；
2. **封面明信片**（白卡、圆角、双层阴影）：
   - 顶部地图区 = 真实高德地图（`MapView` + 全段 overlay + fitView；**明信片内嵌地图**，不另立地图列）；
   - 地图上浮「游」字印章（固定字样，不随标题变化，标题缺省亦显示「游」）；
   - 卡内：标题大号加粗 + `by 昵称` + 4 指标格（`N 天 / N 站 / X km / 城市天气`，来自 §2 统计函数）；
3. **每日块**：
   - 日头：衬线大日号 + 天名 + 右侧 `M 月 D 日 · 周几 · 天气 · N 站 · 出行`（有日期时）；
   - 时间线：渐变墨绿→金竖线，站点圆点（绿色），末站金色圆点；站点行 = 名称 + 备注（淡字）+ 时间（若有）；每站行右侧小「导航」图标（`uri.amap.com/navigation`，`mode` 按现段出行方式映射 car/walk/bus/ride）；
   - 无站点的天：显示一句空态文案（「这一天还没有安排地点」）；
4. **底部操作栏**（sticky）：`▶ 播放全程`（保留原动画，作用于封面内嵌地图）＋ `☆/★ 收藏` ＋ 二维码按钮（`qrcode` npm 包客户端生成内嵌分享链接 data URL，点击弹放大浮层）；
5. **移动端**：操作栏下行追加 `导航到下一站`（导航到该天第一个站点）。

## 5. 环境变量与部署

- 新增：`BETTER_AUTH_SECRET`、托管认证地址相关（按接入文档定名）；`.env.example` 同步；
- 迁移：`0003` 提交后 `npm run db:migrate` 本地应用；Neon 主库迁移在部署时一并执行（可用 Neon MCP apply）。

## 6. 测试策略

- **ops 单测**：`setDayDate`（合法/非法/清除）、`summarizeDay/summarizeTrip`、密度预警三条规则边界值、收藏复制入参校验；
- **组件测试**：天气徽标三态（实时/预报/暂无预报）、天 Tab 日历图标交互、收藏按钮三态与登录浮层（mock 认证）、分享页统计展示；
- **Playwright**：分享页视觉冒烟（封面卡/时间线/操作栏可见）+ 收藏流程（mock 认证后收藏→已收藏态）；回归：编辑器天 Tab 改名/排序、分享页播放动画。

## 7. 实施顺序

1. **功能一**（日期 + 预报，纯数据与 UI，无外部依赖）→ 2. **功能二**（统计与体检）→ 3. **功能四**（分享页视觉，为收藏落位）→ 4. **功能三**（Neon Auth 开通 spike → 账号与收藏）。功能三最后实施可在前三个上线后独立推进。