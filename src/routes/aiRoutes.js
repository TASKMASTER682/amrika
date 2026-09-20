import express from 'express';
import { protect } from '../middleware/auth.js';
import { parseStructuredText } from '../services/ParserService.js';
const router = express.Router();
router.use(protect);

router.post('/generate-mcq', async (req, res, next) => {
  try {
    const { examId, subject, prompt, count = 5 } = req.body;
    const cnt = Math.min(Number(count) || 5, 15);
    console.log('[AI] generate-mcq backend hit:', { examId, subject, promptLength: prompt?.length, count: cnt });

    // REAL AI PROMPT enforcing parser format
    const aiSystemPrompt = `You are an expert MCQ generator for Indian competitive exams.
Generate exactly ${cnt} multiple-choice questions.
EACH question MUST follow this exact tagged format (separate questions with [NEXT]):

[Q] The full question text / introductory passage
[SUB-Q] The actual sub-question being asked (if any, else omit)
[O_a] Option A text
[O_b] Option B text
[O_c] Option C text
[O_d] Option D text
[ANS] The correct answer letter (A, B, C, D, or combinations like A,C)
[EXP] Detailed explanation of why the answer is correct
[SUBJ] ${subject || 'General'}
[TOPIC] ${prompt?.slice(0, 150) || 'General'}
[DIFFICULTY] Medium
[TYPE] Single Correct

Rules:
- Always include [Q], at least [O_a] to [O_d], [ANS], and [EXP]
- Separate each question block with exactly [NEXT] on its own line
- Never add extra text outside the tags
- Use real exam-level content for the subject: ${subject || 'General'}
- Topic focus: ${prompt || 'General'}
- Output only the tagged blocks`;

    const userPrompt = `Generate ${cnt} MCQs.
Exam: ${examId || 'General'}
Subject: ${subject || 'General'}
Topic/Prompt: ${prompt || 'General'}
Format: [Q]...[O_a]...[ANS]...[EXP]...[NEXT]`;

    // Try NVIDIA AI first; fall back to parser-formatted dummy if no key
    let rawText = '';
    try {
      const { default: OpenAI } = await import('openai');
      const API_KEY = process.env.OPEN_ROUTER_API_KEY || process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY || '';
      const BASE_URL = process.env.OPEN_ROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
      const MODEL = process.env.OPEN_ROUTER_MODEL || 'openai/gpt-3.5-turbo';

      if (API_KEY) {
        const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL, timeout: 90000, maxRetries: 1 });
        const completion = await client.chat.completions.create({
          model: MODEL,
          messages: [
            { role: 'system', content: aiSystemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 2048,
        });
        rawText = completion.choices?.[0]?.message?.content?.trim() || '';
        console.log(`[AI] NVIDIA AI responded. Length=${rawText.length}`);
      } else {
        console.warn('[AI] No NVIDIA_API_KEY / OPENAI_API_KEY found — using structured fallback');
      }
    } catch (aiErr) {
      console.warn('[AI] NVIDIA AI call failed:', aiErr?.message || aiErr);
    }

    // If AI returned nothing or too short, build parser-compliant dummy questions
    if (!rawText || rawText.length < 30) {
      console.log('[AI] Using parser-formatted fallback questions');
      const blocks = [];
      for (let i = 1; i <= cnt; i++) {
        blocks.push(
          `[Q] AI Generated MCQ #${i}: ${subject || 'General'} — ${prompt?.slice(0, 60) || 'Custom Topic'}\n` +
          `[SUB-Q] Select the correct option.\n` +
          `[O_a] Option A for Q${i}\n` +
          `[O_b] Option B for Q${i}\n` +
          `[O_c] Option C for Q${i}\n` +
          `[O_d] Option D for Q${i}\n` +
          `[ANS] B\n` +
          `[EXP] This is the correct explanation for AI generated question #${i}.\n` +
          `[SUBJ] ${subject || 'General'}\n` +
          `[TOPIC] ${prompt?.slice(0, 80) || 'AI Generated'}\n` +
          `[DIFFICULTY] Medium\n` +
          `[TYPE] Single Correct\n` +
          `[NEXT]`
        );
      }
      rawText = blocks.join('\n');
    }

    // Validate parser format presence
    if (!rawText.includes('[Q]')) {
      console.warn('[AI] AI output missing [Q] tag — injecting header');
      rawText = `[Q] AI Generated Question\n` + rawText;
    }

    // Parse using ParserService
    const parsedQuestions = parseStructuredText(rawText, req.user?._id || 'ai-system', 'ai-generated');
    console.log(`[AI] Parser extracted ${parsedQuestions.length} questions`);

    if (parsedQuestions.length === 0) {
      console.warn('[AI] Parser returned 0 questions');
      return res.status(400).json({
        success: false,
        error: 'AI output did not match parser format. Expected tags: [Q], [O_a]-[O_d], [ANS], [EXP], [NEXT]',
        debug: { rawLength: rawText.length, rawSnippet: rawText.slice(0, 400) },
      });
    }

    // Convert to mobile response format
    const questions = parsedQuestions.map((q, idx) => ({
      id: q.id?.toString() || `ai-q-${Date.now()}-${idx}`,
      body: q.body || '',
      subQ: q.subQ || '',
      options: q.options || [
        { key: 'A', text: 'Option A' },
        { key: 'B', text: 'Option B' },
        { key: 'C', text: 'Option C' },
        { key: 'D', text: 'Option D' },
      ],
      correctAnswer: Array.isArray(q.correctAnswer) ? q.correctAnswer : (q.correctAnswer ? [q.correctAnswer] : ['B']),
      explanation: q.explanation || '',
      type: q.type || 'Single Correct',
      subject: q.subject || subject || 'General',
      topic: q.topic || 'AI Generated',
      difficulty: q.difficulty || 'Medium',
      marks: 1,
      negativeMarks: 0,
      hasContext: !!(q.context && q.context.trim()),
      context: q.context || '',
      statements: q.statements || [],
      matchPairs: q.matchPairs || [],
      imageUrl: q.imageUrl || '',
    }));

    // Save as temporary / staging records (optional but recommended)
    // Here we return directly; caller handles temporary DB via practice repository

    return res.json({ success: true, data: questions });
  } catch (e) {
    console.error('[AI] generate-mcq error:', e);
    next(e);
  }
});

export default router;
