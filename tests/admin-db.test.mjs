import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { authenticate, createAccount, hashPassword, listAccounts, verifyPassword } from '../src/server/accounts.ts';
import { BUSY_TIMEOUT_MS, MIGRATIONS, migrate, openDatabase } from '../src/server/db/open.ts';
import { AdminError } from '../src/server/errors.ts';

// ADR 0002 sections 6.3, 6.4 and 9. These run against a real file-backed
// database rather than ':memory:', because two of the things worth proving --
// that WAL is actually on, and that a migration rolls back rather than half
// applying -- are not observable in memory.

let directory;
const opened = [];

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'moriium-admin-db-'));
});

after(() => {
  while (opened.length > 0) opened.pop().close();
  rmSync(directory, { recursive: true, force: true });
});

let counter = 0;
function freshDatabase() {
  counter += 1;
  let tick = 0;
  const db = openDatabase(join(directory, `admin-${counter}.db`), {
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString(),
  });
  opened.push(db);
  return db;
}

describe('the admin database', () => {
  it('applies the pragmas the ADR names, and really applies them', () => {
    const db = freshDatabase();

    // Reading them back matters: a pragma that silently failed to take looks
    // exactly like one that took.
    assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    assert.equal(db.prepare('PRAGMA busy_timeout').get().timeout, BUSY_TIMEOUT_MS);
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  });

  it('enforces foreign keys instead of decorating the schema with them', () => {
    const db = freshDatabase();

    // node:sqlite defaults foreign keys on, so this does not catch a missing
    // pragma in our own code. What it does catch is the driver changing that
    // default, or someone passing enableForeignKeyConstraints: false -- either
    // of which would turn every REFERENCES clause in schema.sql into a comment
    // without any other visible symptom.
    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO versions (article_id, author_id, kind, created_at, title, summary,
                                   published_at, category, markdown)
             VALUES (9999, 9999, 'manual', '2026-01-01', 't', 's', '2026-01-01', 'c', 'body')`,
          )
          .run(),
      /FOREIGN KEY/i,
    );
  });

  it('is idempotent: migrating an up-to-date database applies nothing', () => {
    const db = freshDatabase();

    assert.deepEqual(migrate(db, () => '2026-01-01T00:00:00.000Z'), []);
    assert.equal(
      db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n,
      MIGRATIONS.length,
    );
  });

  it('leaves the version unchanged when a migration throws', () => {
    const db = freshDatabase();
    const before = db.prepare('SELECT MAX(id) AS v FROM schema_migrations').get().v;

    const broken = { id: 999, name: 'deliberately-broken', sql: () => 'CREATE TABLE ;' };
    MIGRATIONS.push(broken);
    try {
      assert.throws(
        () => migrate(db, () => '2026-01-01T00:00:00.000Z'),
        (error) => error instanceof AdminError && error.code === 'transaction-failed',
      );
      assert.equal(db.prepare('SELECT MAX(id) AS v FROM schema_migrations').get().v, before);
    } finally {
      MIGRATIONS.pop();
    }
  });

  // This is the B2 fix made checkable. ADR 0001 section 4 recorded that the
  // spike stored 5 of the 14 production frontmatter fields; adding a field to
  // src/content.config.ts without a migration must now fail here rather than
  // surface as a silently dropped value at publish time.
  it('stores every frontmatter field src/content.config.ts declares', () => {
    const config = readFileSync(new URL('../src/content.config.ts', import.meta.url), 'utf8');
    const shared = config.slice(config.indexOf('const sharedMetadata'), config.indexOf('const posts'));
    const declared = [...shared.matchAll(/^\s{2}([a-zA-Z]+):/gm)].map((match) => match[1]);

    assert.equal(declared.length, 14, `expected 14 frontmatter fields, parsed ${declared.join(', ')}`);

    const db = freshDatabase();
    const columns = new Set(
      db.prepare('PRAGMA table_info(versions)').all().map((column) => column.name),
    );
    const snake = (name) => name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

    for (const field of declared) {
      if (field === 'tags') {
        // Its own table, so tag pages can group by tag instead of matching
        // strings inside a JSON column.
        const tagColumns = db.prepare('PRAGMA table_info(version_tags)').all().map((c) => c.name);
        assert.ok(tagColumns.includes('tag'), 'version_tags must carry a tag column');
        continue;
      }
      if (field === 'slug' || field === 'lang' || field === 'translationKey') {
        // Identity, not content: these live on articles and must not change
        // per version.
        const articleColumns = db.prepare('PRAGMA table_info(articles)').all().map((c) => c.name);
        assert.ok(articleColumns.includes(snake(field)), `articles must carry ${snake(field)}`);
        continue;
      }
      assert.ok(columns.has(snake(field)), `versions must carry ${snake(field)} for frontmatter ${field}`);
    }
  });

  it('refuses a cover without alt text, the way the content schema does', () => {
    const db = freshDatabase();
    db.prepare("INSERT INTO accounts (name, password_hash, created_at) VALUES ('t', 'x', '2026-01-01')").run();
    db.prepare(
      "INSERT INTO articles (translation_key, lang, slug, created_at) VALUES ('k', 'zh', 'zh/a', '2026-01-01')",
    ).run();

    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO versions (article_id, author_id, kind, created_at, title, summary,
                                   published_at, category, cover, markdown)
             VALUES (1, 1, 'manual', '2026-01-01', 't', 's', '2026-01-01', 'c', '/media/x.webp', 'body')`,
          )
          .run(),
      /CHECK/i,
    );
  });
});

