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

  const page   = Math.max(1, Number(ctx.url.searchParams.get('page') || 1));
  const limit  = 15;
  const offset = (page - 1) * limit;
  let search = ctx.url.searchParams.get('search') || '';
  if (search.startsWith('@')) search = search.slice(1);

  try {
    const where  = search ? `WHERE telegram_name LIKE ? OR telegram_username LIKE ? OR email LIKE ?` : '';
    const sp     = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];

    const [rows, countRow] = await Promise.all([
      queryDB(ctx.locals, `SELECT id, telegram_id, telegram_username as username, telegram_name as name, user_type, created_at, email FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...sp, limit, offset]),
      queryDB(ctx.locals, `SELECT COUNT(*) as total FROM users ${where}`, sp),
    ]);

    return Response.json({
      users:  rows.results ?? [],
      total:  countRow.results?.[0]?.total ?? 0,
      page,
      pages:  Math.ceil((countRow.results?.[0]?.total ?? 0) / limit),
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(ctx: APIContext): Promise<Response> {
  const deny = authCheck(ctx);
  if (deny) return deny;

  try {
    const { name, email, username, telegram_id } = await ctx.request.json();
    if (!name) return Response.json({ error: 'Name is required' }, { status: 400 });

    const finalTid = telegram_id || (-Math.floor(Math.random() * 1000000000));

    await queryDB(
      ctx.locals,
      `INSERT INTO users (telegram_name, email, telegram_username, telegram_id, user_type) VALUES (?, ?, ?, ?, 'client')`,
      [name, email || null, username || null, finalTid]
    );
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(ctx: APIContext): Promise<Response> {
  const deny = authCheck(ctx);
  if (deny) return deny;

  try {
    const { id, name, email, username, telegram_id } = await ctx.request.json();
    if (!id || !name) return Response.json({ error: 'ID and Name are required' }, { status: 400 });

    await queryDB(
      ctx.locals,
      `UPDATE users SET telegram_name=?, email=?, telegram_username=?, telegram_id=? WHERE id=?`,
      [name, email || null, username || null, telegram_id || 0, id]
    );
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(ctx: APIContext): Promise<Response> {
  const deny = authCheck(ctx);
  if (deny) return deny;

  try {
    const { id } = await ctx.request.json();
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

    await queryDB(ctx.locals, `DELETE FROM users WHERE id=?`, [id]);
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
