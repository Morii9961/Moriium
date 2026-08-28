# Publish a protected article

Protected posts use a local-only workflow. Do not place plaintext in `src/`, Pages CMS, an issue, an Actions secret, a shell argument, or a Git commit.

## Prepare plaintext

Create `.private/posts/article.md`. The directory is ignored. Use the same public metadata as a normal article, plus `listed` when the protected article should appear in indexes:

```yaml
---
title: Example
slug: zh/example
summary: A public summary that may appear in RSS.
publishedAt: 2026-08-23T10:00:00+08:00
lang: zh
translationKey: example
category: Notes
tags: []
draft: false
unlisted: false
listed: true
---
```

## Encrypt

Run this from an interactive terminal:

```sh
pnpm encrypt -- .private/posts/article.md src/content/protected/article.json
```

The command reads and confirms the password without echoing it, compiles Markdown, and writes an atomic ciphertext envelope. Passwords shorter than 16 characters are rejected; use a long, independent passphrase.

The format is versioned and uses PBKDF2-HMAC-SHA-256 with a fresh 16-byte salt, 600,000 iterations, and AES-256-GCM with a fresh 12-byte IV. GCM authenticates the ciphertext. Re-encrypting the same content produces different output.

## Verify

```sh
pnpm test
pnpm content:validate
pnpm build
```

The browser derives the key and inserts decrypted HTML into the current page DOM. It never stores the password or plaintext in cookies, Local Storage, or Session Storage. Static ciphertext can be copied and attacked offline, so encryption cannot compensate for a weak or reused password.

The `_collection-fixture.json` file is non-editorial, draft ciphertext that keeps the protected collection schema exercised before a real protected post exists.
