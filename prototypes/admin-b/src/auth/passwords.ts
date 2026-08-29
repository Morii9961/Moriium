// Author password hashing.
//
// ADR 0001 section 5: scrypt, with the salt and parameters recorded. Recording
// them is the part that is easy to skip and expensive to skip. Parameters get
// raised over the years, and a hash that does not say which cost it was made
// with can only be upgraded by asking everyone to reset. Storing them inline
// means an old hash still verifies and can be re-hashed at the next successful
// login, which needsRehash() exists for.
//
// node:crypto covers this, so ADR section 3.3 adds no argon2 or bcrypt
// dependency.

import { type ScryptOptions, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { PrototypeError } from '../../../shared/errors.ts';

// Hand-written rather than promisify(scrypt): promisify collapses to a single
// overload and loses the one taking options, which is the one needed to raise
// maxmem for the current cost parameters.
function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolveKey, reject) => {
    scrypt(password, salt, keyLength, options, (error, derived) => {
      if (error) reject(error);
      else resolveKey(derived);
    });
  });
}

/**
 * Current cost. N is the work factor; raising it invalidates nothing, because
 * every stored hash carries the parameters it was made with.
 */
export const CURRENT_PARAMS = { N: 16384, r: 8, p: 1, keyLength: 64 } as const;

const SALT_BYTES = 16;

/**
 * scrypt needs memory proportional to 128 * N * r, and Node's default limit is
 * below what N=16384, r=8 wants. Set it explicitly rather than lowering the
 * cost to fit a default.
 */
const maxmem = (N: number, r: number) => 256 * N * r;

export const MINIMUM_LENGTH = 12;

export type PasswordParams = { N: number; r: number; p: number; keyLength: number };

export type ParsedHash = {
  algorithm: 'scrypt';
  params: PasswordParams;
  salt: Buffer;
  hash: Buffer;
};

/** `scrypt$N=16384,r=8,p=1,len=64$<salt base64>$<hash base64>` */
function encode(params: PasswordParams, salt: Buffer, hash: Buffer): string {
  const spec = `N=${params.N},r=${params.r},p=${params.p},len=${params.keyLength}`;
  return `scrypt$${spec}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function parseHash(encoded: string): ParsedHash {
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') {
    throw new PrototypeError('validation-failed', 'Unrecognised password hash format.');
  }
  const [, spec, saltB64, hashB64] = parts as [string, string, string, string];
  const values = new Map(
    spec.split(',').map((pair) => {
      const [key, value] = pair.split('=');
      return [key ?? '', Number(value)] as const;
    }),
  );
  const params = {
    N: values.get('N') ?? 0,
    r: values.get('r') ?? 0,
    p: values.get('p') ?? 0,
    keyLength: values.get('len') ?? 0,
  };
  if (!params.N || !params.r || !params.p || !params.keyLength) {
    throw new PrototypeError('validation-failed', 'Password hash is missing its parameters.');
  }
  return {
    algorithm: 'scrypt',
    params,
    salt: Buffer.from(saltB64, 'base64'),
    hash: Buffer.from(hashB64, 'base64'),
  };
}

export async function hashPassword(
  password: string,
  params: PasswordParams = CURRENT_PARAMS,
): Promise<string> {
  if (password.length < MINIMUM_LENGTH) {
    throw new PrototypeError(
      'validation-failed',
      `Use a password of at least ${MINIMUM_LENGTH} characters.`,
    );
  }
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(password, salt, params.keyLength, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: maxmem(params.N, params.r),
  });
  return encode(params, salt, derived);
}

/**
 * Constant-time comparison. A plain === leaks how much of the hash matched
 * through timing, which is exactly the signal an attacker wants.
 *
 * Returns false for a malformed record rather than throwing, so a corrupted row
 * fails the login instead of producing a different, distinguishable error.
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  let parsed: ParsedHash;
  try {
    parsed = parseHash(encoded);
  } catch {
    return false;
  }
  const derived = await scryptAsync(password, parsed.salt, parsed.params.keyLength, {
    N: parsed.params.N,
    r: parsed.params.r,
    p: parsed.params.p,
    maxmem: maxmem(parsed.params.N, parsed.params.r),
  });
  if (derived.length !== parsed.hash.length) return false;
  return timingSafeEqual(derived, parsed.hash);
}

/** True when a stored hash was made with weaker parameters than the current ones. */
export function needsRehash(encoded: string): boolean {
  let parsed: ParsedHash;
  try {
    parsed = parseHash(encoded);
  } catch {
    return true;
  }
  return (
    parsed.params.N < CURRENT_PARAMS.N ||
    parsed.params.r < CURRENT_PARAMS.r ||
    parsed.params.p < CURRENT_PARAMS.p ||
    parsed.params.keyLength < CURRENT_PARAMS.keyLength
  );
}
