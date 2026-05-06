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
    const rows = await queryDB(
      ctx.locals,
      `SELECT id, provider_name as name, model_id as model_name, api_key,
              priority, is_active, is_cloudflare FROM ai_providers ORDER BY priority ASC`
    );
    // Normalize: map is_active (0/1) to status string for UI
    const providers = (rows.results ?? []).map((p: any) => ({
      ...p,
      status: p.is_active ? 'active' : 'paused',
    }));
    return Response.json({ providers });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(ctx: APIContext): Promise<Response> {
  const deny = authCheck(ctx);
  if (deny) return deny;

  try {
    const { id, status, priority, api_key, model_name } = await ctx.request.json();
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

    const updates: string[] = [];
    const vals: any[]       = [];

    // Map status string to is_active (0/1) for DB
    if (status !== undefined) { updates.push('is_active=?'); vals.push(status === 'active' ? 1 : 0); }
    if (priority !== undefined) { updates.push('priority=?'); vals.push(priority); }
    if (api_key !== undefined)  { updates.push('api_key=?');  vals.push(api_key); }
    if (model_name !== undefined) { updates.push('model_id=?'); vals.push(model_name); }

    if (!updates.length) return Response.json({ error: 'Nothing to update' }, { status: 400 });

    vals.push(id);
    await queryDB(ctx.locals, `UPDATE ai_providers SET ${updates.join(', ')} WHERE id=?`, vals);
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
