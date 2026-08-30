// Shared error model.
//
// Two reasons this is shared rather than per-prototype. ADR 0001 section 4
// scores "error recovery success rate" across both prototypes, which only
// compares if both classify failures the same way. And ADR section 5 forbids
// passwords, plaintext and .private/ paths from reaching logs — a rule that
// holds only if there is one place where messages are prepared.
//
// Dependency direction is fixed: this module imports nothing from studio-a or
// admin-b.

/** Failure modes task B10 exercises, plus the security refusals from section 5. */
export const ERROR_CODES = [
  // Studio A: the filesystem path.
  'file-write-failed',
  'file-locked',
  'file-vanished',
  // Admin B: the database path.
  'db-locked',
  'db-write-failed',
  'transaction-failed',
  // Both: transport.
  'request-failed',
  'request-timeout',
  // Both: refusals, not accidents. These mean a guard worked.
  'path-outside-root',
  'media-gate-refused',
  'unauthorized',
  'forbidden',
  'validation-failed',
  'conflict',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Whether the operation can be retried as-is. A refusal is not recoverable by
 * retrying: repeating a rejected path traversal is not recovery.
 */
const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'file-locked',
  'db-locked',
  'request-failed',
  'request-timeout',
]);

export class PrototypeError extends Error {
  readonly code: ErrorCode;
  /** Safe to show a reader or writer. Never contains a path or a secret. */
  readonly userMessage: string;
  readonly retryable: boolean;

  constructor(code: ErrorCode, userMessage: string, options?: { cause?: unknown }) {
    super(`${code}: ${userMessage}`, options);
    this.name = 'PrototypeError';
    this.code = code;
    this.userMessage = userMessage;
    this.retryable = RETRYABLE.has(code);
  }
}

export function isPrototypeError(value: unknown): value is PrototypeError {
  return value instanceof PrototypeError;
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
 * Prepares a message for a log. Applied at the logging boundary, not at the
 * throw site, so a message cannot skip it by being constructed elsewhere.
 */
export function redactForLog(message: string): string {
  let safe = message;
  for (const [pattern, replacement] of REDACTIONS) safe = safe.replace(pattern, replacement);
  return safe;
}

export function describeForLog(error: unknown): string {
  if (isPrototypeError(error)) return redactForLog(`${error.code}: ${error.userMessage}`);
  if (error instanceof Error) return redactForLog(`${error.name}: ${error.message}`);
  return redactForLog(String(error));
}
