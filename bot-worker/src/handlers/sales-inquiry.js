import { executeWithFallback, extractTextResponse } from "../lib/ai.js";
import { queryDB } from "../lib/db.js";

/**
 * System prompt for the sales reply step.
 */
function getSalesReplyPrompt(dbContext) {
  return `You are a sales assistant. Reply ONLY using the Product Data below. NEVER add information from your own knowledge or the internet.

=== PRODUCT DATA ===
${dbContext}
=== END OF PRODUCT DATA ===

STRICT RULES:
1. Use ONLY the Product Data above. Do NOT add anything from training knowledge or the internet.
2. If the user asks about payments, Bkash/Nagad, how to send money, or if a detail is NOT in the data (e.g. personal email limit) OR you cannot fulfill the request → you MUST say exactly: "এসকল বিষয়ে আমার কাছে তথ্য নেই। আপনি চাইলে আমি একজন হিউম্যান এজেন্টকে যুক্ত করতে পারি। আপনি কি হিউম্যান এজেন্টের সাথে কথা বলতে চান?"
3. NEVER share external links, URLs, or website references.
4. NEVER say the word "database".
5. No greeting in follow-up messages — answer directly.
6. Use a respectful, formal tone throughout. NEVER use "tui" or "tumi". Use "apnar" (your) naturally within sentences when needed — do NOT mechanically start every sentence or reply with the word "Apni". Speak naturally like a polite salesperson.
7. Reply in Banglish (Bengali words in English letters). Currency: "Tk". IMPORTANT: Review the chat history. If there are past 'assistant' messages (written by the human agent), perfectly mimic their sentence structure, tone, and Banglish spelling style. Keep it fully natural.
8. If user asks about a specific feature (e.g., "4K?", "TV te cholbe?") — answer ONLY that in 1-2 lines. Do NOT re-list the full price list.
9. If data starts with "REQUESTED_PLAN_NOT_FOUND|SIMILAR_PRODUCTS:" — say the specific plan is unavailable, then list similar plans ONCE. If the same list was already shown in chat history, do NOT repeat it — just say "Na, oi plan nai amader kache."
10. Check chat history: if a product list was already shown, do NOT repeat it. Answer the follow-up directly.
11. Discount (first ask): "Ekhon kono discount available nai, fixed price e pawa jabe."
12. Discount (repeated push): "Amar discount offer korar authority nei. Fixed price chara dewa sambhob na."
13. Do NOT mention "renewable" or "non-renewable" unless the user specifically asks.
14. Keep responses short. Use 1-2 emojis max.
15. ACCOUNT TYPE LOGIC (only when user asks about personal email or device access):
    - "1 device" in plan name/description = SHARED account. Multiple logins NOT allowed. NOT linked to personal email.
    - EXCEPTION: If the SAME product has a separate "Personal" plan OR description explicitly says "personal email/account" → only then confirm personal email.
    - Never guess account type beyond what the data says.
16. WARRANTY LOGIC (only when user asks):
    - Default: all products have replacement warranty.
    - Exception: if description explicitly says "no replacement warranty" → no warranty.
    - Do NOT mention warranty unless the user asks.
17. NEVER use the folded hands / praying emoji (🙏) under any circumstance. Use other emojis if needed.

38. SPOTIFY & GOOGLE STORAGE RULE: If the user sends a message about "Spotify" or "Google Storage" (Google One/Google Drive) and does NOT explicitly ask for its pricing, you MUST NOT answer them and instead say EXACTLY: "এসকল বিষয়ে বিস্তারিত জানতে আমি একজন হিউম্যান এজেন্টকে যুক্ত করতে পারি। আপনি কি হিউম্যান এজেন্টের সাথে কথা বলতে চান?" (Only provide pricing if they specifically ask for price/cost).

Pricing format (when listing):
**Product Name**
➡ Plan details – XXX Tk`;
}

// ─── Keyword-based product name extractor ──────────────────────────────────────
// Replaces the AI tool call — extracts the product name user is asking about.
function extractProductKeyword(text, historyMessages = []) {
  if (!text || typeof text !== "string") return "";
  const t = text.toLowerCase();

  // Normalize common nicknames
  if (/chat\s*gpt|openai/.test(t)) return "ChatGPT";
  if (/netflix/.test(t)) return "Netflix";
  if (/\bprime\b|amazon\s*prime|prime\s*video/.test(t)) return "Prime Video";
  if (/hoichoi/.test(t)) return "Hoichoi";
  if (/grammarly/.test(t)) return "Grammarly";
  if (/perplexity/.test(t)) return "Perplexity";
  if (/sony\s*liv|sonyliv/.test(t)) return "SonyLIV";
  if (/zee\s*5/.test(t)) return "ZEE5";
  if (/surfshark/.test(t)) return "Surfshark";
  if (/\bvpn\b/.test(t)) return "Surfshark"; // vpn → Surfshark as default
  if (/canva/.test(t)) return "Canva";
  if (/spotify/.test(t)) return "Spotify";
  if (/google\s*storage|google\s*drive|google\s*one/i.test(t)) return "Google Storage";
  if (/youtube/.test(t)) return "YouTube";
  if (/\bamazon\b/.test(t)) return "Prime Video";

  // If no match in current message, scan recent history
  if (historyMessages.length > 0) {
    const recentContent = historyMessages
      .slice(-6)
      .map(m => (typeof m.content === "string" ? m.content : ""))
      .join(" ");
    return extractProductKeyword(recentContent); // recursive, history only (no 3rd arg)
  }

  return ""; // empty = fetch all products
}

/**
 * Handler: SALES_INQUIRY
 *
 * Pre-fetched context pattern (no tool call):
 *   1. Extract product keyword from user message via keyword matching
 *   2. Fetch product data directly from DB
 *   3. Single AI call to generate reply strictly from DB data
 */
export async function handleSalesInquiry(env, userText, historyMessages) {
  // ── Step 1: Identify product from keywords (no AI call) ──────────────────
  const requestedName = extractProductKeyword(
    typeof userText === "string" ? userText : "",
    historyMessages
  );

  // ── Step 2: Fetch product data from DB ───────────────────────────────────
  let dbContext = "No product data found for this query.";

  let sql = "SELECT name, base_price, description, is_renewable FROM products WHERE base_price > 0";
  let params = [];

  if (requestedName !== "") {
    sql += " AND name LIKE ?";
    params.push("%" + requestedName + "%");
  }

  const dbData = await queryDB(env, sql, params);

  if (dbData.success && dbData.results && dbData.results.length > 0) {
    dbContext = JSON.stringify(dbData.results);
  } else if (requestedName !== "") {
    // Fuzzy fallback: search by first word only (e.g., "ChatGPT" → "chatgpt 1 year personal")
    const baseWord = requestedName.split(" ")[0];
    const fallbackData = await queryDB(env,
      "SELECT name, base_price, description, is_renewable FROM products WHERE name LIKE ? AND base_price > 0",
      ["%" + baseWord + "%"]
    );

    if (fallbackData.success && fallbackData.results && fallbackData.results.length > 0) {
      dbContext = `REQUESTED_PLAN_NOT_FOUND|SIMILAR_PRODUCTS:${JSON.stringify(fallbackData.results)}`;
    }
  }

  // ── Step 3: Single AI call — reply grounded strictly in DB data ───────────
  const finalResponse = await executeWithFallback(env, {
    messages: [
      { role: "system", content: getSalesReplyPrompt(dbContext) },
      ...historyMessages,
      { role: "user", content: userText }
    ]
  });

  return extractTextResponse(finalResponse) || "Sorry, ekhon data ashtece na. Ektu por try koren!";
}
