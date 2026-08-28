import { mkdir } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import sharp from 'sharp';

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
  const before = await sharp(source).metadata();
  const image = sharp(source, { failOn: 'warning' }).rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true });
  const format = extname(destination).toLowerCase();
  if (format === '.webp') image.webp({ quality: 84, smartSubsample: true });
  else if (format === '.avif') image.avif({ quality: 62, effort: 6 });
  else if (format === '.jpg' || format === '.jpeg') image.jpeg({ quality: 86, mozjpeg: true });
  else throw new Error('Destination must be .webp, .avif, .jpg, or .jpeg.');
  await mkdir(dirname(destination), { recursive: true });
  await image.toFile(destination);
  const after = await sharp(destination).metadata();
  if (after.exif || after.icc || after.xmp) throw new Error('Output still contains metadata blocks.');
  console.log(`Sanitized derivative: ${relative(root, destination)}`);
  console.log(`Dimensions: ${before.width}x${before.height} -> ${after.width}x${after.height}; metadata blocks removed.`);
}
