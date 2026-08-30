import type { APIRoute } from 'astro';
import { handleSession } from '../../server/http/auth-handlers.ts';

export const prerender = false;

export const GET: APIRoute = async ({ request, session }) => {
  if (!session) return Response.json({ error: 'Session storage unavailable.' }, { status: 500 });
  return handleSession(request, session);
};
