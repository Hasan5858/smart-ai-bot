export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Security Check: Token Verification
    const authHeader = request.headers.get("Authorization");
    const expectedToken = `Bearer ${env.DB_SECRET_TOKEN}`;

    // If the token doesn't match, block the request
    if (authHeader !== expectedToken) {
      return new Response("Unauthorized: Invalid or missing token.", { status: 401 });
    }

    // 2. Generic Query Endpoint (Only Bot Worker can access this)
    if (request.method === "POST" && url.pathname === "/api/query") {
      try {
        const body = await request.json();
        const { sql, params = [] } = body;

        if (!sql) {
          return Response.json({ error: "Missing 'sql' property in request body." }, { status: 400 });
        }

        // Execute the query on the bound D1 Database
        const stmt = env.DB.prepare(sql).bind(...params);
        const { results, success, meta } = await stmt.all();

        return Response.json({ success, results, meta });
      } catch (err) {
        return Response.json({ error: err.message, stack: err.stack }, { status: 500 });
      }
    }

    // Health check endpoint
    return Response.json({ message: "DB Worker is securely running!" });
  }
};
