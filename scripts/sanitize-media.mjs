// Produces one public derivative from one original.
//
//   node scripts/sanitize-media.mjs path/to/original.jpg public/media/posts/article/photo.webp
//
// The recipe and the confirmation that the metadata really went away live in
// scripts/lib/media.mjs, because the admin's upload path runs the same two
// steps on a file that never touches this command line (ADR 0002 section 8.1).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { formatForExtension, sanitizeToBuffer } from './lib/media.mjs';

const root = resolve(import.meta.dirname, '..');
const publicRoot = resolve(root, 'public');
const source = resolve(root, process.argv[2] ?? '');
const destination = resolve(root, process.argv[3] ?? '');

function inside(parent, child) {
  const path = relative(parent, child);
  return path && !path.startsWith('..') && !isAbsolute(path);
}

if (!process.argv[2] || !process.argv[3]) {
  console.error('Usage: node scripts/sanitize-media.mjs <source-image> <public/destination.webp>');
  process.exitCode = 1;
} else if (!inside(publicRoot, destination)) {
  throw new Error('Sanitized media destination must be inside public/.');
} else {
  const result = await sanitizeToBuffer(source, formatForExtension(destination));
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, result.data);
  console.log(`Sanitized derivative: ${relative(root, destination)}`);
  console.log(
    `Dimensions: ${result.source.width}x${result.source.height} -> ${result.width}x${result.height}; ` +
      `metadata blocks removed: ${result.source.blocks.join(', ') || 'none present'}.`,
  );
}
