// Frontmatter contract shared by prototype A and prototype B.
//
// This mirrors src/content-schema.ts. Prototype-specific publish schemas still
// live here, while validate-fixtures.ts compares the shared field names so a
// field added on either side fails loudly instead of drifting quietly.
//
// Dependency direction is fixed: this module imports nothing from studio-a or
// admin-b.

import { z } from 'astro/zod';

export const LANGUAGES = ['zh', 'ja', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const language = z.enum(LANGUAGES);

export const SLUG_PATTERN = /^(zh|ja|en)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const sharedMetadata = z.object({
  title: z.string().min(1),
  slug: z.string().regex(SLUG_PATTERN),
  summary: z.string().min(1).max(280),
  publishedAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
  lang: language,
  translationKey: z.string().min(1),
  category: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  cover: z.string().optional(),
  coverAlt: z.string().optional(),
  draft: z.boolean().default(false),
  unlisted: z.boolean().default(false),
  copyProtection: z.boolean().default(false),
});

export const postMetadata = sharedMetadata.superRefine((value, context) => {
  if (value.cover && !value.coverAlt) {
    context.addIssue({
      code: 'custom',
      path: ['coverAlt'],
      message: 'coverAlt is required when cover is present',
    });
  }
});

/**
 * The metadata prototype B can currently persist beside a Markdown version.
 *
 * This is derived from the production-shaped shared contract rather than
 * restating title, summary, slug and language rules in the HTTP layer. The
 * remaining production fields stay an explicit Phase 2 gap until the database
 * model can store them without inventing defaults at publish time.
 */
export const publishCandidate = sharedMetadata
  .pick({
    title: true,
    slug: true,
    summary: true,
    lang: true,
    translationKey: true,
  })
  .extend({ markdown: z.string().trim().min(1) })
  .superRefine((value, context) => {
    if (!value.slug.startsWith(`${value.lang}/`)) {
      context.addIssue({
        code: 'custom',
        path: ['slug'],
        message: 'slug must start with the selected language',
      });
    }
  });

export const encryptionEnvelope = z.object({
  version: z.literal(1),
  algorithm: z.literal('AES-256-GCM'),
  kdf: z.literal('PBKDF2-HMAC-SHA-256'),
  iterations: z.literal(600000),
  salt: z.string().min(20),
  iv: z.string().min(16),
  ciphertext: z.string().min(1),
});

// The five markers decide which browser modules an article is allowed to load.
// AGENTS.md forbids shipping them to articles that do not use the feature, so
// these are a privacy and payload contract, not a convenience.
export const featureMarkers = z.object({
  lightbox: z.boolean(),
  mermaid: z.boolean(),
  music: z.boolean(),
  video: z.boolean(),
  math: z.boolean(),
});

export const protectedMetadata = sharedMetadata
  .omit({ cover: true, coverAlt: true, copyProtection: true })
  .extend({
    listed: z.boolean().default(false),
    encryption: encryptionEnvelope,
    features: featureMarkers,
  });

export type PostMetadata = z.infer<typeof postMetadata>;
export type ProtectedMetadata = z.infer<typeof protectedMetadata>;

/** Field names this mirror declares, for the drift check against production. */
export const SHARED_METADATA_FIELDS = Object.keys(sharedMetadata.shape).sort();
export const PROTECTED_OMITTED_FIELDS = ['cover', 'coverAlt', 'copyProtection'].sort();
export const PROTECTED_ADDED_FIELDS = ['listed', 'encryption', 'features'].sort();
