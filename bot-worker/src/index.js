/**
 * Smart AI Bot — Bot Worker
 *
 * Architecture: Queue Cascade Provider Fallback
 * ─────────────────────────────────────────────
 * 1. Webhook receives message → save to DB → send to Queue (delay:2s) → return 200 OK
 * 2. Queue Consumer tries Provider[providerIdx] Key[keyIdx]
 *    ✅ Success → send reply to Telegram
 *    ❌ Fail    → re-queue with next keyIdx (or next providerIdx)
 * 3. Each queue invocation gets a FRESH 30s execution window → no more timeouts
 *
 * Tools available to AI:
 *   - get_otp           → fetches OTP from Household email worker
 *   - get_product_prices → fetches pricing from DB
 *   - transfer_to_agent  → hands conversation to human
 *
 * Queue Message Types:
 *   - { type: "ai_process", ... }  → main AI processing with cascade
 *   - (default / no type)          → OTP background polling
 */

import { queryDB } from "./lib/db.js";
import { sendTelegramMessage } from "./lib/telegram.js";
import {
  executeWithFallback,
  extractTextResponse,
  extractToolCalls,
  getActiveProviders,
  callSingleProvider
} from "./lib/ai.js";
import { getTelegramImageBase64 } from "./lib/get-image.js";

// ─── Tool Definitions ──────────────────────────────────────────────────────────