describe('author accounts', () => {
  it('creates both authors and keeps their passwords apart', async () => {
    const db = freshDatabase();
    const now = () => '2026-08-30T00:00:00.000Z';

    await createAccount(db, { name: 'Morii', password: 'a'.repeat(30) }, now);
    await createAccount(db, { name: 'Enouia', password: 'b'.repeat(30) }, now);

    assert.deepEqual(listAccounts(db).map((account) => account.name), ['Morii', 'Enouia']);
    assert.ok(await authenticate(db, 'Morii', 'a'.repeat(30)));
    // Enouia's password must not open Morii's account.
    assert.equal(await authenticate(db, 'Morii', 'b'.repeat(30)), null);
  });

  it('refuses a short password, because length is the defence being relied on', async () => {
    const db = freshDatabase();

    await assert.rejects(
      createAccount(db, { name: 'Morii', password: 'short-but-memorable' }, () => '2026-08-30'),
      (error) => error instanceof AdminError && error.code === 'validation-failed',
    );
  });

  it('never stores the password itself', async () => {
    const db = freshDatabase();
    const password = 'c'.repeat(30);
    await createAccount(db, { name: 'Morii', password }, () => '2026-08-30');

    const stored = db.prepare('SELECT password_hash FROM accounts WHERE name = ?').get('Morii').password_hash;
    assert.doesNotMatch(stored, new RegExp(password));
    // The parameters travel with the hash so raising them later cannot
    // invalidate hashes written today.
    assert.match(stored, /^scrypt\$\d+\$\d+\$\d+\$/);
  });

  it('gives the same answer for an unknown name and a wrong password', async () => {
    const db = freshDatabase();
    await createAccount(db, { name: 'Morii', password: 'd'.repeat(30) }, () => '2026-08-30');

    assert.equal(await authenticate(db, 'Morii', 'wrong'.repeat(6)), null);
    assert.equal(await authenticate(db, 'NoSuchAuthor', 'd'.repeat(30)), null);
  });

  it('refuses a disabled account even with the right password', async () => {
    const db = freshDatabase();
    const password = 'e'.repeat(30);
    await createAccount(db, { name: 'Enouia', password }, () => '2026-08-30');

    db.prepare("UPDATE accounts SET disabled_at = '2026-08-31' WHERE name = 'Enouia'").run();

    assert.equal(await authenticate(db, 'Enouia', password), null);
  });

  it('rejects a stored hash it cannot parse rather than treating it as a match', async () => {
    assert.equal(await verifyPassword('anything', 'not-a-hash'), false);
    assert.equal(await verifyPassword('anything', ''), false);
    // A real hash still verifies, so the guard above is not passing by refusing
    // everything.
    const real = await hashPassword('f'.repeat(30));
    assert.equal(await verifyPassword('f'.repeat(30), real), true);
  });
});
