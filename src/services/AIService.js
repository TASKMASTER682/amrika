import OpenAI from 'openai';

const API_KEY = process.env.NVIDIA_API_KEY || '';
const BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const MODEL = process.env.NVIDIA_MODEL || 'meta/llama-3.1-8b-instruct';

// Auto-generate an answer for a student's doubt using the free NVIDIA AI API.
// Returns null when the key is missing or the request fails (never crashes).
export const generateAIDoubtAnswer = async ({ title, body, subject, topic }) => {
  console.log(`[AI] generateAIDoubtAnswer called. keyPresent=${!!API_KEY} model=${MODEL}`);
  if (!API_KEY) {
    console.warn('[AI] NVIDIA_API_KEY missing — skipping AI reply.');
    return null;
  }

  const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL, timeout: 90000, maxRetries: 1 });

  const system = [
    'You are a subject-expert tutor for Indian competitive exams (SSC, UPSC, Banking, Railways, etc.).',
    'Answer the student\'s doubt clearly and step-by-step in simple English.',
    'Length rule: write between 120 and 250 words. Never be too short, never be too long.',
    'Use plain text. Avoid markdown tables. Use short bullet points if helpful.',
    'MATH RULE: The frontend renders KaTeX math. Format every math expression properly:',
    '  - Standalone equations: wrap in $$ ... $$ (on their own lines), e.g. $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$.',
    '  - Inline math in a sentence: wrap in \\( ... \\), e.g. the roots are \\( x = 2 \\) and \\( x = 3 \\).',
    '  - Use real LaTeX inside those delimiters: \\frac, \\sqrt, \\times, \\pm, ^, _, \\sum, \\int.',
    '  - NEVER output raw LaTeX outside the $$ or \\( \\) delimiters — everything else must be plain English text.',
  ].join(' ');

  const prompt = `Subject: ${subject || 'General'}\nTopic: ${topic || 'General'}\nQuestion title: ${title}\n\n${body}`;

  try {
    console.log(`[AI] Calling NVIDIA API (model=${MODEL})...`);
    const startedAt = Date.now();
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      top_p: 0.7,
      max_tokens: 1024,
      stream: false,
    });
    console.log(`[AI] API responded in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    const content = completion.choices?.[0]?.message?.content?.trim() || null;
    if (!content) {
      console.warn('[AI] Empty content returned by NVIDIA.');
      return null;
    }

    // Guard against too-short or too-long answers so forum replies stay readable.
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    console.log(`[AI] Reply ready (${wordCount} words).`);
    if (wordCount < 40) return content; // very short but still meaningful for trivial doubts
    if (wordCount > 500) return content.slice(0, 3000);
    return content;
  } catch (error) {
    console.warn('[AI] NVIDIA AI doubt reply failed:', error?.message || error);
    if (error?.status) console.warn('[AI] HTTP status:', error.status);
    return null;
  }
};