const botTools = [
  {
    type: "function",
    function: {
      name: "get_otp",
      description: "Fetches the latest OTP or verification code/link for a platform from the user's email inbox. Call this when user needs an OTP or verification code for a service they subscribe to.",
      parameters: {
        type: "object",
        properties: {
          platform_name: { type: "string", description: "Platform name e.g. ChatGPT, Netflix, Hoichoi" },
          account_email: { type: "string", description: "The subscription account email from the user's subscription data" }
        },
        required: ["platform_name", "account_email"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_product_prices",
      description: "Fetches available products and pricing/plans from the store. Call when user asks about buying something or product pricing.",
      parameters: {
        type: "object",
        properties: {
          platform_name: { type: "string", description: "Product name to search. Leave empty to fetch all products." }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "transfer_to_agent",
      description: "Transfers the conversation to a human agent. Call when: user explicitly asks for human/agent, mentions sending money/payment, or asks about Spotify/Google Storage without asking for pricing.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Brief reason for transfer" }
        }
      }
    }
  }
];

// ─── Tool Executor ─────────────────────────────────────────────────────────────

async function executeTool(env, toolName, args, chatId, businessConnectionId = null) {
  // ── get_otp ────────────────────────────────────────────────────────────────
  if (toolName === "get_otp") {
    const { platform_name, account_email } = args;
    if (!account_email) return "No email found for this subscription.";

    let checkEmail = account_email;

    const track = await queryDB(env, "SELECT * FROM active_otp_checks WHERE email = ?", [account_email]);
    if (track.success && track.results?.length > 0) {
      return "OTP check already running in background. Will notify you as soon as it arrives.";
    }

    const secret = env.HOUSEHOLD_AUTH_SECRET || "your-default-secret";
    try {
      const res = await fetch(`https://household.your-subdomain.workers.dev/get-link?mail=${encodeURIComponent(checkEmail)}&secret=${secret}`);
      const data = res.ok ? await res.json() : { success: false, results: [] };

      if (data.success && data.results?.length > 0) {
        const found = data.results.find(r => r.data?.trim());
        if (found) return `OTP found: ${found.data} (Type: ${found.type})`;
      }

      await queryDB(env, "INSERT INTO active_otp_checks (email, chat_id, platform_name) VALUES (?, ?, ?)", [account_email, chatId, platform_name]);
      await env.OTP_QUEUE.send(
        { chat_id: chatId, account_email, platform: platform_name, attempts_left: 5, business_connection_id: businessConnectionId },
        { delaySeconds: 60 }
      );
      return "No OTP in inbox yet. Background check started — will send directly to chat within 5 minutes when it arrives.";
    } catch (e) {
      console.error("get_otp tool error:", e);
      return "Could not check OTP at this moment. Please try again.";
    }
  }

  // ── get_product_prices ─────────────────────────────────────────────────────
  if (toolName === "get_product_prices") {
    const requestedName = (args.platform_name || "").trim();
    let sql = "SELECT name, base_price, description, is_renewable FROM products WHERE base_price > 0";
    let params = [];
    if (requestedName) { sql += " AND name LIKE ?"; params.push("%" + requestedName + "%"); }

    const db = await queryDB(env, sql, params);
    if (db.success && db.results?.length > 0) return JSON.stringify(db.results);

    if (requestedName) {
      const baseWord = requestedName.split(" ")[0];
      const fb = await queryDB(env,
        "SELECT name, base_price, description, is_renewable FROM products WHERE name LIKE ? AND base_price > 0",
        ["%" + baseWord + "%"]
      );
      if (fb.success && fb.results?.length > 0) return "Similar products: " + JSON.stringify(fb.results);
    }
    return "No product data found.";
  }

  return "Unknown tool.";
}

// ─── System Prompt Builder ─────────────────────────────────────────────────────

function buildSystemPrompt(userSubscriptions) {
  const todayStr = new Date().toISOString().split("T")[0];
  const subJson = userSubscriptions.length === 0
    ? "[]"
    : JSON.stringify(
      userSubscriptions.map(s => ({
        product: s.product_name,
        status: s.expiry_date < todayStr ? "expired" : s.status,
        expiry: s.expiry_date,
        email: s.account_username || null,
        password: s.account_password || null,
        profile: s.profile_name || null,
        pin: s.profile_pin || null
      }))
    );

  return `You are a support assistant for a digital subscription service. Reply in Banglish (Bengali written in English letters). Be short, friendly, conversational — like person-to-person chat.

User's subscriptions (JSON):
${subJson}

Instructions:
- For credential/password/account requests: use the subscription JSON above directly. Never make up credentials.
- Use get_otp tool when user needs OTP or verification code for a subscribed service.
- Use get_product_prices tool when user asks about pricing or wants to buy.
- Use transfer_to_agent when user mentions sending payment (bkash/nagad/taka) or asks for a human agent.
- If user asks what subscriptions they have: list ALL from the JSON above.
- Keep replies short. No long paragraphs.
- NEVER use template placeholders. Tell the user to wait if the background OTP check started.
- STRICT RULE: Answer ONLY using provided JSON and tool results. NEVER guess or use external knowledge.
- For Spotify and Google Storage: If the user talks about "Spotify" or "Google Storage" and does NOT explicitly ask for its price, immediately use transfer_to_agent. Say: "এসকল বিষয়ে বিস্তারিত জানতে আমি একজন হিউম্যান এজেন্টকে যুক্ত করতে পারি। আপনি কি হিউম্যান এজেন্টের সাথে কথা বলতে চান?"
- For out-of-scope questions, apologize and use transfer_to_agent tool.
- Never use 🙏 emoji. Address user respectfully using "apnar".`;
}

// ─── Single Provider AI Runner ─────────────────────────────────────────────────
// Tries ONE specific provider+key. Throws on first-call failure (caller re-queues).
// Handles tool execution + second AI call internally.

async function runWithProvider(env, provider, apiKey, userText, historyMessages, chatId, userSubscriptions, businessConnectionId = null) {
  const systemPrompt = buildSystemPrompt(userSubscriptions);

  // First AI call
  const firstResponse = await callSingleProvider(env, provider, apiKey, {
    messages: [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: userText }
    ],
    tools: botTools
  });

  const toolCalls = extractToolCalls(firstResponse);

  // No tool call → direct reply
  if (!toolCalls || toolCalls.length === 0) {
    return { reply: extractTextResponse(firstResponse), agentTransfer: false };
  }

  // Execute tools
  let agentTransfer = false;
  const assistantMsg = firstResponse.choices?.[0]?.message
    ?? { role: "assistant", content: null, tool_calls: toolCalls };
  const toolResultMessages = [assistantMsg];

  for (const tc of toolCalls) {
    const toolName = tc.function?.name || tc.name;
    let args = tc.function?.arguments || tc.arguments || {};
    if (typeof args === "string") { try { args = JSON.parse(args); } catch (e) { args = {}; } }

    let result;
    if (toolName === "transfer_to_agent") {
      agentTransfer = true;
      result = "Transfer initiated. Inform the user you are connecting them to a human agent right now.";
    } else {
      result = await executeTool(env, toolName, args, chatId, businessConnectionId);
    }
    toolResultMessages.push({ role: "tool", tool_call_id: tc.id || "0", content: String(result) });
  }

  // Second AI call with tool results — use same provider
  // If this fails, log and return fallback message (tools already executed, can't undo)
  try {
    const finalResponse = await callSingleProvider(env, provider, apiKey, {
      messages: [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        { role: "user", content: userText },
        ...toolResultMessages
      ]
    });
    return { reply: extractTextResponse(finalResponse), agentTransfer };
  } catch (err) {
    console.error("Second AI call failed (tool results):", err.message);
    // Tools were already executed; just return a fallback
    return { reply: "Kaj hoise, kintu response generate korte ektu somosya hoise. Ektu por message korun.", agentTransfer };
  }
}

