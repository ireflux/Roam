import { test, expect, Page } from "@playwright/test";

/** 直接建一个空 trip 并进入编辑器，预置 L0 已完成，跳过欢迎层 */
async function gotoEditor(page: Page): Promise<string> {
  const res = await page.request.post("/api/trips", { data: { title: "冒烟测试" } });
  expect(res.ok()).toBeTruthy();
  const { id } = (await res.json()) as { id: string };
  await page.addInitScript(() => {
    try {
      localStorage.setItem("roam_onb", JSON.stringify({ l0Done: true, hints: {} }));
    } catch {
      /* noop */
    }
  });
  await page.goto(`/editor/${id}`);
  await expect(page.getByTestId("map-container")).toBeVisible({ timeout: 30_000 });
  return id;
}

/** 沿拖动柄垂直拖拽：dy 为相对起点的位移（向上为负） */
async function dragHandle(page: Page, dy: number) {
  const handle = page.getByTestId("drawer-handle");
  const box = (await handle.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2 - 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + dy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250); // 回弹动画
}

async function drawerHeight(page: Page) {
  return (await page.getByTestId("mobile-drawer").boundingBox())!.height;
}

test.describe("编辑器冒烟", () => {
  test("桌面端：加载后侧栏、工具行与地图可见", async ({ page }) => {
    await gotoEditor(page);
    await expect(page.getByPlaceholder("路线标题")).toBeVisible();
    await expect(page.getByTitle("实时路况")).toBeVisible();
    await expect(page.getByPlaceholder(/搜索地点/)).toBeVisible();
  });

  test("移动端：抽屉三档拖拽（half → full → half → 收起）", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes("mobile"), "仅移动端");
    await gotoEditor(page);
    await expect(page.getByTestId("mobile-drawer")).toBeVisible();
    const halfH = await drawerHeight(page);
    expect(halfH).toBeGreaterThan(0);

    await dragHandle(page, -220); // → full
    const fullH = await drawerHeight(page);
    expect(fullH).toBeGreaterThan(halfH * 1.7);

    await dragHandle(page, 700); // full → half
    const backH = await drawerHeight(page);
    expect(backH).toBeLessThan(fullH * 0.8);

    await dragHandle(page, 700); // half → 收起
    await expect.poll(() => drawerHeight(page)).toBeLessThan(20);
  });

  test("移动端：搜索聚焦收起工具行，完成后恢复", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes("mobile"), "仅移动端");
    await gotoEditor(page);
    const toolChip = page.getByTitle("实时路况").first();
    await expect(toolChip).toBeVisible();
    await page.getByPlaceholder(/搜索地点/).first().click();
    await expect(toolChip).toBeHidden({ timeout: 5_000 });
    await page.getByRole("button", { name: "完成" }).click();
    await expect(toolChip).toBeVisible();
  });

  test("移动端：绘制工具生效（引导提示 + 地图锁定 + 抽屉自动收起/恢复）", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes("mobile"), "仅移动端");
    await gotoEditor(page);
    await expect(page.getByTestId("mobile-drawer")).toBeVisible();
    await page.getByTitle("绘制").click();
    await expect(page.getByText("按住地图开始绘制 · 松手完成")).toBeVisible();
    await expect(page.getByText("🔒 已锁定")).toBeVisible();
    await expect.poll(() => drawerHeight(page)).toBeLessThan(20);
    await page.getByTitle("选择").click();
    await expect.poll(() => drawerHeight(page)).toBeGreaterThan(20);
  });

  test("保存：改标题后自动保存并持久化", async ({ page }) => {
    const id = await gotoEditor(page);
    await page.getByPlaceholder("路线标题").fill("冒烟测试-改名");
    await expect(page.getByText(/待保存|dirty|saving/)).toBeVisible();
    await expect(page.getByText(/已保存|saved/)).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(async () => (await (await page.request.get(`/api/trips/${id}`)).json()).title, {
        timeout: 20_000,
      })
      .toContain("冒烟测试-改名");
  });
});