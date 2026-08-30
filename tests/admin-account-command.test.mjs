import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { authenticate, listAccounts } from '../src/server/accounts.ts';
import { AdminError } from '../src/server/errors.ts';
import { openDatabase } from '../src/server/db/open.ts';
import {
  createAuthorAccount,
  disableAuthorAccount,
  parseAccountCommand,
} from '../scripts/create-author-account.mjs';
import { hiddenPrompt } from '../scripts/lib/hidden-prompt.mjs';

let directory;
const opened = [];

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'moriium-account-command-'));
});

after(() => {
  while (opened.length > 0) opened.pop().close();
  rmSync(directory, { recursive: true, force: true });
});

let databaseCounter = 0;
function freshDatabase() {
  databaseCounter += 1;
  const db = openDatabase(join(directory, `account-${databaseCounter}.db`));
  opened.push(db);
  return db;
}

function passwordReader(values, prompts) {
  return async (label) => {
    prompts.push(label);
    return values.shift();
  };
}

describe('server-side author account command', () => {
  it('accepts a password-manager paste delivered as one terminal chunk', async () => {
    class FakeInput extends EventEmitter {
      isTTY = true;
      setRawMode() {}
      resume() {}
      pause() {}
      setEncoding() {}
    }
    const input = new FakeInput();
    const output = { isTTY: true, write: () => {} };
    const reading = hiddenPrompt('Password: ', { input, output });

    input.emit('data', 'password-manager-paste\r');

    assert.equal(await reading, 'password-manager-paste');
  });

  it('creates a named author after reading and confirming a hidden password', async () => {
    const db = freshDatabase();
    const password = 'generated-password-is-30-chars';
    const prompts = [];
    const output = [];

    const account = await createAuthorAccount({
      db,
      name: 'Morii',
      now: () => '2026-08-30T00:00:00.000Z',
      prompt: passwordReader([password, password], prompts),
      write: (message) => output.push(message),
    });

    assert.equal(account.name, 'Morii');
    assert.deepEqual(prompts, ['Password: ', 'Confirm password: ']);
    assert.deepEqual(listAccounts(db).map(({ name }) => name), ['Morii']);
    assert.ok(await authenticate(db, 'Morii', password));
    assert.doesNotMatch(output.join(''), new RegExp(password));
  });

  it('refuses a repeated activation instead of changing the existing account', async () => {
    const db = freshDatabase();
    const original = 'original-generated-password';
    const replacement = 'replacement-generated-password';
    const activate = (password) =>
      createAuthorAccount({
        db,
        name: 'Enouia',
        now: () => '2026-08-30T00:00:00.000Z',
        prompt: passwordReader([password, password], []),
        write: () => {},
      });

    await activate(original);
    await assert.rejects(
      activate(replacement),
      (error) => error instanceof AdminError && error.code === 'conflict',
    );

    assert.equal(listAccounts(db).length, 1);
    assert.ok(await authenticate(db, 'Enouia', original));
    assert.equal(await authenticate(db, 'Enouia', replacement), null);
  });

  it('disables an author without deleting the referenced account row', async () => {
    const db = freshDatabase();
    const password = 'generated-password-for-disable';
    await createAuthorAccount({
      db,
      name: 'Enouia',
      now: () => '2026-08-30T00:00:00.000Z',
      prompt: passwordReader([password, password], []),
      write: () => {},
    });

    const disabled = disableAuthorAccount({
      db,
      name: 'Enouia',
      now: () => '2026-08-31T00:00:00.000Z',
      write: () => {},
    });

    assert.equal(disabled.disabledAt, '2026-08-31T00:00:00.000Z');
    assert.equal(listAccounts(db).length, 1);
    assert.equal(await authenticate(db, 'Enouia', password), null);
  });

  it('leaves no account after a short or mismatched password', async () => {
    const shortDb = freshDatabase();
    await assert.rejects(
      createAuthorAccount({
        db: shortDb,
        name: 'Morii',
        now: () => '2026-08-30T00:00:00.000Z',
        prompt: passwordReader(['too-short', 'too-short'], []),
        write: () => {},
      }),
      (error) => error instanceof AdminError && error.code === 'validation-failed',
    );
    assert.deepEqual(listAccounts(shortDb), []);

    const mismatchDb = freshDatabase();
    await assert.rejects(
      createAuthorAccount({
        db: mismatchDb,
        name: 'Morii',
        now: () => '2026-08-30T00:00:00.000Z',
        prompt: passwordReader(['a'.repeat(30), 'b'.repeat(30)], []),
        write: () => {},
      }),
      /Passwords do not match/,
    );
    assert.deepEqual(listAccounts(mismatchDb), []);
  });

  it('accepts only one approved author name and no password argument', () => {
    assert.deepEqual(parseAccountCommand(['create', 'Morii']), { action: 'create', name: 'Morii' });
    assert.deepEqual(parseAccountCommand(['disable', 'Enouia']), { action: 'disable', name: 'Enouia' });
    assert.throws(() => parseAccountCommand([]), /Usage/);
    assert.throws(() => parseAccountCommand(['create', 'Reader']), /Morii or Enouia/);
    assert.throws(
      () => parseAccountCommand(['create', 'Morii', 'password-must-not-be-an-argument']),
      /Usage/,
    );
  });
});