// ─── Helpers: Fetch History & Subscriptions ───────────────────────────────────

async function fetchHistory(env, chatId) {
  try {
    const histData = await queryDB(env,
      "SELECT role, content FROM (SELECT * FROM chat_history WHERE chat_id = ? ORDER BY id DESC LIMIT 10) ORDER BY id ASC",
      [chatId]
    );
    if (!histData.success || !histData.results) return [];

    const messages = histData.results.map(r => {
      let content = r.content;
      if (typeof content === "string" && content.startsWith("[")) {
        try { content = JSON.parse(content); } catch (e) { }
      }
      return { role: r.role, content };
    });

    // Remove last user message (will be passed separately as current message)
    if (messages.length > 0 && messages[messages.length - 1].role === "user") {
      messages.pop();
    }
    return messages;
  } catch (e) {
    console.error("History fetch error:", e);
    return [];
  }
}

async function fetchSubscriptions(env, chatId) {
  try {
    const subRes = await queryDB(env, `
      SELECT
        p.name AS product_name,
        s.status, s.expiry_date, s.profile_name, s.profile_pin,
        a.account_username, a.account_password
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      JOIN products p ON s.product_id = p.id
      LEFT JOIN accounts a ON s.account_id = a.id
      WHERE u.telegram_id = ?
      ORDER BY s.status ASC, s.id DESC
    `, [chatId]);
    return subRes.results || [];
  } catch (e) {
    console.error("Subscription fetch error:", e);
    return [];
  }
}

// ─── Queue Consumer: AI Processing (Cascade) ──────────────────────────────────

