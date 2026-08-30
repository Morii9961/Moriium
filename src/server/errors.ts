// The admin's error model.
//
// Ported from the Phase 1 spike's shared/errors.ts, which ADR 0001 section 5
// required and which the 13.20 drill exercised for real. Two changes from that
// version, both from things the drill found:
//
//   * `db-locked` is raised, not merely declared. The spike modelled it and
//     mapped it to 503, but nothing ever threw it, so a locked database reached
//     the author as an unknown server error. A failure mode that is declared
//     and never triggered reads as handled.
//   * The name says admin rather than prototype, because this code outlives the
//     spike. ADR 0002 section 14 L1 deletes prototypes/ without touching this.
//
// This module must never be imported by a public route.

export const ERROR_CODES = [
  // Storage.
  'db-locked',
  'db-write-failed',
  'transaction-failed',
  // Transport.
  'request-failed',
  'request-timeout',
  // Refusals, not accidents. These mean a guard worked.
  'path-outside-root',
  'media-gate-refused',
  // The export refused to project the database onto disk. Not retryable in the
  // AdminError sense -- repeating it immediately hits the same missing file or
  // the same unsanitized row. The release sequence retries at its own level,
  // after whatever the message names has been dealt with.
  'export-failed',
  'unauthorized',
  'forbidden',
  'validation-failed',
  'conflict',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Whether retrying the same operation could succeed.
 *
 * A refusal is not recoverable by retrying: repeating a rejected path traversal
 * is not recovery, and presenting it as retryable invites a loop.
 */
const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'db-locked',
  'request-failed',
  'request-timeout',
]);

export class AdminError extends Error {
  readonly code: ErrorCode;
  /** Safe to show an author. Never contains a path, a password or a token. */
  readonly userMessage: string;
  readonly retryable: boolean;

  constructor(code: ErrorCode, userMessage: string, options?: { cause?: unknown }) {
    super(`${code}: ${userMessage}`, options);
    this.name = 'AdminError';
    this.code = code;
    this.userMessage = userMessage;
    this.retryable = RETRYABLE.has(code);
  }
}

export function isAdminError(value: unknown): value is AdminError {
  return value instanceof AdminError;
}

const REDACTIONS: readonly (readonly [RegExp, string])[] = [
  // Anything under the ignored private tree, on either path separator.
  [/[^\s"']*[\\/]?\.private[\\/][^\s"')]*/gi, '<private-path>'],
  // password=…, "password": "…", passphrase: …
  [/\b(pass(?:word|phrase))\s*[:=]\s*["']?[^\s"',;)]+/gi, '$1=<redacted>'],
  // Long base64-ish runs: ciphertext, keys, tokens.
  [/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, '<redacted-blob>'],
];

/**
 * Prepares a message for a log.
 *
 * Applied at the logging boundary rather than at the throw site, so a message
 * cannot skip it by being constructed somewhere else.
 */
export function redactForLog(message: string): string {
  let safe = message;
  for (const [pattern, replacement] of REDACTIONS) safe = safe.replace(pattern, replacement);
  return safe;
}

export function describeForLog(error: unknown): string {
  if (isAdminError(error)) return redactForLog(`${error.code}: ${error.userMessage}`);
  if (error instanceof Error) return redactForLog(`${error.name}: ${error.message}`);
  return redactForLog(String(error));
}
