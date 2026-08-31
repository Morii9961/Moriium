import type { APIRoute } from 'astro';
import { getDatabase } from '../../server/db/runtime.ts';
import { adminJson } from '../../server/http/boundary.ts';
import { handleStatus } from '../../server/http/status-handlers.ts';

export const prerender = false;

export const GET: APIRoute = async ({ request, session }) => {
  if (!session) return adminJson({ error: 'Session storage unavailable.' }, 500);
  return handleStatus(request, session, getDatabase());
};
