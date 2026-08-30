// The two author accounts.
//
// ADR 0002 section 9: Morii and Enouia have identical permissions. There are no
// roles and no per-article authorization, because on a site with two trusted
// authors an access-control matrix adds ways to misconfigure rather than
// security. What tells them apart is the audit trail, not a permission check.
//
// This module must never be imported by a public route.

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { AdminError } from './errors.ts';

type ScryptCost = { N: number; r: number; p: number };

/**
 * scrypt parameters for new hashes.
 *
 * They are written into every hash rather than assumed at verification time, so
 * raising them later does not invalidate existing hashes: an old hash verifies
 * with the cost it was created at.
 */
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keyLength: 64, saltBytes: 16 };

export type Account = {
  id: number;
  name: string;
  createdAt: string;
  disabledAt: string | null;
};

type AccountRow = {
  id: number;
  name: string;
  password_hash: string;
  created_at: string;
  disabled_at: string | null;
};

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    disabledAt: row.disabled_at,
  };
}

function derive(password: string, salt: Buffer, keyLength: number, cost: ScryptCost): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem has to be raised alongside N, or scrypt refuses its own parameters.
    const options = { N: cost.N, r: cost.r, p: cost.p, maxmem: 256 * cost.N * cost.r };
    scrypt(password, salt, keyLength, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** `scrypt$N$r$p$salt$hash`, so the parameters travel with the hash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT.saltBytes);
  const key = await derive(password, salt, SCRYPT.keyLength, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  // The parameters come from the stored hash, not from SCRYPT: an old hash has
  // to verify with the cost it was written at, or raising SCRYPT would lock
  // every existing account out.
  const cost: ScryptCost = { N: Number(rawN), r: Number(rawR), p: Number(rawP) };
  if (!Number.isInteger(cost.N) || !Number.isInteger(cost.r) || !Number.isInteger(cost.p)) return false;

  const expected = Buffer.from(rawHash ?? '', 'base64');
  const salt = Buffer.from(rawSalt ?? '', 'base64');
  if (expected.length === 0 || salt.length === 0) return false;

  const actual = await derive(password, salt, expected.length, cost);
  // Lengths are equal by construction, but timingSafeEqual throws rather than
  // returning false when they are not, so guard instead of trusting that.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createAccount(
  db: DatabaseSync,
  input: { name: string; password: string },
  now: () => string,
): Promise<Account> {
  const name = input.name.trim();
  if (name.length === 0) throw new AdminError('validation-failed', 'An account needs a name.');

  // Not a style preference. This admin is reachable from the public internet
  // (ADR 0002 section 10.4), so password length is the defence that the rate
  // limiter and fail2ban are buying time for.
  if (input.password.length < 24) {
    throw new AdminError(
      'validation-failed',
      'An author password must be at least 24 characters. Generate it; do not compose it.',
    );
  }

  const hash = await hashPassword(input.password);
  try {
    db.prepare('INSERT INTO accounts (name, password_hash, created_at) VALUES (?, ?, ?)').run(
      name,
      hash,
      now(),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/UNIQUE/i.test(message)) {
      throw new AdminError('conflict', `An account named ${name} already exists.`, { cause: error });
    }
    throw error;
  }
  return findAccount(db, name)!;
}

export function findAccount(db: DatabaseSync, name: string): Account | null {
  const row = db.prepare('SELECT * FROM accounts WHERE name = ?').get(name) as AccountRow | undefined;
  return row ? toAccount(row) : null;
}

export function listAccounts(db: DatabaseSync): Account[] {
  const rows = db.prepare('SELECT * FROM accounts ORDER BY id').all() as AccountRow[];
  return rows.map(toAccount);
}

/** Disables an account without deleting the row referenced by versions and audit. */
export function disableAccount(db: DatabaseSync, name: string, now: () => string): Account {
  const normalized = name.trim();
  const result = db
    .prepare('UPDATE accounts SET disabled_at = ? WHERE name = ? AND disabled_at IS NULL')
    .run(now(), normalized);
  if (result.changes !== 1) {
    throw new AdminError('conflict', `No active account named ${normalized} exists.`);
  }
  const account = findAccount(db, normalized);
  if (!account) {
    throw new AdminError('db-write-failed', 'The disabled account could not be read back.');
  }
  return account;
}

/**
 * Resolves a sign-in attempt.
 *
 * Returns null for an unknown name, a disabled account and a wrong password
 * alike: telling them apart would let anyone enumerate which accounts exist.
 * The hash comparison still runs for an unknown name so that the response time
 * does not answer the question the message refuses to.
 */
export async function authenticate(
  db: DatabaseSync,
  name: string,
  password: string,
): Promise<Account | null> {
  const row = db.prepare('SELECT * FROM accounts WHERE name = ?').get(name) as AccountRow | undefined;
  const stored = row?.password_hash ?? (await hashPassword('absent-account-placeholder'));
  const matches = await verifyPassword(password, stored);
  if (!row || row.disabled_at !== null || !matches) return null;
  return toAccount(row);
}
