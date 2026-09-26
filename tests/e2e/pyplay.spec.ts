import { expect, test } from "@playwright/test";
import { inkPixels, load, runAndWait, shareUrl } from "./helpers";

test("page is cross-origin isolated (needed by full Python)", async ({ page }) => {
  await page.goto("/");
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
});

for (const engine of ["fast", "python"] as const) {
  const label = engine === "fast" ? "快速引擎" : "完整 Python";

  test(`${engine}: turtle drawing appears on the canvas`, async ({ page }) => {
    await load(
      page,
      "import turtle\nt = turtle.Turtle()\nt.speed(0)\nt.color('red', 'yellow')\nt.begin_fill()\nfor i in range(5):\n    t.forward(150)\n    t.right(144)\nt.end_fill()\nprint('ok', t.heading())\n",
      { engine },
    );
    await runAndWait(page);
    await expect(page.locator("#status")).toContainText(label);
    await expect(page.locator("#status")).toContainText("运行完成");
    await expect(page.locator("#console")).toContainText("ok 0.0");
    expect(await inkPixels(page)).toBeGreaterThan(2000);
  });

  test(`${engine}: input() reads what the child types`, async ({ page }) => {
    await load(page, 'name = input("名字？")\nprint("你好", name, 4 / 2)\n', { engine });
    await page.click("#run");
    await expect(page.locator("#input-row")).toBeVisible({ timeout: 60_000 });
    await page.fill("#input-field", "小明");
    await page.press("#input-field", "Enter");
    await expect(page.locator("#status")).toHaveText(/运行完成/, { timeout: 30_000 });
    await expect(page.locator("#console")).toHaveText(/名字？\s*小明\s*你好 小明 2\.0/);
  });

  test(`${engine}: arrow keys drive onkey handlers until Stop`, async ({ page }) => {
    await load(
      page,
      'import turtle\ns = turtle.Screen()\nt = turtle.Turtle()\ndef up():\n    t.forward(50)\n    print("pos", t.position())\ns.onkey(up, "Up")\ns.listen()\nturtle.done()\n',
      { engine },
    );
    await page.click("#run");
    await expect(page.locator("#status")).toContainText("运行中", { timeout: 60_000 });
    await page.click("#canvas");
    await page.keyboard.press("ArrowUp");
    await expect(page.locator("#console")).toContainText("pos (50.00,0.00)");
    await page.keyboard.press("ArrowUp");
    await expect(page.locator("#console")).toContainText("pos (100.00,0.00)");
    await page.click("#stop");
    await expect(page.locator("#status")).toContainText("已停止");
  });

  test(`${engine}: Stop ends an infinite loop and the page stays usable`, async ({ page }) => {
    await load(page, "i = 0\nwhile True:\n    i += 1\n", { engine });
    await page.click("#run");
    await expect(page.locator("#status")).toContainText("运行中", { timeout: 60_000 });
    await page.waitForTimeout(500);
    await page.click("#stop");
    await expect(page.locator("#status")).toContainText("已停止", { timeout: 5_000 });
    await expect(page.locator("#run")).toBeEnabled();
    // and the next run works (a share link pasted into this tab opens as a new project)
    await page.goto(shareUrl("print('again')"));
    await expect(page.locator("#editor .cm-content")).toHaveText("print('again')");
    await runAndWait(page);
    await expect(page.locator("#console")).toContainText("again");
  });

  test(`${engine}: errors show a Chinese hint, the traceback and the line`, async ({ page }) => {
    await load(page, 'print("a")\nprnt("hello")\n', { engine });
    await runAndWait(page);
    await expect(page.locator("#status")).toContainText("出错了");
    await expect(page.locator(".error-card .title")).toHaveText(/第 2 行：Python 不认识 “prnt”/);
    await expect(page.locator(".error-card .hint")).toContainText("print");
    await expect(page.locator(".error-card pre")).toContainText("NameError: name 'prnt' is not defined");
    await expect(page.locator(".pyplay-error-line")).toHaveText('prnt("hello")');
  });
}

test("auto: programs outside the fast subset run on full Python", async ({ page }) => {
  await load(page, 'class A:\n    def hi(self):\n        return "hi from class"\nprint(A().hi())\n');
  await runAndWait(page);
  await expect(page.locator("#status")).toContainText("完整 Python");
  await expect(page.locator("#console")).toContainText("用到了 class 类定义");
  await expect(page.locator("#console")).toContainText("hi from class");
});

test("auto: a fast run that hits its limits restarts on full Python", async ({ page }) => {
  await load(page, 'def f(n):\n    return 0 if n == 0 else 1 + f(n - 1)\nprint("start")\nprint(f(900))\n');
  await runAndWait(page);
  await expect(page.locator("#status")).toContainText("完整 Python");
  await expect(page.locator("#console")).toContainText("改用完整 Python 重新运行");
  await expect(page.locator("#console")).toHaveText(/start\s*900/);
});

test("step mode highlights the running line", async ({ page }) => {
  await load(page, "total = 0\nfor i in range(3):\n    total = total + i\nprint(total)\n", { pace: "400" });
  await page.click("#run");
  await expect(page.locator(".pyplay-current")).toBeVisible();
  await expect(page.locator("#status")).toHaveText(/运行完成/, { timeout: 30_000 });
  await expect(page.locator("#console")).toContainText("3");
});

test("share link restores the program", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await load(page, "print('shared program 🐢')\n");
  await page.click("#share");
  await expect(page.locator(".toast", { hasText: "分享链接已复制" })).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/#code=/);
  const fresh = await context.newPage();
  await fresh.goto(url);
  await expect(fresh.locator("#editor .cm-content")).toContainText("shared program 🐢");
  await expect(fresh.locator("#project")).toContainText("分享的程序");
});
