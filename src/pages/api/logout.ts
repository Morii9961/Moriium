import type { APIRoute } from 'astro';
import { handleLogout } from '../../server/http/auth-handlers.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request, session }) => {
  if (!session) return Response.json({ error: '会话存储不可用。' }, { status: 500 });
  return handleLogout(request, session);
};
