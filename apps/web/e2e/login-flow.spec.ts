import { test, expect } from "@playwright/test";

test("分享页收藏弹登录浮层", async ({ page }) => {
  const res = await page.request.post("/api/trips", { data: { title: "登录冒烟" } });
  const { shareId } = (await res.json()) as { shareId: string };
  await page.goto(`/t/${shareId}`);
  await expect(page.getByTitle(/登录后收藏/)).toBeVisible();
  await page.getByTitle(/登录后收藏/).click();
  await expect(page.getByRole("dialog", { name: "登录" })).toBeVisible();
  await expect(page.getByText("登录后收藏这条路线")).toBeVisible();
  await page.getByPlaceholder("you@example.com").fill("demo@example.com");
  await page.getByRole("button", { name: "发送验证码" }).click();
  await expect(page.getByText(/发送中|验证码已发送/)).toBeVisible({ timeout: 15_000 });
});
