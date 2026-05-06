import type { APIContext } from 'astro';
import { queryDB } from '../../lib/db';

export const prerender = false;

function authCheck(ctx: APIContext): Response | null {
  if (ctx.cookies.get('auth')?.value !== 'true') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(ctx: APIContext): Promise<Response> {
  const deny = authCheck(ctx);
  if (deny) return deny;

  try {
    const data = await queryDB(ctx.locals, `
      SELECT id, telegram_id, telegram_name, telegram_username, chat_mode, mute_until, created_at 
      FROM users WHERE chat_mode = 'human'
      ORDER BY mute_until DESC
    `);
    return Response.json({ success: true, results: data.results || [] });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(ctx: APIContext): Promise<Response> {
  const deny = authCheck(ctx);
  if (deny) return deny;

  try {
    const { id, chat_mode } = await ctx.request.json();
    if (!id || !chat_mode) return Response.json({ error: 'Missing parameters' }, { status: 400 });

    if (id === 'ALL') {
      // Unmute all: reset chat_mode to 'ai' and clear mute_until
      await queryDB(ctx.locals, `UPDATE users SET chat_mode = ?, mute_until = 0 WHERE chat_mode = 'human'`, [chat_mode]);
    } else {
      // Unmute single user: reset chat_mode and mute_until
      await queryDB(ctx.locals, `UPDATE users SET chat_mode = ?, mute_until = 0 WHERE id = ?`, [chat_mode, id]);
    }
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
