// The startup entry for prototype B.
//
// Starts the API on one port and Vite on another, so `pnpm -C prototypes dev:b`
// is the single command that makes B operable. Both are local-only: the API
// binds 127.0.0.1 and its Host allowlist refuses anything else, which is the
// guard ADR section 5 asks for rather than a claim that binding is enough.

import { createServer as createViteServer } from 'vite';
import { resolve } from 'node:path';
import { SessionStore } from '../auth/sessions.ts';
import { hashPassword } from '../auth/passwords.ts';
import { createAdminServer } from '../http/server.ts';
import { Store } from '../storage/store.ts';
import { seedIfEmpty } from './seed.ts';

const API_PORT = 4321;
const UI_PORT = 4320;

/**
 * Deliberately not a secret, and deliberately not generated.
 *
 * The prototype is a local spike whose sessions live in memory and whose
 * cookies cannot carry `Secure` over http. Inventing a password here would
 * suggest this is safe to expose; it is not. Override it with
 * MORIIUM_ADMIN_PASSWORD when running anything that matters.
 */
const PROTOTYPE_PASSWORD = 'moriium-prototype';

const DB_PATH = resolve(import.meta.dirname, '../../.data/admin.db');

async function main(): Promise<void> {
  const store = Store.open(DB_PATH);
  const seeded = seedIfEmpty(store);

  const password = process.env.MORIIUM_ADMIN_PASSWORD ?? PROTOTYPE_PASSWORD;
  const api = createAdminServer({
    store,
    sessions: new SessionStore(),
    passwordHash: await hashPassword(password),
    // Vite proxies with the browser's own Host and Origin (changeOrigin is
    // off), so the UI port has to be answered for as well. The list stays an
    // exact allowlist, which is what refuses a rebound name.
    allowedHosts: [
      `localhost:${UI_PORT}`,
      `127.0.0.1:${UI_PORT}`,
      `localhost:${API_PORT}`,
      `127.0.0.1:${API_PORT}`,
    ],
    log: (message) => console.error(message),
  });

  await new Promise<void>((done) => api.listen(API_PORT, '127.0.0.1', done));

  const vite = await createViteServer({ root: resolve(import.meta.dirname, '../..') });
  await vite.listen(UI_PORT);

  console.log('');
  console.log('  Prototype B');
  console.log(`  Open        http://localhost:${UI_PORT}/`);
  console.log(`  API         http://127.0.0.1:${API_PORT}/`);
  console.log(`  Articles    ${seeded > 0 ? `${seeded} seeded from the fixture corpus` : 'kept from the previous session'}`);
  console.log(
    process.env.MORIIUM_ADMIN_PASSWORD
      ? '  Password    from MORIIUM_ADMIN_PASSWORD'
      : `  Password    ${PROTOTYPE_PASSWORD} (documented, not a secret)`,
  );
  console.log('');

  const shutdown = (): void => {
    void vite.close();
    api.close();
    store.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

await main();
