import type { APIContext } from 'astro';
import { getAdminPassword } from '../../lib/db';

export const prerender = false;

export async function POST(ctx: APIContext): Promise<Response> {
  try {
    const body = await ctx.request.json();
    const adminPassword = await getAdminPassword();

    if (body.password === adminPassword) {
      ctx.cookies.set('auth', 'true', {
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        httpOnly: false,
        sameSite: 'lax',
      });
      return Response.json({ success: true });
    }

    return Response.json({ success: false, error: 'Invalid password' }, { status: 401 });
  } catch (err) {
    return Response.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
