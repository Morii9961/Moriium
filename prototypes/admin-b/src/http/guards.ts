// Request guards.
//
// ADR 0001 section 5: "binding to 127.0.0.1 is not a security model". A local
// server is still reachable from any page the author has open — a browser will
// happily send a form post to http://127.0.0.1:4321 from anywhere, and DNS
// rebinding can make a hostile site's script look same-origin to the browser
// while the Host header still points here. So every state-changing request has
// to prove it came from this application:
//
//   * Host must be one this server answers to. This is what blocks DNS
//     rebinding, because the rebound name will not be in the allowlist.
//   * Origin must match one of those, for anything that changes state. A
//     cross-site form post carries an Origin the browser sets and a page cannot
//     forge.
//   * A CSRF token must accompany the request. SameSite=Strict already blocks
//     most of this, but it is one cookie attribute; the token means a single
//     browser quirk is not the only thing standing in the way.
//
// Guards return a reason rather than a boolean so a refusal can be logged
// precisely without the caller inventing its own wording.

import { SessionStore } from '../auth/sessions.ts';

export type GuardResult = { ok: true } | { ok: false; status: number; reason: string };

const OK: GuardResult = { ok: true };

/** Requests that do not change state. Everything else needs the full check. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type GuardOptions = {
  /** Hostnames with port that this server answers to, e.g. '127.0.0.1:4321'. */
  allowedHosts: readonly string[];
};

function allowedOrigins(hosts: readonly string[]): Set<string> {
  const origins = new Set<string>();
  for (const host of hosts) origins.add(`http://${host}`);
  return origins;
}

export function checkHost(host: string | undefined, options: GuardOptions): GuardResult {
  if (!host) return { ok: false, status: 400, reason: 'Missing Host header.' };
  if (!options.allowedHosts.includes(host)) {
    // Deliberately does not echo the host back into the response.
    return { ok: false, status: 403, reason: 'Host is not one this server answers to.' };
  }
  return OK;
}

export function checkOrigin(
  method: string,
  origin: string | undefined,
  options: GuardOptions,
): GuardResult {
  if (SAFE_METHODS.has(method.toUpperCase())) return OK;
  if (!origin) {
    // A browser always sets Origin on a cross-origin state-changing request.
    // Treating "absent" as acceptable would hand back everything the header is
    // there to prevent.
    return { ok: false, status: 403, reason: 'Missing Origin on a state-changing request.' };
  }
  if (!allowedOrigins(options.allowedHosts).has(origin)) {
    return { ok: false, status: 403, reason: 'Origin is not allowed.' };
  }
  return OK;
}

export function checkCsrf(
  method: string,
  sessions: SessionStore,
  sessionId: string | undefined,
  submittedToken: string | undefined,
): GuardResult {
  if (SAFE_METHODS.has(method.toUpperCase())) return OK;
  if (!sessions.verifyCsrf(sessionId, submittedToken)) {
    return { ok: false, status: 403, reason: 'Missing or invalid CSRF token.' };
  }
  return OK;
}

export type RequestFacts = {
  method: string;
  host: string | undefined;
  origin: string | undefined;
  sessionId: string | undefined;
  csrfToken: string | undefined;
};

/**
 * All guards, in order. Host first so a rebinding attempt is refused before
 * anything else is considered.
 */
export function guardRequest(
  request: RequestFacts,
  sessions: SessionStore,
  options: GuardOptions,
): GuardResult {
  const host = checkHost(request.host, options);
  if (!host.ok) return host;

  const origin = checkOrigin(request.method, request.origin, options);
  if (!origin.ok) return origin;

  return checkCsrf(request.method, sessions, request.sessionId, request.csrfToken);
}

/** Reads one cookie value. Returns undefined rather than guessing. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return undefined;
}
