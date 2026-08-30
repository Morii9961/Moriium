// Author-only media HTTP boundary.
//
// Three endpoints, and the third one is the reason the other two are useful:
//
//   GET  /api/media            the library the editor picks from
//   POST /api/media            one upload, sanitized before it is recorded
//   GET  /api/media/<id>/file  the bytes, so an author can see what they pick
//
// The third exists because imported media lives in /var/lib/moriium/media/ and
// only reaches the public tree at the next export (ADR 0002 section 15.3).
// Until then a `/media/...` path resolves to nothing, and a picker showing
// broken thumbnails would be worse than typing paths by hand. It is not a
// public route: it needs an author session, and it can only serve a file a
// media_assets row names, so the row set is the allowlist rather than a filter
// over an author-supplied path.

import { readFile } from 'node:fs/promises';
import type { DatabaseSync } from 'node:sqlite';
import type { AuthorSession } from '../auth/session.ts';
import { AdminError } from '../errors.ts';
import { importImage } from '../media/import.ts';
import { MediaStore } from '../media/assets.ts';
import { fileForPublicPath } from '../media/storage.ts';
import {
  adminJson,
  authorizeRequest,
  readBodyBytes,
  RequestBodyError,
  responseForError,
} from './boundary.ts';

/**
 * The largest upload accepted, before sanitization.
 *
 * A camera JPEG off a full-frame body runs 10-25 MB. This is meant to stop a
 * misdirected video, not to be a quality judgement, so it sits above the
 * largest photograph anyone would reasonably import and well below anything
 * that would strain the box.
 */
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  webp: 'image/webp',
  avif: 'image/avif',
  jpeg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
};

function textField(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === 'string' ? value : undefined;
}

/**
 * Reads a multipart upload under the byte cap.
 *
 * The body is drained through the cap first and only then handed to the
 * multipart parser. Parsing first would mean the parser decides how much of an
 * unbounded body to hold in memory.
 */
async function uploadForm(request: Request): Promise<FormData> {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw new RequestBodyError(415, 'Expected a multipart upload.');
  }
  const body = await readBodyBytes(request, MAX_UPLOAD_BYTES);
  if (!body.ok) {
    throw new RequestBodyError(
      body.status,
      body.status === 413 ? 'That file is too large to import.' : 'The upload was unreadable.',
    );
  }
  try {
    return await new Response(body.value, { headers: { 'Content-Type': contentType } }).formData();
  } catch {
    throw new RequestBodyError(400, 'The upload was unreadable.');
  }
}

export async function handleMediaCollection(
  request: Request,
  session: AuthorSession,
  db: DatabaseSync,
): Promise<Response> {
  const write = request.method !== 'GET';
  const auth = await authorizeRequest(request, session, write);
  if (!auth.ok) return auth.response;

  const store = new MediaStore(db);
  try {
    if (request.method === 'GET') return adminJson({ assets: store.list() }, 200);
    if (request.method !== 'POST') return adminJson({ error: 'Method not allowed.' }, 405);

    const form = await uploadForm(request);
    const file = form.get('file');
    if (!(file instanceof Blob)) {
      throw new AdminError('validation-failed', 'The upload had no file attached.');
    }
    const asset = await importImage(store, {
      data: new Uint8Array(await file.arrayBuffer()),
      filename: file instanceof File ? file.name : '',
      alt: textField(form, 'alt') ?? '',
      group: textField(form, 'group'),
      caption: textField(form, 'caption'),
      copyright: textField(form, 'copyright'),
    });
    return adminJson({ asset }, 201);
  } catch (error) {
    return responseForError(error);
  }
}

/** Serves one recorded asset's bytes to a signed-in author. */
export async function handleMediaFile(
  request: Request,
  session: AuthorSession,
  db: DatabaseSync,
  assetId: number,
): Promise<Response> {
  if (request.method !== 'GET') return adminJson({ error: 'Method not allowed.' }, 405);
  const auth = await authorizeRequest(request, session, false);
  if (!auth.ok) return auth.response;

  try {
    const asset = new MediaStore(db).get(assetId);
    if (!asset) throw new AdminError('validation-failed', 'That media asset does not exist.');
    const file = fileForPublicPath(asset.publicPath);
    let bytes: Buffer;
    try {
      bytes = await readFile(file);
    } catch (cause) {
      // A row whose file is gone is a real state -- a restore that missed the
      // media directory, most likely -- and it deserves its own answer rather
      // than a generic server error.
      throw new AdminError('validation-failed', 'That media file is missing from storage.', {
        cause,
      });
    }
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': CONTENT_TYPES[asset.format] ?? 'application/octet-stream',
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return responseForError(error);
  }
}
