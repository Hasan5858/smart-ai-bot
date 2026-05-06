/**
 * Telegram Helper — sends a message to a Telegram chat.
 */
export async function sendTelegramMessage(env, chatId, text, businessConnectionId = null) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload = { chat_id: chatId, text };
  if (businessConnectionId) {
    payload.business_connection_id = businessConnectionId;
  }
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}
