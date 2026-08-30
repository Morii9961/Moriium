import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { protectedPostMetadataSchema, publicPostMetadataSchema } from './content-schema';

const posts = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/posts' }),
  schema: publicPostMetadataSchema,
});

const protectedPosts = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/protected' }),
  schema: protectedPostMetadataSchema,
});

export const collections = { posts, protected: protectedPosts };
