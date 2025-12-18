/* src/utils/layananDeepseek.js
   Simple Deepseek API client wrapper.
   Usage: set DEEPSEEK_API_KEY and optionally DEEPSEEK_API_URL in your .env.
   NOTE: Do NOT commit your API key into repo. Keep it in .env or secrets manager.
*/
require("dotenv").config();

const DEFAULT_URL =
  process.env.DEEPSEEK_API_URL || "https://api.deepseek.ai/v1/generate";
const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_KEY_HEADER = process.env.DEEPSEEK_API_KEY_HEADER || "Authorization";

let _fetch = global.fetch;
if (!_fetch) {
  try {
    // Try to lazy-require node-fetch for older Node versions
    _fetch = require("node-fetch");
  } catch (e) {
    // If fetch is not available, requests will fail with a helpful error when used
    _fetch = null;
  }
}

// Ensure we have an AbortController implementation (Node <18 may not have global one)
let AbortControllerImpl =
  global.AbortController || (globalThis && globalThis.AbortController);
if (!AbortControllerImpl) {
  try {
    const nf = require("node-fetch");
    AbortControllerImpl = nf && nf.AbortController ? nf.AbortController : null;
  } catch (e) {
    try {
      AbortControllerImpl = require("abort-controller");
    } catch (e2) {
      AbortControllerImpl = null;
    }
  }
}
if (!AbortControllerImpl) {
  console.warn(
    '⚠️ AbortController not found: request timeouts will not abort the fetch. Install "abort-controller" or use Node 18+ for best behavior.'
  );
}

