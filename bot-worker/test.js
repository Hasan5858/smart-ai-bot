const url = "https://api.cerebras.ai/v1/chat/completions";
const key = "csk-238pxcvnkf4fcc94yryjh9cy6jwyh4m5tev8tkjyreexvrxj";
const requestBody = {
  model: "qwen-3-235b-a22b-instruct-2507",
  messages: [{role: "user", content: "hello"}],
  temperature: 0.7,
  max_completion_tokens: 1024,
  stream: false
};
fetch(url, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(requestBody)
}).then(res => res.json().then(data => console.log(res.status, data))).catch(console.error);
