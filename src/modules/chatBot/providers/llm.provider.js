const AppError = require('../../../utils/AppError');

const SYSTEM_PROMPT = `You are ROSE, a friendly flower shop assistant.
You help with bouquet recommendations, delivery info, and store FAQs.
Never invent order details, prices, or delivery dates — if unsure, offer to connect the customer with a human.
Keep replies short (max 3 sentences).`;

const ask = async (userText) => {
  const apiKey = process.env.LLM_API_KEY;
  const apiUrl = process.env.LLM_API_URL;

  if (!apiKey || !apiUrl) return null; 

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(Number(process.env.LLM_TIMEOUT_MS) || 10000),
      body: JSON.stringify({
        model: process.env.LLM_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userText },
        ],
        max_tokens: 250,
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      throw new AppError(`LLM error: ${res.status}`, 502);
    }

    const data = await res.json();
    const body = data.choices?.[0]?.message?.content?.trim();
    if (!body) return null;

    return { body, confidence: 0.6 };
  } catch (err) {
    console.error('[chatbot] LLM failed:', err.message);
    return null;
  }
};

module.exports = { ask };