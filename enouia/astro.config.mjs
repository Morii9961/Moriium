import { defineConfig } from 'astro/config';

// This site has no adapter, content collection, or shared Moriium runtime.
export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  build: { inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
  devToolbar: { enabled: false },
});
