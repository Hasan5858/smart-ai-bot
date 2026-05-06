import { queryDB } from "./db.js";

/**
 * Extracts tool_calls from both Cloudflare Workers AI format and OpenAI-compatible format.
 */
export function extractToolCalls(aiResponse) {
  if (aiResponse.tool_calls?.length > 0) return aiResponse.tool_calls;
  const choiceToolCalls = aiResponse.choices?.[0]?.message?.tool_calls;
  if (choiceToolCalls?.length > 0) return choiceToolCalls;
  return null;
}

/**
 * Extracts text content from both Cloudflare Workers AI format and OpenAI-compatible format.
 * Also strips <thought>...</thought> reasoning tags (used by some models like Gemma 4).
 */
export function extractTextResponse(aiResponse) {
  const raw = aiResponse.response || aiResponse.choices?.[0]?.message?.content || null;
  if (!raw) return null;
  return raw.replace(/<thought>[\s\S]*?<\/thought>/gi, "").trim();
}

/**
 * Fetches all active AI providers from the database, sorted by priority.
 */
export async function getActiveProviders(env) {
  const res = await queryDB(env,
    "SELECT provider_name, model_id, api_url, api_key, is_cloudflare FROM ai_providers WHERE is_active = 1 ORDER BY priority ASC, id ASC"
  );
  return res.results || [];
}

/**
 * Calls a SINGLE provider with a SINGLE API key.
 * Throws on failure so the caller can handle fallback logic.
 */
export async function callSingleProvider(env, provider, apiKey, options) {
  if (provider.is_cloudflare === 1) {
    try {
      return await env.AI.run(provider.model_id, {
        messages: options.messages,
        tools: options.tools
      });
    } catch (err) {
      throw new Error(`Cloudflare Native: ${err.message}`);
    }
  }

  const requestBody = {
    model: provider.model_id,
    messages: options.messages,
    temperature: 0.7,
    max_completion_tokens: 1024,
    stream: false
  };
  if (options.tools) requestBody.tools = options.tools;

  const response = await fetch(provider.api_url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || response.statusText);
  return data;
}

/**
 * Executes an AI call with automatic fallback through ALL active providers/keys.
 * Used for fast operations like image classification where queue cascade is not needed.
 */
export async function executeWithFallback(env, options) {
  const providers = await getActiveProviders(env);
  if (providers.length === 0) throw new Error("No active AI providers found in the database.");

  let lastError = null;

  for (const provider of providers) {
    if (provider.is_cloudflare === 1) {
      try {
        return await env.AI.run(provider.model_id, { messages: options.messages, tools: options.tools });
      } catch (err) {
        console.error(`Cloudflare Native failed:`, err.message);
        lastError = err;
        continue;
      }
    }

    const keys = (provider.api_key || "").split(",").map(k => k.trim()).filter(Boolean);
    if (keys.length === 0) continue;

    for (let i = 0; i < keys.length; i++) {
      try {
        const result = await callSingleProvider(env, provider, keys[i], options);
        console.log(`[AI] Success: ${provider.provider_name} Key ${i + 1}`);
        return result;
      } catch (err) {
        console.error(`[${provider.provider_name}] Key ${i + 1} failed:`, err.message);
        lastError = err;
      }
    }
  }

  throw new Error(`All AI providers failed. Last error: ${lastError?.message}`);
}