async function processAiQueueMessage(msg, env) {
  const { chatId, userTextJson, businessConnectionId, newMsgId, providerIdx, keyIdx } = msg.body;
  const userText = userTextJson; // always a plain string

  // Debounce: is this still the latest user message?
  try {
    const maxRes = await queryDB(env,
      "SELECT MAX(id) as max_id FROM chat_history WHERE chat_id = ? AND role = 'user'",
      [chatId]
    );
    if (maxRes.success && maxRes.results?.length > 0 && newMsgId !== 0) {
      if (maxRes.results[0].max_id !== newMsgId) {
        console.log(`AI Queue: debounced (latest: ${maxRes.results[0].max_id}, this: ${newMsgId})`);
        msg.ack();
        return;
      }
    }
  } catch (e) { }

  // Human/mute mode check
  try {
    const userState = await queryDB(env, "SELECT chat_mode, mute_until FROM users WHERE telegram_id = ?", [chatId]);
    if (userState.success && userState.results?.length > 0) {
      const { chat_mode, mute_until } = userState.results[0];
      if (chat_mode === "human") {
        if (!mute_until || mute_until === 0 || Date.now() < mute_until) {
          msg.ack();
          return;
        }
        await queryDB(env, "UPDATE users SET chat_mode = 'ai', mute_until = 0 WHERE telegram_id = ?", [chatId]);
      }
    }
  } catch (e) { }

  // Load active providers
  const providers = await getActiveProviders(env);

  // All providers exhausted → send error and stop
  if (providerIdx >= providers.length) {
    console.error(`AI Queue: All providers exhausted for chat ${chatId}`);
    await sendTelegramMessage(env, chatId, "Sorry, ekhon service temporarily unavailable. Ektu por try koren. 🙏", businessConnectionId);
    msg.ack();
    return;
  }

  const provider = providers[providerIdx];
  const keys = provider.is_cloudflare === 1
    ? [null]
    : (provider.api_key || "").split(",").map(k => k.trim()).filter(Boolean);

  // Current key index exceeds this provider's keys → move to next provider
  if (keyIdx >= keys.length) {
    await env.OTP_QUEUE.send({
      type: "ai_process",
      chatId, userTextJson, businessConnectionId, newMsgId,
      providerIdx: providerIdx + 1, keyIdx: 0
    });
    msg.ack();
    return;
  }

  // Fetch context fresh from DB
  const [historyMessages, userSubscriptions] = await Promise.all([
    fetchHistory(env, chatId),
    fetchSubscriptions(env, chatId)
  ]);

  // Try this specific provider + key
  try {
    const { reply, agentTransfer } = await runWithProvider(
      env, provider, keys[keyIdx], userText, historyMessages, chatId, userSubscriptions, businessConnectionId
    );

    if (!reply) { msg.ack(); return; }

    if (agentTransfer) {
      await queryDB(env, "UPDATE users SET chat_mode = 'human', mute_until = ? WHERE telegram_id = ?",
        [Date.now() + 3_600_000, chatId]);
    }

    console.log(`[AI Queue] ✅ ${provider.provider_name} Key ${keyIdx + 1}`);
    await queryDB(env, "INSERT INTO chat_history (chat_id, role, content) VALUES (?, 'assistant', ?)", [chatId, reply]);
    await sendTelegramMessage(env, chatId, reply, businessConnectionId);
    msg.ack();

  } catch (err) {
    console.error(`[AI Queue] ❌ ${provider.provider_name} Key ${keyIdx + 1} failed:`, err.message);

    // Try next key or next provider
    const nextKeyIdx = keyIdx + 1;
    if (nextKeyIdx < keys.length) {
      await env.OTP_QUEUE.send({
        type: "ai_process",
        chatId, userTextJson, businessConnectionId, newMsgId,
        providerIdx, keyIdx: nextKeyIdx
      });
    } else {
      await env.OTP_QUEUE.send({
        type: "ai_process",
        chatId, userTextJson, businessConnectionId, newMsgId,
        providerIdx: providerIdx + 1, keyIdx: 0
      });
    }
    msg.ack(); // Ack so Cloudflare doesn't auto-retry; we manually re-queued
  }
}

// ─── Queue Consumer: OTP Background Poller ────────────────────────────────────

