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

  const search = ctx.url.searchParams.get('search') || '';

  try {
    const where  = search ? `WHERE name LIKE ?` : '';
    const params = search ? [`%${search}%`] : [];

    const rows = await queryDB(ctx.locals, `SELECT * FROM predefined_products ${where} ORDER BY id DESC`, params);

    return Response.json({
      predefined: rows.results ?? [],
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(ctx: APIContext): Promise<Response> {
  const deny = authCheck(ctx);
  if (deny) return deny;

  try {
    const { name } = await ctx.request.json();
    if (!name) return Response.json({ error: 'Name is required' }, { status: 400 });

    const result = await queryDB(ctx.locals, `INSERT INTO predefined_products (name) VALUES (?)`, [name]);
    return Response.json({ success: true, id: result.meta?.last_row_id });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(ctx: APIContext): Promise<Response> {
  const deny = authCheck(ctx);
  if (deny) return deny;

  try {
    const { id, name } = await ctx.request.json();
    if (!id || !name) return Response.json({ error: 'Missing fields' }, { status: 400 });

    await queryDB(ctx.locals, `UPDATE predefined_products SET name=? WHERE id=?`, [name, id]);
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

    await queryDB(ctx.locals, `DELETE FROM predefined_products WHERE id=?`, [id]);
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
