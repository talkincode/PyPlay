import { expect, test } from "@playwright/test";
import { answerDialog, load, runAndWait } from "./helpers";

async function typeAtEnd(page: import("@playwright/test").Page, text: string) {
  await page.click("#editor .cm-content");
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(text);
}

test("edits are saved to OPFS and survive a reload", async ({ page }) => {
  await load(page, "print('v1')\n");
  await typeAtEnd(page, "print('autosaved 🐢')");
  await expect(page.locator("#save-state")).toHaveText("✓ 已保存");
  await page.reload();
  await expect(page.locator("#editor .cm-content")).toContainText("print('autosaved 🐢')");
  await expect(page.locator("#project")).toContainText("分享的程序");
});

test("an edit is not lost when the tab closes before autosave", async ({ context }) => {
  const page = await context.newPage();
  await load(page, "print('v1')\n");
  await typeAtEnd(page, "print('typed just before closing')");
  await page.close(); // no time for the debounced save
  const again = await context.newPage();
  await again.goto("/");
  await expect(again.locator("#editor .cm-content")).toContainText("typed just before closing");
});

test("create, rename, tag, switch and delete projects", async ({ page }) => {
  await load(page, "print('first')\n");
  await page.click("#project");
  answerDialog(page, "作业一");
  await page.getByRole("button", { name: "＋ 新建" }).click();
  await expect(page.locator("#project")).toContainText("作业一");
  await expect(page.locator("#editor .cm-content")).toContainText("新项目");

  await page.click("#project");
  const card = page.locator('[data-project="作业一"]');
  answerDialog(page, "我的作业");
  await card.getByRole("button", { name: /改名/ }).click();
  await expect(page.locator('[data-project="我的作业"]')).toBeVisible();
  await expect(page.locator("#project")).toContainText("我的作业");
  answerDialog(page, "数学 周末");
  await page.locator('[data-project="我的作业"]').getByRole("button", { name: /标签/ }).click();
  await page.locator(".proj-body > .lib-chips .chip", { hasText: "#周末" }).click();
  await expect(page.locator(".proj-card")).toHaveCount(1);
  await page.locator(".proj-body > .lib-chips .chip", { hasText: "全部" }).click();
  await expect(page.locator(".proj-card")).toHaveCount(2);

  // switch back to the first project
  await page.locator('[data-project="分享的程序"] .proj-open').click();
  await expect(page.locator("#editor .cm-content")).toContainText("print('first')");

  // delete the current project: PyPlay falls back to the remaining one
  await page.click("#project");
  answerDialog(page, true);
  await page.locator('[data-project="分享的程序"]').getByRole("button", { name: /删除/ }).click();
  await expect(page.locator(".proj-card")).toHaveCount(1);
  await expect(page.locator("#project")).toContainText("我的作业");
  // cancelling a delete keeps the project
  answerDialog(page, false);
  await page.locator('[data-project="我的作业"]').getByRole("button", { name: /删除/ }).click();
  await expect(page.locator(".proj-card")).toHaveCount(1);
});

test("export .py / .zip and import a .py file", async ({ page }) => {
  await load(page, "print('export me')\n");
  await page.click("#project");
  const card = page.locator('[data-project="分享的程序"]');
  const [py] = await Promise.all([
    page.waitForEvent("download"),
    card.getByRole("button", { name: /\.py/ }).click(),
  ]);
  expect(py.suggestedFilename()).toBe("分享的程序.py");
  const [zip] = await Promise.all([
    page.waitForEvent("download"),
    card.getByRole("button", { name: /\.zip/ }).click(),
  ]);
  expect(zip.suggestedFilename()).toBe("分享的程序.zip");

  await page.locator('dialog.projects input[type="file"]').setInputFiles({
    name: "homework.py",
    mimeType: "text/x-python",
    buffer: Buffer.from("print('imported')\n"),
  });
  await expect(page.locator("#project")).toContainText("homework");
  await expect(page.locator("#editor .cm-content")).toContainText("print('imported')");
});

test("runs leave a thumbnail and saved pictures are counted", async ({ page }) => {
  await load(page, "import turtle\nt = turtle.Turtle()\nt.speed(0)\nt.circle(80)\n");
  await runAndWait(page);
  const [shot] = await Promise.all([page.waitForEvent("download"), page.click("#save-image")]);
  expect(shot.suggestedFilename()).toMatch(/^\d{8}-\d{6}\.png$/);
  await page.click("#project");
  const card = page.locator('[data-project="分享的程序"]');
  await expect(card.locator("img.thumb")).toBeVisible();
  await expect(card).toContainText("📷 1");
});
