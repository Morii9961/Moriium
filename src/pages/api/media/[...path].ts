import type { APIRoute } from 'astro';
import { getDatabase } from '../../../server/db/runtime.ts';
import { handleMediaFile } from '../../../server/http/media-handlers.ts';
import { adminJson } from '../../../server/http/boundary.ts';

export const prerender = false;

const MEDIA_PATH = /^(\d+)\/file$/;

const handle: APIRoute = async ({ request, session, params }) => {
  if (!session) return adminJson({ error: 'Session storage unavailable.' }, 500);
  const match = MEDIA_PATH.exec(params.path ?? '');
  if (!match) return adminJson({ error: 'Media route not found.' }, 404);
  const assetId = Number(match[1]);
  if (!Number.isSafeInteger(assetId) || assetId <= 0) {
    return adminJson({ error: 'Media route not found.' }, 404);
  }
  return handleMediaFile(request, session, getDatabase(), assetId);
};

export const GET = handle;
