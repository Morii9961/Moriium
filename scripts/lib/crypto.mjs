import { webcrypto } from 'node:crypto';

export const ENCRYPTION = Object.freeze({
  version: 1,
  algorithm: 'AES-256-GCM',
  kdf: 'PBKDF2-HMAC-SHA-256',
  iterations: 600_000,
  saltBytes: 16,
  ivBytes: 12,
});

const subtle = webcrypto.subtle;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

export function fromBase64(value) {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

async function deriveKey(password, salt, usage) {
  const material = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ENCRYPTION.iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

export async function encryptHtml(html, password, random = webcrypto.getRandomValues.bind(webcrypto)) {
  if (!password || password.length < 16) throw new Error('Use an independent password of at least 16 characters.');
  const salt = random(new Uint8Array(ENCRYPTION.saltBytes));
  const iv = random(new Uint8Array(ENCRYPTION.ivBytes));
  const key = await deriveKey(password, salt, 'encrypt');
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(html));
  return {
    version: ENCRYPTION.version,
    algorithm: ENCRYPTION.algorithm,
    kdf: ENCRYPTION.kdf,
    iterations: ENCRYPTION.iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptHtml(envelope, password) {
  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const ciphertext = fromBase64(envelope.ciphertext);
  const key = await deriveKey(password, salt, 'decrypt');
  const plaintext = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return decoder.decode(plaintext);
}
