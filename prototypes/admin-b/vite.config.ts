import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { safeResolve } from '../shared/safe-path.ts';

const FIXTURE_MEDIA = resolve(import.meta.dirname, '../fixtures/media');
const PREFIX = '/media/fixtures/';

const TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

/**
 * Serves the fixture corpus's media read-only, so an image node in the editor
 * shows the actual picture instead of a broken icon.
 *
 * Containment is checked with the prototypes' own safeResolve rather than a
 * second hand-written check: it resolves symlinks and junctions, which a string
 * comparison here would not. The corpus stays a read-only input; nothing in
 * this handler writes.
 */
function fixtureMedia(): Plugin {
  return {
    name: 'moriium-fixture-media',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = (request.url ?? '/').split('?')[0] ?? '/';
        if (!url.startsWith(PREFIX)) {
          next();
          return;
        }

        // safeResolve takes a path relative to the root and returns the real
        // absolute one, refusing anything that climbs or links out. Handing it
        // an already-resolved absolute path is rejected on purpose, so the
        // relative name is what goes in.
        let file: string;
        try {
          file = safeResolve(FIXTURE_MEDIA, decodeURIComponent(url.slice(PREFIX.length)));
        } catch {
          next();
          return;
        }

        if (!existsSync(file) || !statSync(file).isFile()) {
          next();
          return;
        }

        response.setHeader('Content-Type', TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        createReadStream(file).pipe(response);
      });
    },
  };
}

// The API runs as a separate node:http server (src/dev/serve.ts). Proxying
// keeps the browser on one origin, so the Origin and Host guards see exactly
// what they would see in a real deployment instead of being bypassed by CORS.
export default defineConfig({
  plugins: [vue(), fixtureMedia()],
  server: {
    port: 4320,
    fs: {
      // Vite's dev server serves the project tree, which by default includes
      // admin-b/.data/admin.db: the prototype database, downloadable over http
      // with no session at all. The API's guards mean nothing while the file
      // itself is fetchable from the sibling port, so it is denied here.
      deny: ['**/.data/**', '**/*.db', '**/*.db-wal', '**/*.db-shm', '**/.env', '**/.env.*'],
    },
    // Fail loudly instead of drifting onto the API's port when 4320 is taken.
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4321',
        changeOrigin: false,
      },
    },
  },
});
