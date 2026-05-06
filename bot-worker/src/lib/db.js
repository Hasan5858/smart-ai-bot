/**
 * DB Helper — communicates with db-worker via Service Binding (prod) or HTTP (local).
 */
export async function queryDB(env, sql, params = []) {
  const payload = { sql, params };

  if (env.IS_LOCAL === "true") {
    const res = await fetch(`${env.LOCAL_DB_URL}/api/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.DB_SECRET_TOKEN}`
      },
      body: JSON.stringify(payload)
    });
    return res.json();
  } else {
    const req = new Request("http://db-worker/api/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.DB_SECRET_TOKEN}`
      },
      body: JSON.stringify(payload)
    });
    const res = await env.DB_WORKER.fetch(req);
    return res.json();
  }
}
