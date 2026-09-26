import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
      { test: { name: "conformance", include: ["tests/conformance/**/*.test.ts"], testTimeout: 60_000 } },
    ],
  },
});
