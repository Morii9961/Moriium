import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { decryptHtml, encryptHtml } from '../scripts/lib/crypto.mjs';

const password = 'test-only independent passphrase';
const html = '<h1>Private fixture</h1><p>Not a real post.</p>';

test('correct password decrypts the article', async () => {
  const envelope = await encryptHtml(html, password);
  assert.equal(await decryptHtml(envelope, password), html);
});

test('wrong password fails authentication', async () => {
  const envelope = await encryptHtml(html, password);
  await assert.rejects(() => decryptHtml(envelope, 'different test-only passphrase'));
});

test('tampered ciphertext fails authentication', async () => {
  const envelope = await encryptHtml(html, password);
  const bytes = Buffer.from(envelope.ciphertext, 'base64');
  bytes[0] ^= 1;
  await assert.rejects(() => decryptHtml({ ...envelope, ciphertext: bytes.toString('base64') }, password));
});

test('repeated encryption uses new salt and IV', async () => {
  const first = await encryptHtml(html, password);
  const second = await encryptHtml(html, password);
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
});

test('encryption rejects short passwords', async () => {
  await assert.rejects(() => encryptHtml(html, 'too short'), /at least 16 characters/);
});

test('draft collection fixture remains decryptable without exposing editorial content', async () => {
  const raw = await readFile(new URL('../src/content/protected/_collection-fixture.json', import.meta.url), 'utf8');
  const fixture = JSON.parse(raw);
  assert.equal(fixture.draft, true);
  assert.equal(
    await decryptHtml(fixture.encryption, password),
    '<h2>Browser decryption fixture</h2><p>Not a real article.</p>',
  );
});
