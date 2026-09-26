import { deflateRawSync } from "node:zlib";
import { expect, type Page } from "@playwright/test";

/** A PyPlay share link for `code` (same format as src/share.ts). */
export function shareUrl(code: string): string {
  return `/#code=${deflateRawSync(Buffer.from(code, "utf8")).toString("base64url")}`;
}

/** Open PyPlay with `code` in a fresh project (via a share link). */
export async function load(
  page: Page,
  code: string,
  opts: { engine?: string; pace?: string } = {},
): Promise<void> {
  // one real navigation: a hash-only change would not reload PyPlay
  await page.addInitScript((engine) => localStorage.setItem("pyplay.engine", engine), opts.engine ?? "auto");
  await page.goto(shareUrl(code));
  await expect(page.locator("#project")).toContainText("分享的程序");
  if (opts.pace) await page.selectOption("#pace", opts.pace);
}

export async function runAndWait(page: Page): Promise<void> {
  await page.click("#run");
  await expect(page.locator("#status")).toHaveText(/运行完成|出错了|已停止/, { timeout: 60_000 });
}

/** Number of non-white pixels on a canvas. */
export async function inkPixels(page: Page, selector = "#canvas"): Promise<number> {
  return page.evaluate((sel) => {
    const c = document.querySelector(sel) as HTMLCanvasElement;
    const d = (c.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] !== 255 || d[i + 1] !== 255 || d[i + 2] !== 255) n++;
    return n;
  }, selector);
}

/** Answer the next window.prompt / confirm with `value` (true = accept). */
export function answerDialog(page: Page, value: string | boolean): void {
  page.once("dialog", (d) => {
    if (value === false) void d.dismiss();
    else void d.accept(typeof value === "string" ? value : undefined);
  });
}
