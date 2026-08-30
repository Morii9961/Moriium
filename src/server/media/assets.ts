// The media_assets table.
//
// Every statement touching that table is here, for the same reason the article
// SQL is confined to src/server/articles.ts: the publish gate, the import
// pipeline and the admin all talk about assets, and none of them should be able
// to invent a row shape.
//
// One column carries the whole privacy argument. `sanitized_at` is NULL until
// the server has stripped the file and re-read it to confirm, and the publish
// gate refuses any raster reference whose row still has NULL there (ADR 0002
// section 8.1). So this store never sets it from a parameter: only
// `recordImported`, which is called after the confirmation, can fill it in.

import type { DatabaseSync } from 'node:sqlite';
import { AdminError, isAdminError } from '../errors.ts';

export type MediaAsset = {
  id: number;
  /** A public URL path, never a disk path. */
  publicPath: string;
  format: string;
  width: number | null;
  height: number | null;
  alt: string;
  caption: string | null;
  copyright: string | null;
  /** Publishable EXIF tags kept as data. The file itself carries none. */
  exif: Readonly<Record<string, string>>;
  /** When the strip was confirmed. Null means unpublishable. */
  sanitizedAt: string | null;
  createdAt: string;
};

export type ImportedAsset = {
  publicPath: string;
  format: string;
  width: number | null;
  height: number | null;
  alt: string;
  caption: string | null;
  copyright: string | null;
};

type MediaRow = {
  id: number;
  public_path: string;
  format: string;
  width: number | null;
  height: number | null;
  alt: string;
  caption: string | null;
  copyright: string | null;
  exif_json: string;
  sanitized_at: string | null;
  created_at: string;
};

function toAsset(row: MediaRow): MediaAsset {
  let exif: Record<string, string> = {};
  try {
    const parsed: unknown = JSON.parse(row.exif_json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      exif = parsed as Record<string, string>;
    }
  } catch {
    // A row with unreadable EXIF is reported as empty here and refused by the
    // publish gate, which parses it again for exactly that reason.
  }
  return {
    id: row.id,
    publicPath: row.public_path,
    format: row.format,
    width: row.width,
    height: row.height,
    alt: row.alt,
    caption: row.caption,
    copyright: row.copyright,
    exif,
    sanitizedAt: row.sanitized_at,
    createdAt: row.created_at,
  };
}

export class MediaStore {
  readonly #db: DatabaseSync;
  readonly #now: () => string;

  constructor(db: DatabaseSync, now: () => string = () => new Date().toISOString()) {
    this.#db = db;
    this.#now = now;
  }

  list(): MediaAsset[] {
    const rows = this.#db
      .prepare('SELECT * FROM media_assets ORDER BY id DESC')
      .all() as MediaRow[];
    return rows.map(toAsset);
  }

  get(id: number): MediaAsset | null {
    const row = this.#db.prepare('SELECT * FROM media_assets WHERE id = ?').get(id) as
      | MediaRow
      | undefined;
    return row ? toAsset(row) : null;
  }

  getByPublicPath(publicPath: string): MediaAsset | null {
    const row = this.#db
      .prepare('SELECT * FROM media_assets WHERE public_path = ?')
      .get(publicPath) as MediaRow | undefined;
    return row ? toAsset(row) : null;
  }

  /**
   * Records an asset the server has already sanitized and confirmed.
   *
   * `sanitized_at` is stamped here rather than passed in. There is deliberately
   * no way to write a row that claims sanitization the pipeline never did.
   */
  recordImported(input: ImportedAsset): MediaAsset {
    const at = this.#now();
    try {
      this.#db
        .prepare(
          `INSERT INTO media_assets (
             public_path, format, width, height, alt, caption, copyright,
             exif_json, sanitized_at, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
        )
        .run(
          input.publicPath,
          input.format,
          input.width,
          input.height,
          input.alt,
          input.caption,
          input.copyright,
          at,
          at,
        );
    } catch (cause) {
      if (isAdminError(cause)) throw cause;
      const message = cause instanceof Error ? cause.message : String(cause);
      if (/UNIQUE|constraint/i.test(message)) {
        throw new AdminError(
          'conflict',
          'That image is already in the media library. Pick it from the library instead.',
          { cause },
        );
      }
      if (/database is locked|database is busy|SQLITE_BUSY/i.test(message)) {
        throw new AdminError('db-locked', 'The database is busy. Try again.', { cause });
      }
      throw new AdminError('db-write-failed', 'The media asset could not be recorded.', { cause });
    }
    return this.getByPublicPath(input.publicPath)!;
  }
}
