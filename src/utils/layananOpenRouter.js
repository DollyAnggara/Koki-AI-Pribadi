// src/utils/layananOpenRouter.js
require("dotenv").config();
const API_KEY = process.env.OPENROUTER_API_KEY;
const API_URL =
  process.env.OPENROUTER_API_URL ||
  "https://api.openrouter.ai/v1/chat/completions";
let _fetch =
  global.fetch ||
  (() => {
    try {
      return require("node-fetch");
    } catch (e) {
      return null;
    }
  })();

async function panggilOpenRouter(
  prompt,
  {
    model,
    maxTokens = 1024,
    temperature = 0.7,
    timeoutMs = 20000,
    maxContinuations = 3,
  } = {}
) {
  if (!API_KEY) throw new Error("OPENROUTER_API_KEY not set");
  if (!_fetch)
    throw new Error("Fetch not available; install node-fetch or use Node 18+");

  const modelName = model || process.env.OPENROUTER_MODEL;
  if (!modelName) throw new Error("OPENROUTER_MODEL not set");

  let messages = [
    {
      role: "system",
      content:
        "You are Koki AI, an Indonesian cooking assistant. Respond in Indonesian, be concise and complete.",
    },
    { role: "user", content: prompt },
  ];

  let assistantAggregate = "";
  let attempts = 0;

  while (true) {
    const body = {
      model: modelName,
      messages,
      max_tokens: maxTokens,
      temperature,
    };

    const res = await _fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => null);
      const err = new Error(
        `OpenRouter error: ${res.status} ${res.statusText} - ${txt}`
      );
      err.status = res.status;
      throw err;
    }

    const j = await res.json();
    // Collect content from choices (support different response shapes)
    const choice = j.choices && j.choices[0];
    const part =
      (choice && choice.message && choice.message.content) ||
      (choice && choice.text) ||
      "";

    assistantAggregate += part;

    const finishReason = choice && choice.finish_reason;

    // If not truncated, or we exhausted retries, return aggregated content
    if (!finishReason || finishReason !== "length") {
      // normalize whitespace and fix accidental word splits across chunks (e.g. "a\nir" => "air")
      assistantAggregate = assistantAggregate
        .replace(/\r/g, "")
        .replace(/\n{2,}/g, "\n\n")
        .replace(/([^\s])\n([^\s])/g, "$1$2")
        .trim();
      return assistantAggregate;
    }

    // truncated by token limit — attempt continuation
    attempts++;
    if (attempts > maxContinuations) {
      // stop attempting further continuations
      return assistantAggregate;
    }

    // prepare messages to continue from the assistant partial content
    messages = [
      {
        role: "system",
        content:
          "You are Koki AI, an Indonesian cooking assistant. Continue the previous response and finish any truncated sentences.",
      },
      { role: "assistant", content: assistantAggregate },
      {
        role: "user",
        content:
          "Silakan lanjutkan dan selesaikan jawaban yang terpotong sebelumnya. Jangan ulang dari awal—lanjutkan dari akhir terakhir.",
      },
    ];

    // small backoff to avoid rate limits
    await new Promise((r) => setTimeout(r, 200 * attempts));
  }
}

module.exports = { panggilOpenRouter };