async function processOtpQueueMessage(msg, env) {
  const { chat_id, account_email, platform, attempts_left, business_connection_id = null } = msg.body;
  const secret = env.HOUSEHOLD_AUTH_SECRET || "your-default-secret";

  let checkEmail = account_email;

  try {
    const res = await fetch(`https://household.your-subdomain.workers.dev/get-link?mail=${encodeURIComponent(checkEmail)}&secret=${secret}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.results?.length > 0) {
        const found = data.results.find(r => r.data?.trim());
        if (found) {
          // Use sendTelegramMessage to respect business_connection_id
          await sendTelegramMessage(
            env,
            chat_id,
            `🎉 আপনার ${platform} এর নতুন OTP/Link চলে এসেছে:\n\n👉 **${found.data}**`,
            business_connection_id
          );
          await queryDB(env, "DELETE FROM active_otp_checks WHERE email = ?", [account_email]);
          msg.ack();
          return;
        }
      }
    }

    if (attempts_left > 0) {
      await env.OTP_QUEUE.send(
        { chat_id, account_email, platform, attempts_left: attempts_left - 1, business_connection_id },
        { delaySeconds: 60 }
      );
      msg.ack();
    } else {
      await sendTelegramMessage(
        env,
        chat_id,
        `দুঃখিত, ১০ মিনিট অপেক্ষার পরও ${platform} এর কোনো নতুন OTP আসেনি। আপনি পুনরায় চেষ্টা করতে পারেন।`,
        business_connection_id
      );
      await queryDB(env, "DELETE FROM active_otp_checks WHERE email = ?", [account_email]);
      msg.ack();
    }
  } catch (error) {
    console.error("OTP Queue process error:", error);
    msg.retry();
  }
}

// ─── Auto User Registration ───────────────────────────────────────────────────

async function registerUser(env, from) {
  if (!from || !from.id) return;
  try {
    const name = [from.first_name, from.last_name].filter(Boolean).join(" ") || null;
    const username = from.username || null;

    const exactMatch = await queryDB(env, "SELECT id FROM users WHERE telegram_id = ?", [from.id]);
    const isAlreadyLinked = exactMatch.success && exactMatch.results?.length > 0;

    if (!isAlreadyLinked) {
      let linked = false;
      if (username) {
        const byUser = await queryDB(env, "SELECT id FROM users WHERE telegram_username = ? COLLATE NOCASE", [username]);
        if (byUser.success && byUser.results?.length > 0) {
          try {
            await queryDB(env, "UPDATE users SET telegram_id = ?, telegram_name = ? WHERE id = ?", [from.id, name, byUser.results[0].id]);
            linked = true;
          } catch (e) { }
        }
      }
      if (!linked && name) {
        const byName = await queryDB(env, "SELECT id FROM users WHERE telegram_name = ? COLLATE NOCASE AND telegram_username IS NULL", [name]);
        if (byName.success && byName.results?.length > 0) {
          try {
            await queryDB(env, "UPDATE users SET telegram_id = ?, telegram_username = ? WHERE id = ?", [from.id, username, byName.results[0].id]);
            linked = true;
          } catch (e) { }
        }
      }
      if (linked) return;
    }

    await queryDB(env,
      `INSERT INTO users (telegram_id, telegram_username, telegram_name)
       VALUES (?, ?, ?)
       ON CONFLICT(telegram_id) DO UPDATE SET
         telegram_username = excluded.telegram_username,
         telegram_name = COALESCE(users.telegram_name, excluded.telegram_name)`,
      [from.id, username, name]
    );
  } catch (e) {
    console.error("User registration error:", e);
  }
}

// ─── Subscription Reminders (Cron) ────────────────────────────────────────────

async function sendExpiryReminders(env, daysAhead) {
  const reminderType = `${daysAhead}_days`;
  const sql = `
    SELECT s.id AS sub_id, s.expiry_date, p.name AS product_name, u.telegram_id
    FROM subscriptions s
    JOIN users u  ON u.id = s.user_id
    JOIN products p ON p.id = s.product_id
    LEFT JOIN reminder_log rl ON rl.subscription_id = s.id AND rl.reminder_type = ?
    WHERE s.status = 'active' AND rl.id IS NULL
      AND DATE(s.expiry_date) = DATE('now', '+' || ? || ' days')
  `;
  const data = await queryDB(env, sql, [reminderType, daysAhead]);
  if (!data.success || !data.results?.length) return;

  for (const row of data.results) {
    const emoji = daysAhead === 1 ? "🚨" : "⏰";
    const msg = daysAhead === 1
      ? `${emoji} *Urgent Reminder!*\n\nApnar *${row.product_name}* subscription kal expire hobe!\n\nRenew korte din, nahle access bondo hoye jabe.`
      : `${emoji} *Subscription Expiry Reminder*\n\nApnar *${row.product_name}* subscription-er meyad ${daysAhead} dine shesh hobe.\n\nSamoy thakte renew korun! 😊`;
    try {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: row.telegram_id, text: msg, parse_mode: "Markdown" })
      });
      await queryDB(env, "INSERT INTO reminder_log (subscription_id, reminder_type) VALUES (?, ?)", [row.sub_id, reminderType]);
    } catch (e) {
      console.error(`Reminder error for sub_id=${row.sub_id}:`, e);
    }
  }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default {
  // ── Queue Handler ────────────────────────────────────────────────────────
  async queue(batch, env, ctx) {
    for (const message of batch.messages) {
      if (message.body?.type === "ai_process") {
        await processAiQueueMessage(message, env);
      } else {
        await processOtpQueueMessage(message, env);
      }
    }
  },

  // ── Webhook Handler ──────────────────────────────────────────────────────
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      const url = new URL(request.url);
      if (url.pathname === "/setup") {
        const tgRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: "https://bot-worker.your-subdomain.workers.dev",
            allowed_updates: ["message", "business_message", "business_connection", "callback_query"]
          })
        });
        return new Response(JSON.stringify(await tgRes.json()), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("Smart AI Bot Worker is active.", { status: 200 });
    }

    let update;
    try {
      update = await request.json();

      const message = update.message || update.business_message;
      if (!message) return new Response("OK", { status: 200 });

      const businessConnectionId = update.business_connection?.id || message.business_connection_id || null;
      const textMessage = message.text || message.caption || "";
      const hasPhoto = message.photo?.length > 0;

      if (!textMessage && !hasPhoto) return new Response("OK", { status: 200 });

      const chatId = message.chat.id;
      const from = message.from;

      // ── Handle outgoing messages (agent replies) ────────────────────────
      const ownerTelegramId = env.OWNER_TELEGRAM_ID ? parseInt(env.OWNER_TELEGRAM_ID) : null;
      const isOutgoing = !!(message.is_outgoing)
        || (ownerTelegramId && from?.id === ownerTelegramId)
        || !!(message.business_connection_id && from && message.chat && from.id !== message.chat.id);

      if (isOutgoing || chatId !== from?.id) {
        if (isOutgoing) {
          try {
            const dbAgentText = typeof textMessage === "string" ? textMessage : JSON.stringify(textMessage);
            await queryDB(env, "INSERT INTO chat_history (chat_id, role, content) VALUES (?, 'assistant', ?)", [chatId, dbAgentText]);
            const pauseUntilMs = Date.now() + (20 * 60 * 1000);
            const customerName = message.chat ? `${message.chat.first_name || ""} ${message.chat.last_name || ""}`.trim() : "Unknown";
            await queryDB(env, "INSERT OR IGNORE INTO users (telegram_id, telegram_name, chat_mode, mute_until) VALUES (?, ?, 'human', ?)", [chatId, customerName, pauseUntilMs]);
            await queryDB(env, "UPDATE users SET chat_mode = 'human', mute_until = ? WHERE telegram_id = ?", [pauseUntilMs, chatId]);
          } catch (e) { console.error("Agent save error:", e); }
        }
        return new Response("OK", { status: 200 });
      }

      if (!env.TELEGRAM_BOT_TOKEN) return new Response("Error: no token", { status: 500 });

      // ── Build userText (process image if present) ───────────────────────
      let userText = textMessage;

      if (hasPhoto) {
        try {
          const photo = message.photo[message.photo.length - 1];
          const base64Url = await getTelegramImageBase64(env, photo.file_id);
          const imageObj = { type: "image_url", image_url: { url: base64Url } };

          // Fast vision classification (uses executeWithFallback internally — quick)
          const fastVision = await executeWithFallback(env, {
            messages: [
              { role: "system", content: "Analyze this image.\n1. OTP/verification screen → reply EXACTLY: 'OTP:<PlatformName>'\n2. Account error/locked/expired → reply EXACTLY: 'ERROR:<PlatformName>:<ShortSummary>'\n3. Payment receipt (bKash/Nagad/Bank) → reply EXACTLY: 'PAYMENT_RECEIPT'\n4. TV link code (6-digit, Amazon/Netflix TV) → reply EXACTLY: 'TV_CODE:<PlatformName>'\n5. Anything else → reply: 'OTHER'" },
              { role: "user", content: [imageObj] }
            ]
          });
          const visionResult = (extractTextResponse(fastVision) || "").trim();

          if (visionResult.startsWith("OTP:")) {
            const platform = visionResult.split(":")[1]?.trim();
            if (!platform || platform === "UNKNOWN") {
              userText = "User uploaded an OTP/verification screenshot but platform is unclear. Please ask which service OTP is needed for.";
            } else {
              ctx.waitUntil(fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, text: `${platform} er verification screen dekhte pacchi. OTP check korchi, ektu opekkha korun...` })
              }));
              userText = `User uploaded a ${platform} verification screenshot. Use get_otp tool to fetch OTP for ${platform}.`;
            }
          } else if (visionResult.startsWith("ERROR:")) {
            const parts = visionResult.split(":");
            userText = `User uploaded an error/lockout screenshot for ${parts[1]?.trim() || "a service"} (${parts[2]?.trim() || "error"}). Use transfer_to_agent tool.`;
          } else if (visionResult === "PAYMENT_RECEIPT") {
            userText = "User uploaded a payment receipt. Use transfer_to_agent tool to verify payment.";
          } else if (visionResult.startsWith("TV_CODE:")) {
            userText = `User uploaded a TV Link Code for ${visionResult.split(":")[1]?.trim()}. Use transfer_to_agent tool to link the TV.`;
          } else {
            userText = textMessage || "User sent an image.";
          }
          // Note: userText is now always a plain string — safe for queue message payload
        } catch (err) {
          console.error("Image processing error:", err);
          userText = textMessage || "User sent an image that could not be processed.";
        }
      }

      // ── Auto-register user ──────────────────────────────────────────────
      ctx.waitUntil(registerUser(env, from));

      // ── Save user message → get newMsgId for debounce ──────────────────
      let newMsgId = 0;
      try {
        const insertRes = await queryDB(env,
          "INSERT INTO chat_history (chat_id, role, content) VALUES (?, 'user', ?) RETURNING id",
          [chatId, typeof userText === "string" ? userText : JSON.stringify(userText)]
        );
        if (insertRes.success && insertRes.results?.length > 0) {
          newMsgId = insertRes.results[0].id;
        }
      } catch (e) { console.error("User msg save error:", e); }

      // ── Human/mute mode check ───────────────────────────────────────────
      try {
        const userState = await queryDB(env, "SELECT chat_mode, mute_until FROM users WHERE telegram_id = ?", [from.id]);
        if (userState.success && userState.results?.length > 0) {
          const { chat_mode, mute_until } = userState.results[0];
          if (chat_mode === "human") {
            if (!mute_until || mute_until === 0 || Date.now() < mute_until) {
              return new Response("OK", { status: 200 });
            }
            await queryDB(env, "UPDATE users SET chat_mode = 'ai', mute_until = 0 WHERE telegram_id = ?", [from.id]);
          }
        }
      } catch (e) { }

      // ── Queue AI processing (2s debounce delay) ─────────────────────────
      // Each queue invocation gets a FRESH 30s execution window → no more timeouts!
      await env.OTP_QUEUE.send({
        type: "ai_process",
        chatId,
        userTextJson: typeof userText === "string" ? userText : (textMessage || "User sent an image."),
        businessConnectionId,
        newMsgId,
        providerIdx: 0,
        keyIdx: 0
      }, { delaySeconds: 2 });

      return new Response("OK", { status: 200 });

    } catch (err) {
      console.error("Fetch handler error:", err);
      return new Response("OK", { status: 200 });
    }
  },

  // Cron: 03:00 UTC = 09:00 AM BD
  async scheduled(event, env, ctx) {
    console.log(`Cron triggered: ${event.cron}`);
    ctx.waitUntil(Promise.all([
      sendExpiryReminders(env, 7),
      sendExpiryReminders(env, 1)
    ]));
  }
};
