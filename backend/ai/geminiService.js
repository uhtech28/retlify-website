/**
 * Retlify AI Service  (OpenRouter)
 * ==================================
 * Drop-in replacement for the former Gemini wrapper.
 * Every other file in this project imports from here unchanged —
 * the public API is 100% identical to the previous Gemini version.
 *
 * Provider : OpenRouter  (https://openrouter.ai)
 * Model    : mistralai/mistral-7b-instruct:free  (free tier, no card required)
 *
 * Setup:
 *   1. npm install axios
 *   2. Add OPENROUTER_API_KEY=<your_key> to .env
 *   3. Get a free key at https://openrouter.ai/keys
 */

'use strict';

const axios = require('axios');

/* ── Constants ───────────────────────────────────────────── */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Kept for compatibility — callers reference MODELS.flash / MODELS.pro
const MODELS = {
  flash: 'openai/gpt-3.5-turbo',
  pro:   'openai/gpt-3.5-turbo',
};
/* ── Availability check ──────────────────────────────────── */

function isAvailable() {
  return !!process.env.OPENROUTER_API_KEY;
}

/* ── Core text generation ────────────────────────────────────
 *
 * Identical signature to the old Gemini version:
 *
 * @param {string} prompt        User prompt (single-turn or last turn)
 * @param {object} opts
 *   @param {string}   opts.model         'flash' | 'pro'  (default: 'flash')
 *   @param {string}   opts.systemPrompt  Optional system instruction
 *   @param {number}   opts.maxTokens     Max output tokens  (default: 500)
 *   @param {number}   opts.temperature   0–1               (default: 0.7)
 *   @param {Array}    opts.history       OpenAI-format prior turns from convertHistory()
 * @returns {Promise<string>}  Raw text response
 */
async function generateText(prompt, opts = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const model       = MODELS[opts.model || 'flash'] || MODELS.flash;
  const maxTokens   = opts.maxTokens   ?? 500;
  const temperature = opts.temperature ?? 0.7;

  // Build messages array: [system?] + [history?] + [user]
  const messages = [];

  if (opts.systemPrompt) {
    messages.push({ role: 'system', content: opts.systemPrompt });
  }

  if (Array.isArray(opts.history) && opts.history.length) {
    messages.push(...opts.history);
  }

  messages.push({ role: 'user', content: prompt });

  try {
    const response = await axios.post(
      OPENROUTER_URL,
      { model, messages, max_tokens: maxTokens, temperature },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
        },
      }
    );
    return response.data.choices[0].message.content;
  } catch (err) {
    console.error('[OpenRouter] error:', err.response?.data || err.message);
    throw err;
  }
}

/* ── JSON helper ─────────────────────────────────────────────
 * Like generateText but parses the response as JSON.
 * Strips markdown fences automatically.
 * Returns parsed object or throws on invalid JSON.
 * (Identical behaviour to the old Gemini version.)
 */
async function generateJSON(prompt, opts = {}) {
  const jsonPrompt = prompt + '\n\nReturn ONLY valid JSON — no markdown fences, no explanation.';
  const raw        = await generateText(jsonPrompt, { ...opts, temperature: opts.temperature ?? 0.3 });
  const clean      = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

/* ── Chat history converter ──────────────────────────────────
 * Converts the project's [{role:'user'|'assistant', content}] format
 * (used by chatbotService) into OpenAI's [{role:'user'|'assistant', content}] format.
 *
 * NOTE: Previously this converted to Gemini's {role:'model', parts:[{text}]} shape.
 * Now it returns the OpenAI shape, which generateText() consumes directly.
 * The call-sites (chatbotService) are unchanged.
 */
function convertHistory(messages) {
  // Exclude the last message — that is passed as the prompt to generateText()
  return messages.slice(0, -1).map(m => ({
    role:    m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));
}

/* ── Simple alias ────────────────────────────────────────────
 * Kept for compatibility with any code using generateAIResponse directly.
 */
async function generateAIResponse(prompt) {
  return generateText(prompt);
}

/* ── Public API ──────────────────────────────────────────── */
module.exports = {
  generateAIResponse,   // simple alias
  generateText,         // full options variant
  generateJSON,         // JSON-parsed variant
  convertHistory,       // chat history format converter
  isAvailable,          // key presence check
  MODELS,
};
