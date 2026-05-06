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
  const limit  = 10;
  const offset = (page - 1) * limit;
  const search = ctx.url.searchParams.get('search') || '';

  try {
    const baseCondition = "description != 'Predefined Service'";
    const where  = search ? `WHERE ${baseCondition} AND name LIKE ?` : `WHERE ${baseCondition}`;
    const params = search ? [`%${search}%`, limit, offset] : [limit, offset];

    const [rows, countRow] = await Promise.all([
      queryDB(ctx.locals, `SELECT * FROM products ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, params),
      queryDB(ctx.locals, `SELECT COUNT(*) as total FROM products ${where}`, search ? [`%${search}%`] : []),
    ]);

    return Response.json({
      products: rows.results ?? [],
      total: countRow.results?.[0]?.total ?? 0,
      page,
      pages: Math.ceil((countRow.results?.[0]?.total ?? 0) / limit),
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(ctx: APIContext): Promise<Response> {
  const deny = authCheck(ctx);
  if (deny) return deny;

  try {
    const { name, base_price, is_renewable, description } = await ctx.request.json();
    if (!name || base_price == null) return Response.json({ error: 'Missing fields' }, { status: 400 });

    const result = await queryDB(
      ctx.locals,
      `INSERT INTO products (name, base_price, is_renewable, description) VALUES (?, ?, ?, ?)`,
      [name, Number(base_price), is_renewable ? 1 : 0, description ?? '']
    );
    return Response.json({ success: true, id: result.meta?.last_row_id });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(ctx: APIContext): Promise<Response> {
  const deny = authCheck(ctx);
  if (deny) return deny;

  try {
    const { id, name, base_price, is_renewable, description } = await ctx.request.json();
    if (!id || !name) return Response.json({ error: 'Missing fields' }, { status: 400 });

    await queryDB(
      ctx.locals,
      `UPDATE products SET name=?, base_price=?, is_renewable=?, description=? WHERE id=?`,
      [name, Number(base_price), is_renewable ? 1 : 0, description ?? '', id]
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

    await queryDB(ctx.locals, `DELETE FROM products WHERE id=?`, [id]);
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
