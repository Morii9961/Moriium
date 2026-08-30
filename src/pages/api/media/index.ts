import type { APIRoute } from 'astro';
import { getDatabase } from '../../../server/db/runtime.ts';
import { handleMediaCollection } from '../../../server/http/media-handlers.ts';
import { adminJson } from '../../../server/http/boundary.ts';

export const prerender = false;

const handle: APIRoute = async ({ request, session }) => {
  if (!session) return adminJson({ error: 'Session storage unavailable.' }, 500);
  return handleMediaCollection(request, session, getDatabase());
};

export const GET = handle;
export const POST = handle;
