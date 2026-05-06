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

  const url = new URL(ctx.request.url);
  const search = url.searchParams.get('search')?.toLowerCase() || '';
  const status = url.searchParams.get('status') || '';

  try {
    let query = `
      SELECT a.id, a.name, a.product_id, a.account_username as username, a.account_password as password, a.status, a.created_at, p.name as product_name 
      FROM accounts a
      LEFT JOIN products p ON a.product_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      query += ` AND a.status = ?`;
      params.push(status);
    }
    
    if (search) {
      query += ` AND (LOWER(a.name) LIKE ? OR LOWER(a.account_username) LIKE ?)`;
      params.push('%' + search + '%');
      params.push('%' + search + '%');
    }

    query += ` ORDER BY a.id DESC`;

    const [rows, stats] = await Promise.all([
      queryDB(ctx.locals, query, params),
      queryDB(ctx.locals, `SELECT status, COUNT(*) as cnt FROM accounts GROUP BY status`),
    ]);

    const statMap: Record<string, number> = {};
    (stats.results ?? []).forEach((r: any) => { statMap[r.status] = r.cnt; });

    return Response.json({
      accounts: rows.results ?? [],
      stats: statMap,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(ctx: APIContext): Promise<Response> {
  const deny = authCheck(ctx);
  if (deny) return deny;

  try {
    const { product_id, name, username, password, status } = await ctx.request.json();
    if (!product_id || !name || !username || !password) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await queryDB(
      ctx.locals,
      `INSERT INTO accounts (product_id, name, account_username, account_password, status) VALUES (?, ?, ?, ?, ?)`,
      [product_id, name, username, password, status || 'active']
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
    const { id, product_id, name, username, password, status } = await ctx.request.json();
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

    await queryDB(
      ctx.locals,
      `UPDATE accounts SET product_id=?, name=?, account_username=?, account_password=?, status=? WHERE id=?`,
      [product_id, name, username, password, status, id]
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
    await queryDB(ctx.locals, `DELETE FROM accounts WHERE id=?`, [id]);
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
