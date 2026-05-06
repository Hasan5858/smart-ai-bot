import { executeWithFallback, extractTextResponse } from "../lib/ai.js";
import { queryDB } from "../lib/db.js";

// ─── Keyword-based Platform Detector ──────────────────────────────────────────
// Replaces AI tool call — detects which platform user is referring to.
function detectPlatform(text) {
  if (!text || typeof text !== "string") return "";
  const t = text.toLowerCase();
  if (/chat\s*gpt|openai/.test(t)) return "ChatGPT";
  if (/netflix/.test(t)) return "Netflix";
  if (/\bprime\b|amazon\s*prime|prime\s*video/.test(t)) return "Prime Video";
  if (/hoichoi/.test(t)) return "Hoichoi";
  if (/grammarly/.test(t)) return "Grammarly";
  if (/perplexity/.test(t)) return "Perplexity";
  if (/sony\s*liv|sonyliv/.test(t)) return "SonyLIV";
  if (/zee\s*5/.test(t)) return "ZEE5";
  if (/surfshark/.test(t)) return "Surfshark";
  if (/\bvpn\b/.test(t)) return "VPN";
  if (/canva/.test(t)) return "Canva";
  if (/spotify/.test(t)) return "Spotify";
  if (/youtube/.test(t)) return "YouTube";
  if (/\bamazon\b/.test(t)) return "Prime Video"; // "amazon" alone → Prime Video
  return "";
}

// ─── Detect OTP Permission Ask ────────────────────────────────────────────────
// e.g. "pathabo?", "send korbo?", "pathai?" — user is ASKING if they should send OTP
function isAskingOtpPermission(text) {
  if (!text || typeof text !== "string") return false;
  return /(pathabo\??|pathai\??|send\s*korbo\??|korbo\??|dibo\??|lagbe.*pathabo|code.*pathabo|otp.*pathabo|otp.*send|send.*otp|pari\??)/i.test(text);
}

// ─── Support Reply Prompt ──────────────────────────────────────────────────────
function getSupportPrompt(dbContext) {
  return `You are a support assistant. Reply ONLY using the User Subscription Data below.

=== USER SUBSCRIPTION DATA ===
${dbContext}
=== END OF DATA ===

STRICT RULES:
1. If the data says "No subscription found", tell the user politely that they do not have an active subscription for this product.
2. If the data says "Subscription is EXPIRED or INACTIVE", tell the user their subscription has expired or is inactive, so you cannot provide new credentials. Ask them to renew. If they ask HOW to renew or pay, you MUST say exactly: "এসকল বিষয়ে আমার কাছে তথ্য নেই। আপনি চাইলে আমি একজন হিউম্যান এজেন্টকে যুক্ত করতে পারি। আপনি কি হিউম্যান এজেন্টের সাথে কথা বলতে চান?"
3. IF the user asks for a password/OTP/fix but does NOT name a specific product, AND the data contains MULTIPLE different products: DO NOT share any passwords. Instead, list their products and ask them politely which product's password they need.
4. If the user asks for a password/OTP/fix for a specific product (or if they only have 1 product), you MUST immediately share the active credentials (ID, Password, Profile, PIN) directly. NEVER ask "Do you want credentials?".
5. If OTP_Data contains a recent OTP/Link, share it directly. If it says "No OTP arrived yet" or "checking in background", tell the user you are waiting for the OTP and will notify them as soon as it arrives. IMPORTANT: If you are waiting for the OTP, DO NOT ask if the login was successful!
6. PERMISSION RULE (CRITICAL): If the user is asking permission to send an OTP (e.g. "OTP lagbe, send korbo?", "Code pathabo?", "Pathai?"), do NOT say you are waiting for the OTP. Instead, tell them directly: "Ji, apnar OTP lagle send korte paren. Send korar por amake janaben."
7. OTP ACKNOWLEDGEMENT RULE (CRITICAL): ONLY IF the user explicitly confirms they HAVE ALREADY ENTERED the OTP (e.g., "Otp pathaici", "Code disi") AND OTP_Data is NOT checking in background, THEN acknowledge it and ask if login was successful (e.g., "Bhalo! Login ki successful hoise? 😊"). Do NOT apply this if they ask a question like "send korbo?" or "pathabo?", or if you are still waiting for the OTP.
8. If the user just asked "what subscriptions do I have?" without stating an issue, list their active subscriptions and ask if they need credentials.
9. Keep the response polite and in Banglish. IMPORTANT: Review the chat history. If there are past 'assistant' messages (written by the human agent), perfectly mimic their sentence structure, tone, and Banglish spelling style. Keep it fully natural.
10. Do NOT make up any passwords or IDs. Only use what is provided in the data.
11. Address the user with respect (use 'apnar', not 'tui' or 'tumi').
12. NEVER use the folded hands / praying emoji (🙏) under any circumstance. Use other emojis if needed.
13. CONTEXT AWARENESS: Always read the full chat history before replying. If the conversation clearly shows an ongoing support session for a specific product, keep the reply in that context. Never restart the conversation.`;
}