async function panggilDeepseek(
  prompt,
  {
    maxTokens = 512,
    timeoutMs = 20000,
    includeRaw = false,
    temperature = 0.7,
    extra = {},
  } = {}
) {
  if (!API_KEY)
    throw new Error("Deepseek API key is not configured (DEEPSEEK_API_KEY).");
  if (!_fetch)
    throw new Error(
      'Fetch is not available in this Node environment. Install "node-fetch" or use Node 18+.'
    );

  const model = extra.model || process.env.DEEPSEEK_MODEL;

  // Send request to a specific URL (returns { json } or { rawText })
  async function sendRequestTo(url, body, timeout) {
    const useAbort = !!AbortControllerImpl;
    const controller = useAbort ? new AbortControllerImpl() : null;
    const id = setTimeout(() => {
      try {
        if (useAbort && controller && typeof controller.abort === "function")
          controller.abort();
        else
          console.warn(
            "Deepseek request timed out (no AbortController to abort)"
          );
      } catch (e) {
        // ignore
      }
    }, timeout || timeoutMs);

    try {
      const headers = { "Content-Type": "application/json" };
      if (API_KEY) {
        if (API_KEY_HEADER.toLowerCase() === "authorization")
          headers.Authorization = `Bearer ${API_KEY}`;
        else headers[API_KEY_HEADER] = API_KEY;
      }
      const res = await _fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller ? controller.signal : undefined,
      });
      clearTimeout(id);

      if (!res.ok) {
        const text = await res.text().catch(() => "<non-text response>");
        const msg = `Deepseek request failed: HTTP ${res.status} ${res.statusText} - ${text} (url: ${url})`;
        const err = new Error(msg);
        err.status = res.status;
        err.url = url;
        throw err;
      }

      try {
        const j = await res.json();
        return { json: j };
      } catch (e) {
        const txt = await res.text().catch(() => null);
        return { rawText: txt || null };
      }
    } catch (err) {
      clearTimeout(id);
      if (err.name === "AbortError")
        throw new Error("Deepseek request timed out");
      throw err;
    }
  }

  // Try DEFAULT_URL first; if it 404s, try a few common endpoint paths on the same origin.
  async function tryEndpoints(body, timeout) {
    const tried = [];
    const candidatePaths = [
      "/v1/generate",
      "/v1/completions",
      "/v1/chat/completions",
      "/v1/predict",
      "/v1/complete",
    ];

    // helper to construct URL (path or absolute)
    const makeUrl = (pathOrUrl) => {
      try {
        const u = new URL(pathOrUrl);
        return u.href;
      } catch (e) {
        try {
          const base = new URL(DEFAULT_URL).origin;
          return new URL(pathOrUrl, base).href;
        } catch (e2) {
          return pathOrUrl;
        }
      }
    };

    // try the configured DEFAULT_URL first
    try {
      const r = await sendRequestTo(DEFAULT_URL, body, timeout);
      tried.push({ url: DEFAULT_URL, ok: true });
      return { url: DEFAULT_URL, result: r };
    } catch (err) {
      tried.push({ url: DEFAULT_URL, ok: false, error: err });
      if (err && err.status === 404) {
        for (const p of candidatePaths) {
          const u = makeUrl(p);
          try {
            const r = await sendRequestTo(u, body, timeout);
            tried.push({ url: u, ok: true });
            return { url: u, result: r };
          } catch (err2) {
            tried.push({ url: u, ok: false, error: err2 });
          }
        }
      }

      const firstErr = tried.find((t) => !t.ok);
      const errMsg =
        firstErr && firstErr.error ? firstErr.error.message : "No response";
      const agg = new Error(
        `Deepseek request failed after trying multiple endpoints: ${errMsg}`
      );
      agg.attempts = tried;
      agg.suggestion =
        "Periksa pengaturan DEEPSEEK_API_URL; gunakan URL yang mencakup path API (mis. https://api.deepseek.ai/v1/generate)";
      throw agg;
    }
  }

  function extractText(result) {
    if (!result) return null;
    if (result.output && Array.isArray(result.output) && result.output.length) {
      if (typeof result.output[0] === "string") return result.output[0];
      if (result.output[0].content) return result.output[0].content;
    }
    if (result.choices && Array.isArray(result.choices) && result.choices[0]) {
      if (result.choices[0].text) return result.choices[0].text;
      if (result.choices[0].message && result.choices[0].message.content)
        return result.choices[0].message.content;
    }
    if (typeof result.text === "string") return result.text;
    if (typeof result === "string") return result;
    return null;
  }

  // primary request shape (merge any extra params)
  const body = Object.assign(
    {
      prompt,
      max_tokens: maxTokens,
      temperature,
    },
    model ? { model } : {},
    extra || {}
  );

  // Attempt requests and capture which URL succeeded (helps diagnose 404s)
  const primaryResp = await tryEndpoints(body, timeoutMs);
  const usedUrl =
    primaryResp && primaryResp.url ? primaryResp.url : DEFAULT_URL;
  const primary =
    primaryResp && primaryResp.result && primaryResp.result.json
      ? primaryResp.result.json
      : primaryResp.result.rawText;
  let extracted = extractText(primary);

  // If the API just echoed the prompt (common when using a mismatched endpoint), try fallbacks
  const safeTrim = (s) => (typeof s === "string" ? s.trim() : s);
  const isEcho =
    (safeTrim(extracted) || "") === safeTrim(prompt) ||
    (safeTrim(extracted) || "") === (safeTrim(extra && extra.prompt) || "");

  if (isEcho) {
    console.info(
      "Deepseek response looked like an echo of prompt — attempting alternative request shapes"
    );
    // Try 'input' style
    try {
      const alt1 = Object.assign(
        {
          input: prompt,
          max_tokens: maxTokens,
          temperature,
        },
        model ? { model } : {},
        extra || {}
      );
      const r1Resp = await tryEndpoints(alt1, timeoutMs);
      const r1 =
        r1Resp && r1Resp.result && r1Resp.result.json
          ? r1Resp.result.json
          : r1Resp.result.rawText;
      const e1 = extractText(r1);
      if (e1 && String(e1).trim() !== String(prompt).trim()) {
        return includeRaw
          ? { text: String(e1), raw: r1, url: r1Resp.url }
          : String(e1);
      }

      // Try chat/messages style as a last attempt
      const alt2 = Object.assign(
        {
          messages: [
            {
              role: "system",
              content:
                "You are Koki AI, an Indonesian cooking assistant. Answer concisely and helpfully. Do NOT repeat the user's prompt. Give concise step-by-step instructions if applicable.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: maxTokens,
          temperature,
        },
        model ? { model } : {},
        extra || {}
      );
      const r2Resp = await tryEndpoints(alt2, timeoutMs);
      const r2 =
        r2Resp && r2Resp.result && r2Resp.result.json
          ? r2Resp.result.json
          : r2Resp.result.rawText;
      const e2 = extractText(r2);
      if (e2 && String(e2).trim() !== String(prompt).trim()) {
        return includeRaw
          ? { text: String(e2), raw: r2, url: r2Resp.url }
          : String(e2);
      }

      // Final attempt: instruction prefix + stop sequences to avoid echo
      try {
        const instrPrompt = `Instruksi: Jangan ulangi pertanyaan. Jawab langsung dan singkat. Pengguna: ${prompt}`;
        const alt3 = Object.assign(
          {
            prompt: instrPrompt,
            max_tokens: maxTokens,
            temperature: Math.max(0.2, Math.min(0.7, temperature)),
            stop: ["Pengguna:", "Koki AI:", "\n\n"],
          },
          model ? { model } : {},
          extra || {}
        );
        const r3Resp = await tryEndpoints(alt3, timeoutMs);
        const r3 =
          r3Resp && r3Resp.result && r3Resp.result.json
            ? r3Resp.result.json
            : r3Resp.result.rawText;
        const e3 = extractText(r3);
        if (e3 && String(e3).trim() !== String(prompt).trim()) {
          return includeRaw
            ? { text: String(e3), raw: r3, url: r3Resp.url }
            : String(e3);
        }
        extracted = e3 || e2 || e1 || extracted;
      } catch (err3) {
        console.warn(
          "Deepseek final instruction attempt failed:",
          err3.message || err3
        );
      }

      // If still echoing, fall through to return best available
      extracted = extracted || e2 || e1 || extracted;
    } catch (err) {
      // ignore fallback failures; we'll return primary/extracted or throw if none
      console.warn("Deepseek fallback attempt failed:", err.message || err);
    }
  }

  if (extracted) {
    return includeRaw
      ? { text: String(extracted), raw: primaryResp.result, url: usedUrl }
      : String(extracted);
  }

  // As last resort, return raw primary response as string
  if (includeRaw)
    return { text: String(primary), raw: primaryResp.result, url: usedUrl };
  return String(primary);
}

// Ping the configured URL(s) to provide diagnostics (masked headers, status, snippet)
async function pingUrl(timeout = 5000) {
  const info = { attempts: [] };
  const headers = { "Content-Type": "application/json" };
  if (API_KEY) {
    if (API_KEY_HEADER.toLowerCase() === "authorization")
      headers.Authorization = `Bearer ${API_KEY}`;
    else headers[API_KEY_HEADER] = API_KEY;
  }

  const maskVal = (v) =>
    typeof v === "string"
      ? v.length > 8
        ? v.slice(0, 4) + "..." + v.slice(-4)
        : "***"
      : "***";

  async function probe(url) {
    try {
      const ac = AbortControllerImpl ? new AbortControllerImpl() : null;
      const res = await _fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: "ping" }),
        signal: ac ? ac.signal : undefined,
      });
      const text = await res.text().catch(() => null);
      const snippet = text ? text.slice(0, 1000) : null;
      return {
        url,
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        snippet,
      };
    } catch (err) {
      return {
        url,
        ok: false,
        error: err && err.message ? err.message : String(err),
      };
    }
  }

  // try the configured DEFAULT_URL first
  info.attempts.push(await probe(DEFAULT_URL));

  // if the base has an origin, try common candidate paths
  const baseOrigin = (() => {
    try {
      return new URL(DEFAULT_URL).origin;
    } catch (e) {
      return null;
    }
  })();
  if (baseOrigin) {
    const candidatePaths = [
      "/v1/generate",
      "/v1/completions",
      "/v1/chat/completions",
      "/v1/predict",
      "/v1/complete",
    ];
    for (const p of candidatePaths) {
      const u = new URL(p, baseOrigin).href;
      info.attempts.push(await probe(u));
    }
  }

  // include masked header info for diagnostics (do not reveal full key)
  info.headers = Object.keys(headers).map((k) => ({
    name: k,
    value: k === API_KEY_HEADER ? maskVal(headers[k]) : headers[k],
  }));
  return info;
}

module.exports = { panggilDeepseek, pingUrl };
