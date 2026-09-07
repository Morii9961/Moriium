import type { APIRoute } from 'astro';
import { handleSession } from '../../server/http/auth-handlers.ts';

export const prerender = false;

export const GET: APIRoute = async ({ request, session }) => {
  if (!session) return Response.json({ error: '会话存储不可用。' }, { status: 500 });
  return handleSession(request, session);
};