// ─── Main Handler ──────────────────────────────────────────────────────────────
export async function handleSupportRequest(env, userText, historyMessages, chatId, userSubscriptions = []) {
  const userTextStr = typeof userText === "string" ? userText.toLowerCase() : "";

  // ── Step 1: Keyword detection (replaces AI tool call) ─────────────────────
  // Detect platform from current message
  let requestedPlatform = detectPlatform(typeof userText === "string" ? userText : "");

  // Only scan history for platform context when it's a SHORT follow-up message (≤20 chars)
  // e.g. "done", "hoise?", "login hoise?" — NOT for general queries like "ki ki subs ache?"
  const isShortFollowup = typeof userText === "string" && userText.trim().length <= 20;
  if (!requestedPlatform && isShortFollowup && historyMessages.length > 0) {
    const recentAssistant = historyMessages
      .slice(-6)
      .filter(m => m.role === "assistant") // Only assistant messages carry product context
      .map(m => (typeof m.content === "string" ? m.content : ""))
      .join(" ");
    requestedPlatform = detectPlatform(recentAssistant);
  }

  const askingPermission = isAskingOtpPermission(typeof userText === "string" ? userText : "");
  const isOtpRelated = /(otp|code|verify|verification|link|authentication)/i.test(userTextStr);

  // ── Step 2: Get subscription data ─────────────────────────────────────────
  let results = userSubscriptions.length > 0 ? [...userSubscriptions] : [];

  // Fallback to DB if pre-fetched data is empty
  if (results.length === 0) {
    const res = await queryDB(env, `
      SELECT
        s.status, s.expiry_date, s.profile_name, s.profile_pin,
        p.name AS product_name,
        a.account_username, a.account_password
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      JOIN products p ON s.product_id = p.id
      LEFT JOIN accounts a ON s.account_id = a.id
      WHERE u.telegram_id = ?
      ORDER BY s.id DESC
    `, [chatId]);
    results = res.results || [];
  }

  let dbContext = "No subscription found.";

  if (results.length > 0) {
    const todayStr = new Date().toISOString().split("T")[0];

    // ✅ Always send ALL subscriptions to AI — let the AI decide what's relevant.
    // Worker only uses requestedPlatform for OTP fetching & queue decisions, NOT for filtering.
    const contextLines = await Promise.all(results.map(async sub => {
      const isExpired = sub.expiry_date < todayStr;

      if (sub.status !== "active" || isExpired) {
        return `Product: ${sub.product_name} | Status: ${sub.status} | Is Expired: ${isExpired ? "Yes" : "No"} | Result: Subscription is EXPIRED/INACTIVE. No credentials.`;
      }

      // Unassigned account check — handover to human
      if (requestedPlatform && sub.product_name && sub.product_name.toLowerCase().includes(requestedPlatform.toLowerCase())
        && (!sub.account_password || sub.account_password.trim() === "" || sub.account_password === "-")) {
        return "!!!HANDOVER_UNASSIGNED!!!";
      }

      let otpInfo = "No recent OTP/Link.";

      // Only fetch OTP for the platform the user is explicitly asking about.
      // If no platform specified (general query), skip OTP fetch for all.
      const isMatchingPlatform = requestedPlatform && sub.product_name &&
        sub.product_name.toLowerCase().includes(requestedPlatform.toLowerCase());

      if (sub.account_username && sub.account_username.includes("@") && isMatchingPlatform) {
        try {
          // Spam check: already polling in background?
          const trackCheck = await queryDB(env, "SELECT * FROM active_otp_checks WHERE email = ?", [sub.account_username]);
          if (trackCheck.success && trackCheck.results && trackCheck.results.length > 0) {
            otpInfo = "Already checking OTP in background... Please wait for a few minutes.";
          } else if (!askingPermission) {
            // Email mapping for forwarded accounts
            let checkEmail = String(sub.account_username);

            // Fetch from Household API
            const secret = env.HOUSEHOLD_AUTH_SECRET || "your-default-secret";
            const res = await fetch(`https://household.your-subdomain.workers.dev/get-link?mail=${encodeURIComponent(checkEmail)}&secret=${secret}`);
            const data = res.ok ? await res.json() : { success: false, results: [] };

            // Queue background OTP polling if OTP-related but nothing found yet
            const shouldQueue = isOtpRelated && (!data.success || !data.results || data.results.length === 0);

            if (shouldQueue) {
              try {
                await queryDB(env, "INSERT INTO active_otp_checks (email, chat_id, platform_name) VALUES (?, ?, ?)", [sub.account_username, chatId, requestedPlatform]);
                await env.OTP_QUEUE.send({
                  chat_id: chatId,
                  account_email: sub.account_username,
                  platform: requestedPlatform,
                  attempts_left: 5
                }, { delaySeconds: 60 });
                otpInfo = "No OTP arrived yet. I will check in the background for the next 5 minutes and notify you directly in chat as soon as it arrives! Please don't ask again.";
              } catch (qe) {
                console.error("Queue start error", qe);
              }
            }

            // Use pre-extracted OTP data if available
            if (data.success && data.results && data.results.length > 0 && !otpInfo.startsWith("No OTP arrived")) {
              const found = data.results.find(r => r.data && r.data.trim() !== "");
              if (found) {
                otpInfo = `Recent ${found.type}: ${found.data}`;
              }
            }
          }
        } catch (e) {
          console.error("Household API fetch error:", e);
        }
      }

      return `Product: ${sub.product_name} | Status: Active | Expiry: ${sub.expiry_date} | Email/ID: ${sub.account_username || "N/A"} | Password: ${sub.account_password || "N/A"} | Profile: ${sub.profile_name || "N/A"} | PIN: ${sub.profile_pin || "N/A"} | OTP_Data: ${otpInfo}`;
    }));

    // Unassigned account → hand over to human agent
    if (contextLines.includes("!!!HANDOVER_UNASSIGNED!!!")) {
      await queryDB(env, "UPDATE users SET chat_mode = 'human' WHERE telegram_id = ?", [chatId]);
      return "আপনার সাবস্ক্রিপশনটি অ্যাক্টিভ আছে, কিন্তু অ্যাকাউন্টের ডিটেইলস এখনো অ্যাসাইন করা হয়নি। আমি আপনাকে একজন হিউম্যান এজেন্টের কাছে কানেক্ট করে দিচ্ছি। দয়া করে একটু অপেক্ষা করুন।";
    }

    dbContext = contextLines.join("\n\n");
  }

  // ── Step 4: Single AI call — just formats and replies ─────────────────────
  const finalResponse = await executeWithFallback(env, {
    messages: [
      { role: "system", content: getSupportPrompt(dbContext) },
      ...historyMessages,
      { role: "user", content: userText }
    ]
  });

  return extractTextResponse(finalResponse) || "Sorry, check korte problem hocche. Ektu pore try koren.";
}
