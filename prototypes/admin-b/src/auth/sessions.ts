// Sessions, CSRF tokens and login throttling.
//
// ADR 0001 section 5 for prototype B: HttpOnly and SameSite=Strict session
// cookies, a CSRF token on state-changing requests, and rate limiting on failed
// logins.
//
// A KNOWN DIFFERENCE FROM PRODUCTION, which the ADR says must be reported and
// not treated as solved: over plain http on localhost the cookie cannot carry
// `Secure`, and the `__Host-` prefix requires `Secure`, so neither is used
// here. Both are mandatory in any deployment reachable over the network. This
// is recorded in COOKIE_LIMITATIONS below so it travels with the code rather
// than living only in a document.
//
// Sessions are in memory: the spike restarts often and there is one author.
// Losing them on restart is a property of the spike, not a design position.

import { randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'moriium_admin_session';

/** Reasons this cookie is weaker here than it must be in production. */
export const COOKIE_LIMITATIONS = [
  'No Secure attribute: the prototype serves plain http on 127.0.0.1.',
  'No __Host- prefix: it requires Secure.',
] as const;

export const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

/** Failed logins allowed inside the window before the account is locked out. */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export type Session = {
  id: string;
  csrfToken: string;
  createdAt: number;
  expiresAt: number;
};

/** Compares two tokens without leaking their common prefix through timing. */
function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export class SessionStore {
  readonly #sessions = new Map<string, Session>();
  readonly #failures: number[] = [];
  readonly #ttlMs: number;
  readonly #now: () => number;

  constructor(options: { ttlMs?: number; now?: () => number } = {}) {
    this.#ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.#now = options.now ?? Date.now;
  }

  create(): Session {
    const now = this.#now();
    const session: Session = {
      // 256 bits from the CSPRNG. The CSRF token is separate from the session
      // id so that leaking one in a URL or a log does not hand over the other.
      id: randomBytes(32).toString('base64url'),
      csrfToken: randomBytes(32).toString('base64url'),
      createdAt: now,
      expiresAt: now + this.#ttlMs,
    };
    this.#sessions.set(session.id, session);
    return session;
  }

  /** Returns the session only while it is valid, and drops it once expired. */
  get(id: string | undefined): Session | null {
    if (!id) return null;
    const session = this.#sessions.get(id);
    if (!session) return null;
    if (session.expiresAt <= this.#now()) {
      this.#sessions.delete(id);
      return null;
    }
    return session;
  }

  destroy(id: string | undefined): void {
    if (id) this.#sessions.delete(id);
  }

  /** Checks a submitted CSRF token against the one issued to this session. */
  verifyCsrf(sessionId: string | undefined, submitted: string | undefined): boolean {
    const session = this.get(sessionId);
    if (!session || !submitted) return false;
    return tokensMatch(session.csrfToken, submitted);
  }

  /** Cookie attributes for this session. */
  cookieFor(session: Session): string {
    const maxAge = Math.max(0, Math.floor((session.expiresAt - this.#now()) / 1000));
    // Strict rather than Lax: nothing here should be reachable from another
    // site's navigation, and the admin has no cross-site entry point.
    return (
      `${SESSION_COOKIE}=${session.id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`
    );
  }

  clearedCookie(): string {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
  }

  // -- login throttling -----------------------------------------------------

  /**
   * Whether login attempts are currently refused. Checked before the password
   * is verified, so a locked-out attacker gets no scrypt work done for them.
   */
  isLockedOut(): boolean {
    return this.#recentFailures() >= MAX_FAILED_LOGINS;
  }

  recordFailedLogin(): void {
    this.#failures.push(this.#now());
  }

  /** Clears the counter, so a legitimate author is not punished for typos. */
  recordSuccessfulLogin(): void {
    this.#failures.length = 0;
  }

  retryAfterMs(): number {
    if (!this.isLockedOut()) return 0;
    const cutoff = this.#now() - LOCKOUT_WINDOW_MS;
    const inWindow = this.#failures.filter((at) => at > cutoff);
    const oldest = inWindow[0];
    return oldest === undefined ? 0 : oldest + LOCKOUT_WINDOW_MS - this.#now();
  }

  #recentFailures(): number {
    const cutoff = this.#now() - LOCKOUT_WINDOW_MS;
    // Drop anything that has aged out, so the window slides instead of
    // accumulating forever.
    while (this.#failures.length > 0 && this.#failures[0]! <= cutoff) this.#failures.shift();
    return this.#failures.length;
  }
}
