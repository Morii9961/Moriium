// The media import pipeline (ADR 0002 section 8.1).
//
//   receive -> format and dimension check -> strip EXIF/XMP/IPTC
//           -> re-read the written file to confirm -> record the row
//
// Two properties are worth stating because they are what the block is for.
//
// The original never arrives. `AGENTS.md` keeps originals untouched, so what an
// author uploads is already a derivative — but the server does not take the
// client's word for that. It re-encodes unconditionally, which is what makes
// the guarantee independent of whatever tool produced the upload.
//
// The confirmation reads the file on disk, not the buffer in memory. Those are
// the same bytes today; the point is that the thing checked is the thing a
// build will later copy into the public tree, so a bug in the write path
// cannot pass the check.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { sanitizeToBuffer, sensitiveBlocksInFile } from '../../../scripts/lib/media.mjs';
import { AdminError } from '../errors.ts';
import { MediaStore, type MediaAsset } from './assets.ts';
import { fileForPublicPath, mediaRoot, publicPathFor } from './storage.ts';

/** Every import lands as WebP. One format, one recipe, one thing to audit. */
const OUTPUT_FORMAT = 'webp';
const OUTPUT_EXTENSION = 'webp';

export type ImportRequest = {
  readonly data: Uint8Array;
  readonly filename: string;
  readonly alt: string;
  readonly group?: string | undefined;
  readonly caption?: string | undefined;
  readonly copyright?: string | undefined;
};

export type ImportOptions = {
  readonly root?: string | undefined;
};

/**
 * Sanitizes one upload and records it.
 *
 * Alt text is required at import rather than at publication. The publish gate
 * refuses a blank alt anyway, but discovering that at publication means an
 * author finds out about a missing description long after they still remember
 * the photograph.
 */
export async function importImage(
  store: MediaStore,
  request: ImportRequest,
  options: ImportOptions = {},
): Promise<MediaAsset> {
  const alt = request.alt.trim();
  if (alt.length === 0) {
    throw new AdminError('validation-failed', '导入前必须填写替代文字。');
  }
  if (request.data.byteLength === 0) {
    throw new AdminError('validation-failed', '上传文件为空。');
  }

  let sanitized;
  try {
    sanitized = await sanitizeToBuffer(Buffer.from(request.data), OUTPUT_FORMAT);
  } catch (cause) {
    // Everything sanitizeToBuffer rejects is a property of the upload: an
    // unsupported format, an animation, unreadable dimensions, a truncated
    // file, or metadata that survived the re-encode.
    throw new AdminError(
      'media-gate-refused',
      '无法将此文件转换为已清理元数据的公开图片。请检查格式、尺寸与文件完整性。',
      { cause },
    );
  }

  const root = options.root ?? mediaRoot();
  const publicPath = publicPathFor({
    data: sanitized.data,
    filename: request.filename,
    group: request.group,
    extension: OUTPUT_EXTENSION,
  });
  // The digest covers the sanitized bytes, so a repeat import resolves to the
  // path it produced last time. Refusing here rather than at the INSERT means a
  // duplicate never touches the filesystem; the unique constraint still catches
  // two uploads racing each other.
  if (store.getByPublicPath(publicPath)) {
    throw new AdminError(
      'conflict',
      '图片已在媒体库中，请直接选用。',
    );
  }

  const file = fileForPublicPath(publicPath, root);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, sanitized.data);

  const remaining = await sensitiveBlocksInFile(file);
  if (remaining.length > 0) {
    await rm(file, { force: true });
    throw new AdminError(
      'media-gate-refused',
      `存储后的图片仍含有 ${remaining.join(', ')} 元数据，文件已丢弃。`,
    );
  }

  try {
    return store.recordImported({
      publicPath,
      format: sanitized.format,
      width: sanitized.width,
      height: sanitized.height,
      alt,
      caption: request.caption?.trim() || null,
      copyright: request.copyright?.trim() || null,
    });
  } catch (error) {
    // A file with no row is inert -- the publish gate refuses references it
    // cannot find -- but it is still litter. Keep it only when it belongs to a
    // row that already exists, which is what a repeated upload of the same
    // image produces.
    if (!store.getByPublicPath(publicPath)) await rm(file, { force: true });
    throw error;
  }
}
