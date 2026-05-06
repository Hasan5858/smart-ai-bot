const url = "https://api.cerebras.ai/v1/chat/completions";
const key = "csk-238pxcvnkf4fcc94yryjh9cy6jwyh4m5tev8tkjyreexvrxj";
const tools = [
  {
    type: "function",
    function: {
      name: "get_prices",
      description: "Get the latest pricing...",
      parameters: {
        type: "object",
        properties: {
          platform_name: { type: "string" }
        }
      }
    }
  }
];

const requestBody1 = {
  model: "qwen-3-235b-a22b-instruct-2507",
  messages: [
    { role: "system", content: "Tumi ekjon polite OTT subscription sales assistant." },
    { role: "user", content: "Netflix er pricing ta diyen" }
  ],
  tools: tools,
  temperature: 0.7,
  max_completion_tokens: 1024,
  stream: false
};

const requestBody2 = {
  model: "qwen-3-235b-a22b-instruct-2507",
  messages: [
    { role: "system", content: "Tumi ekjon polite OTT subscription sales assistant. Use data: [...]" },
    { role: "user", content: "Netflix er pricing ta diyen" }
  ],
  temperature: 0.7,
  max_completion_tokens: 1024,
  stream: false
};

async function test() {
  const r1 = await fetch(url, { method: "POST", headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(requestBody1) });
  console.log("R1:", r1.status, await r1.json());
  const r2 = await fetch(url, { method: "POST", headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(requestBody2) });
  console.log("R2:", r2.status, await r2.json());
}
test().catch(console.error);
