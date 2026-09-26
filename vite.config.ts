import { defineConfig } from "vite";

// Cross-origin isolation is required for SharedArrayBuffer (input(), events,
// Stop). Production gets the same headers from public/_headers.
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export default defineConfig({
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  worker: { format: "es" },
  build: { target: "es2022", sourcemap: true },
});
