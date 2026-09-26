import { defineConfig, devices } from "@playwright/test";

// E2E runs against the production build (`pnpm build` first), served with
// the same cross-origin isolation headers as Cloudflare.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 860 } } },
  ],
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
});
