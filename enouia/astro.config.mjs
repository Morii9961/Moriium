import { defineConfig } from "astro/config";

// No adapter, shared layout, content collection, or runtime service.
export default defineConfig({
  output: "static",
  build: { inlineStylesheets: "never" },
  vite: { build: { assetsInlineLimit: 0 } },
});
