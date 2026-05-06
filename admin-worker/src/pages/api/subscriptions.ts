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
  const filter = ctx.url.searchParams.get('status') || '';
  const userId = ctx.url.searchParams.get('user_id') || '';
  const accountId = ctx.url.searchParams.get('account_id') || '';
  let search = ctx.url.searchParams.get('search') || '';
  if (search.startsWith('@')) search = search.slice(1);

  try {
    let where = 'WHERE 1=1';
    let params: any[] = [];

    if (search) {
      where += ` AND (u.telegram_name LIKE ? OR u.telegram_username LIKE ? OR p.name LIKE ?)`;
      params.push('%' + search + '%', '%' + search + '%', '%' + search + '%');
    }
    if (filter) {
      where += ` AND s.status = ?`;
      params.push(filter);
    }
    if (userId) {
      where += ` AND s.user_id = ?`;
      params.push(Number(userId));
    }
    if (accountId) {
      where += ` AND s.account_id = ?`;
      params.push(Number(accountId));
    }

    const countParams = [...params];
    params.push(limit, offset);

    const [rows, countRow, stats] = await Promise.all([
      queryDB(ctx.locals,
        `SELECT s.*, u.telegram_name as user_name, u.telegram_username as user_username,
                p.name as product_name, a.name as account_name, a.account_username
         FROM subscriptions s
         LEFT JOIN users u ON s.user_id = u.id
         LEFT JOIN products p ON s.product_id = p.id
         LEFT JOIN accounts a ON s.account_id = a.id
         ${where} ORDER BY s.expiry_date ASC LIMIT ? OFFSET ?`, params),
      queryDB(ctx.locals,
        `SELECT COUNT(*) as total FROM subscriptions s 
         LEFT JOIN users u ON s.user_id = u.id 
         LEFT JOIN products p ON s.product_id = p.id 
         ${where}`, countParams),
      queryDB(ctx.locals,
        `SELECT status, COUNT(*) as cnt FROM subscriptions GROUP BY status`),
    ]);

    return Response.json({
      subscriptions: rows.results ?? [],
      total: countRow.results?.[0]?.total ?? 0,
      page,
      pages: Math.ceil((countRow.results?.[0]?.total ?? 0) / limit),
      stats: Object.fromEntries((stats.results ?? []).map((r: any) => [r.status, r.cnt])),
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(ctx: APIContext): Promise<Response> {
  const deny = authCheck(ctx);
  if (deny) return deny;

  try {
    const body = await ctx.request.json();
    const { user_id, product_id, account_id, profile_name, profile_pin,
            purchase_date, expiry_date, purchase_amount, status,
            new_user_name, new_user_username } = body;

    let finalUserId = user_id;

    // Create new user if requested
    if (!user_id && new_user_name) {
      const newUser = await queryDB(
        ctx.locals,
        `INSERT INTO users (telegram_name, telegram_username, telegram_id, user_type) VALUES (?, ?, 0, 'client')`,
        [new_user_name, new_user_username || null]
      );
      finalUserId = newUser.meta?.last_row_id;
    }

    if (!finalUserId || !product_id || !purchase_date || !expiry_date) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await queryDB(
      ctx.locals,
      `INSERT INTO subscriptions (user_id, product_id, account_id, account_username, account_password, profile_name, profile_pin,
       purchase_date, expiry_date, purchase_amount, status)
       VALUES (?, ?, ?, '', '', ?, ?, ?, ?, ?, ?)`,
      [finalUserId, product_id, account_id || null, profile_name || null, profile_pin || null,
       purchase_date, expiry_date, purchase_amount || 0, status || 'active']
    );
    if (!result.success) throw new Error(result.error || 'Insert failed');
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(ctx: APIContext): Promise<Response> {
  const deny = authCheck(ctx);
  if (deny) return deny;

  try {
    const { id, status, expiry_date, purchase_amount, profile_name, profile_pin, account_id } = await ctx.request.json();
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

    const result = await queryDB(
      ctx.locals,
      `UPDATE subscriptions SET status=?, expiry_date=?, purchase_amount=?,
       profile_name=?, profile_pin=?, account_id=? WHERE id=?`,
      [status, expiry_date, purchase_amount, profile_name, profile_pin, account_id, id]
    );
    if (!result.success) throw new Error(result.error || 'Update failed');
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
    const result = await queryDB(ctx.locals, `DELETE FROM subscriptions WHERE id=?`, [id]);
    if (!result.success) throw new Error(result.error || 'Delete failed');
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
