import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { createAccount, disableAccount } from '../src/server/accounts.ts';
import { openDatabase } from '../src/server/db/open.ts';
import { DEFAULT_DATABASE_PATH } from '../src/server/db/runtime.ts';
import { describeForLog } from '../src/server/errors.ts';
import { hiddenPrompt } from './lib/hidden-prompt.mjs';

const ACTIONS = new Set(['create', 'disable']);
const AUTHOR_NAMES = new Set(['Morii', 'Enouia']);

function assertAuthorName(name) {
  if (!AUTHOR_NAMES.has(name)) {
    throw new Error('The author name must be Morii or Enouia.');
  }
  return name;
}

export function parseAccountCommand(args) {
  if (args.length !== 2 || !ACTIONS.has(args[0])) {
    throw new Error(
      'Usage: pnpm account:create <Morii|Enouia> or pnpm account:disable <Morii|Enouia>. The password must not be a command-line argument.',
    );
  }
  return { action: args[0], name: assertAuthorName(args[1]) };
}

export async function createAuthorAccount({ db, name, now, prompt, write }) {
  assertAuthorName(name);
  write('Use a password-manager-generated password of at least 24 characters. Never reuse it.\n');

  const password = await prompt('Password: ');
  const confirmation = await prompt('Confirm password: ');
  if (password !== confirmation) throw new Error('Passwords do not match.');

  const account = await createAccount(db, { name, password }, now);
  write(`Created author account ${account.name}.\n`);
  return account;
}

export function disableAuthorAccount({ db, name, now, write }) {
  assertAuthorName(name);
  const account = disableAccount(db, name, now);
  write(`Disabled author account ${account.name}.\n`);
  return account;
}

export async function main(args = process.argv.slice(2)) {
  const command = parseAccountCommand(args);
  const databasePath = process.env.MORIIUM_DATABASE_PATH?.trim() || DEFAULT_DATABASE_PATH;
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = openDatabase(databasePath);
  const now = () => new Date().toISOString();
  const write = (message) => process.stdout.write(message);

  try {
    if (command.action === 'create') {
      await createAuthorAccount({ db, name: command.name, now, prompt: hiddenPrompt, write });
    } else {
      disableAuthorAccount({ db, name: command.name, now, write });
    }
  } finally {
    db.close();
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (entryUrl === import.meta.url) {
  try {
    await main();
  } catch (error) {
    console.error(describeForLog(error));
    process.exitCode = 1;
  }
}
