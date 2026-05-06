/**
 * queryDB — Dual-mode database helper.
 *
 * - Local dev (astro dev, NODE_ENV=development): uses public db-worker URL from .env
 * - Production (wrangler deploy): uses internal DB_WORKER service binding
 */

export async function queryDB(
  _locals: unknown,
  sql: string,
  params: unknown[] = []
): Promise<any> {
  const payload = JSON.stringify({ sql, params });

  // In Astro dev mode (npm run dev), import.meta.env.DEV is true
  // We never have real Cloudflare bindings in dev mode — always use public URL
  const isDev = import.meta.env.DEV;

  if (!isDev) {
    // ✅ Production path — Cloudflare Workers service binding
    try {
      // @ts-ignore — cloudflare:workers only exists in the Workers runtime
      const { env } = await import('cloudflare:workers');
      if (env?.DB_WORKER) {
        const req = new Request('http://db-worker/api/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.DB_SECRET_TOKEN}`,
          },
          body: payload,
        });
        const res = await env.DB_WORKER.fetch(req);
        const text = await res.text();
        try { return JSON.parse(text); }
        catch { throw new Error('DB Service Binding Error: ' + text); }
      }
    } catch (e: any) {
      // Falls through to public URL if binding unavailable
      if (!e.message?.includes('Cannot find module')) throw e;
    }
  }

  // ✅ Local dev path — public URL from .env
  const LOCAL_DB_URL = import.meta.env.LOCAL_DB_URL;
  const DB_SECRET_TOKEN = import.meta.env.DB_SECRET_TOKEN;

  if (!LOCAL_DB_URL) {
    throw new Error('LOCAL_DB_URL not set in .env — required for local development');
  }

  const res = await fetch(`${LOCAL_DB_URL}/api/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DB_SECRET_TOKEN}`,
    },
    body: payload,
  });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error('DB Fetch Error (Local): ' + text); }
}

/** Get ADMIN_PASSWORD from Cloudflare Workers env (prod) or .env (dev) */
export async function getAdminPassword(): Promise<string> {
  const isDev = import.meta.env.DEV;

  if (!isDev) {
    try {
      // @ts-ignore
      const { env } = await import('cloudflare:workers');
      if (env?.ADMIN_PASSWORD) return env.ADMIN_PASSWORD;
    } catch { /* falls through */ }
  }

  return import.meta.env.ADMIN_PASSWORD ?? 'admin123';
}
