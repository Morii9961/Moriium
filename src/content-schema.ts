import { z } from 'astro/zod';

const language = z.enum(['zh', 'ja', 'en']);

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
