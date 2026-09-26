import { expect, test } from "@playwright/test";
import { inkPixels, runAndWait } from "./helpers";

test("example library: browse, search, preview, and load into a new project", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#project")).toContainText("动物打招呼"); // first lesson
  const before = await page.locator("#editor .cm-content").textContent();

  await page.click("#library");
  const dialog = page.locator("dialog.library");
  await expect(dialog).toBeVisible();
  const sidebar = dialog.locator(".lib-sidebar");
  await sidebar.getByRole("button", { name: /^小游戏/ }).click();
  await expect(dialog.locator(".lib-card .title")).toContainText(["猜数字"]);
  await dialog.locator(".lib-search").fill("递归");
  await expect(dialog.locator(".lib-card")).toHaveCount(0); // 小游戏 has no recursion example
  await sidebar.getByRole("button", { name: /^全部/ }).click();
  await expect(dialog.locator(".lib-card .title")).toHaveText(["递归画树", "科赫雪花", "汉诺塔"]);
  await dialog.locator(".lib-search").fill("");

  // details first: nothing touches the editor yet
  await dialog.locator('[data-example="square"]').click();
  await expect(dialog.locator(".detail h3")).toHaveText("🟦 正方形");
  await expect(dialog.locator(".learn")).toContainText("forward()");
  await expect(dialog.locator(".preview-code")).toContainText("t.left(90)");
  await expect.poll(() => inkPixels(page, ".preview-canvas"), { timeout: 15_000 }).toBeGreaterThan(300);
  expect(await page.locator("#editor .cm-content").textContent()).toBe(before);

  await dialog.getByRole("button", { name: "加载到编辑器" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#project")).toContainText("正方形");
  await expect(page.locator("#editor .cm-content")).toContainText("t.left(90)");
  // the previous project is still there
  await page.click("#project");
  await expect(page.locator(".proj-card .title")).toContainText(["正方形", "动物打招呼"]);
});

test("example preview feeds scripted input() answers", async ({ page }) => {
  await page.goto("/");
  await page.click("#library");
  await page.locator('[data-example="grade"]').click();
  await expect(page.locator(".preview-output")).toContainText("87");
  await expect(page.locator(".preview-output")).toContainText("B，很不错！");
});

test("favorites and learning progress are remembered", async ({ page }) => {
  await page.goto("/");
  await page.click("#library");
  const dialog = page.locator("dialog.library");
  await dialog
    .locator(".lib-sidebar")
    .getByRole("button", { name: /^小游戏/ })
    .click();
  await dialog.locator('[data-example="dice"]').click();
  await dialog.getByRole("button", { name: "☆ 收藏" }).click();
  await expect(dialog.getByRole("button", { name: "★ 已收藏" })).toBeVisible();
  await dialog.getByRole("button", { name: "加载到编辑器" }).click();
  await runAndWait(page);
  await expect(page.locator("#status")).toContainText("运行完成");

  await page.reload();
  await page.click("#library");
  const sidebar = dialog.locator(".lib-sidebar");
  await sidebar.getByRole("button", { name: /^★ 收藏/ }).click();
  await expect(dialog.locator(".lib-card")).toHaveCount(1);
  await expect(dialog.locator('[data-example="dice"] .badge')).toHaveText("✅ 运行过");
  await expect(sidebar.getByRole("button", { name: /^随机/ })).toContainText("1/");
  // un-favorite
  await dialog.locator('[data-example="dice"]').click();
  await dialog.getByRole("button", { name: "★ 已收藏" }).click();
  await dialog.getByRole("button", { name: "← 返回" }).click();
  await expect(dialog.locator(".lib-card")).toHaveCount(0);
  await expect(dialog.locator(".lib-empty")).toContainText("还没有收藏");
});

test("keyboard examples can be tried inside the preview", async ({ page }) => {
  await page.goto("/");
  await page.click("#library");
  await page
    .locator("dialog.library .lib-sidebar")
    .getByRole("button", { name: /^小游戏/ })
    .click();
  await page.locator('[data-example="keys"]').click();
  await expect(page.locator(".preview-output")).toContainText("方向键");
  const before = await inkPixels(page, ".preview-canvas");
  await page.locator(".preview-canvas").click();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => inkPixels(page, ".preview-canvas")).toBeGreaterThan(before);
});
