import { readdir } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const mediaRoots = [resolve(root, 'public/media/posts'), resolve(root, 'public/design')];
const rasterExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff']);
const errors = [];

async function filesUnder(directory) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return files;
    throw error;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (rasterExtensions.has(extname(entry.name).toLowerCase())) files.push(path);
  }
  return files;
}

for (const directory of mediaRoots) {
  for (const file of await filesUnder(directory)) {
    const metadata = await sharp(file).metadata();
    const sensitive = ['exif', 'xmp', 'iptc'].filter((field) => metadata[field]);
    if (sensitive.length) {
      errors.push(`${relative(root, file)} contains ${sensitive.join(', ')} metadata; create a sanitized publishing copy.`);
    }
  }
}

if (errors.length) {
  console.error(errors.map((message) => `- ${message}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Published raster media contains no EXIF, XMP, or IPTC metadata.');
}
