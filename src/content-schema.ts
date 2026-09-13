import { z } from 'astro/zod';

const language = z.enum(['zh', 'ja', 'en']);

/**
 * Who an article is by. The two author accounts, and nobody else: the byline
 * names a person the site already knows, never free text.
 */
export const AUTHOR_NAMES = ['Morii', 'Enouia'] as const;
export type AuthorName = (typeof AUTHOR_NAMES)[number];

export const sharedMetadata = z.object({
  title: z.string().min(1),
  // Astro reserves `slug` as a collection-wide ID. Prefix it with the language
  // so translations can share the same public route segment without colliding.
  slug: z.string().regex(/^(zh|ja|en)\/[a-z0-9]+(?:-[a-z0-9]+)*$/),
  summary: z.string().min(1).max(280),
  publishedAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
  lang: language,
  translationKey: z.string().min(1),
  // The language this variant was machine translated from, absent when a
  // person wrote it. `AGENTS.md` permits machine translation only when the
  // page says so, and this field is what every surface reads to say it.
  machineTranslation: language.optional(),
  // The byline, which is not the same thing as the account that saved a
  // version: either author may publish, correct or translate the other's
  // article without taking the credit for it. Morii by default, because every
  // article written before the field existed is Morii's.
  author: z.enum(AUTHOR_NAMES).default('Morii'),
  category: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  cover: z.string().optional(),
  coverAlt: z.string().optional(),
  draft: z.boolean().default(false),
  unlisted: z.boolean().default(false),
  copyProtection: z.boolean().default(false),
});

export const publicPostMetadataSchema = sharedMetadata.superRefine((value, context) => {
  if (value.cover && !value.coverAlt) {
    context.addIssue({
      code: 'custom',
      path: ['coverAlt'],
      message: 'coverAlt is required when cover is present',
    });
  }
});

export const protectedPostMetadataSchema = sharedMetadata
  .omit({ cover: true, coverAlt: true, copyProtection: true })
  .extend({
    listed: z.boolean().default(false),
    encryption: z.object({
      version: z.literal(1),
      algorithm: z.literal('AES-256-GCM'),
      kdf: z.literal('PBKDF2-HMAC-SHA-256'),
      iterations: z.literal(600000),
      salt: z.string().min(20),
      iv: z.string().min(16),
      ciphertext: z.string().min(1),
    }),
    features: z.object({
      lightbox: z.boolean(),
      mermaid: z.boolean(),
      music: z.boolean(),
      video: z.boolean(),
      math: z.boolean(),
    }),
  });
