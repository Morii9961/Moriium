import type { APIRoute } from 'astro';
import { productionLoginThrottle } from '../../server/auth/runtime.ts';
import { getDatabase } from '../../server/db/runtime.ts';
import { handleLogin } from '../../server/http/auth-handlers.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, session }) => {
  if (!session) return Response.json({ error: 'Session storage unavailable.' }, { status: 500 });
  return handleLogin(request, session, getDatabase(), productionLoginThrottle);
};
