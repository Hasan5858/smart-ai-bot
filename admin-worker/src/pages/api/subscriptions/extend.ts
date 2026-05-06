import type { APIContext } from 'astro';
import { queryDB } from '../../../lib/db';

export const prerender = false;

export async function POST(ctx: APIContext): Promise<Response> {
  if (ctx.cookies.get('auth')?.value !== 'true') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { id, new_expiry_date } = await ctx.request.json();
    if (!id || !new_expiry_date) {
      return Response.json({ error: 'Missing id or new_expiry_date' }, { status: 400 });
    }
    await queryDB(
      ctx.locals,
      `UPDATE subscriptions SET expiry_date=?, status='active' WHERE id=?`,
      [new_expiry_date, id]
    );
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
