// Login throttling for the two production author accounts.
//
// ADR 0002 section 9.2 requires two independent controls: a per-account
// window so one author cannot lock out the other, and a global valve so an
// attacker cannot evade that window by rotating through invented names.

export const LOGIN_WINDOW_MS = 15 * 60 * 1_000;
export const ACCOUNT_FAILURE_LIMIT = 5;
export const GLOBAL_FAILURE_LIMIT = 20;

export type LoginDecision =
  | { readonly allowed: true; readonly retryAfterMs: 0 }
  | { readonly allowed: false; readonly retryAfterMs: number };

type ThrottleOptions = {
  now?: () => number;
};

function accountKey(name: string): string {
  // The counter is deliberately a little more forgiving than SQLite's exact
  // account lookup. Case and surrounding whitespace must not create free
  // guesses against the same visible account name.
  return name.trim().normalize('NFKC').toLowerCase() || '<empty-account>';
}

export class LoginThrottle {
  readonly #accountFailures = new Map<string, number[]>();
  readonly #globalFailures: number[] = [];
  readonly #now: () => number;

  constructor(options: ThrottleOptions = {}) {
    this.#now = options.now ?? Date.now;
  }

  check(name: string): LoginDecision {
    const now = this.#now();
    this.#prune(now);
    const account = this.#accountFailures.get(accountKey(name)) ?? [];
    const accountRetry = retryAfter(account, ACCOUNT_FAILURE_LIMIT, now);
    const globalRetry = retryAfter(this.#globalFailures, GLOBAL_FAILURE_LIMIT, now);
    const retryAfterMs = Math.max(accountRetry, globalRetry);
    return retryAfterMs > 0
      ? { allowed: false, retryAfterMs }
      : { allowed: true, retryAfterMs: 0 };
  }

  recordFailure(name: string): void {
    const now = this.#now();
    this.#prune(now);
    const key = accountKey(name);
    const account = this.#accountFailures.get(key) ?? [];
    account.push(now);
    this.#accountFailures.set(key, account);
    this.#globalFailures.push(now);
  }

  /** A successful author stops paying for their own typos, not global attack traffic. */
  recordSuccess(name: string): void {
    this.#accountFailures.delete(accountKey(name));
  }

  #prune(now: number): void {
    prune(this.#globalFailures, now);
    for (const [key, failures] of this.#accountFailures) {
      prune(failures, now);
      if (failures.length === 0) this.#accountFailures.delete(key);
    }
  }
}

function prune(failures: number[], now: number): void {
  const cutoff = now - LOGIN_WINDOW_MS;
  while (failures.length > 0 && failures[0]! <= cutoff) failures.shift();
}

function retryAfter(failures: readonly number[], limit: number, now: number): number {
  if (failures.length < limit) return 0;
  const oldestRelevant = failures[failures.length - limit];
  return oldestRelevant === undefined ? 0 : Math.max(0, oldestRelevant + LOGIN_WINDOW_MS - now);
}
