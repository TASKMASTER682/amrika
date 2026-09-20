import OpenAI from 'openai';
import Flashcard from '../models/Flashcard.js';
import TestAttempt from '../models/TestAttempt.js';
import Question from '../models/Question.js';

const API_KEY = process.env.OPEN_ROUTER_API_KEY || process.env.NVIDIA_API_KEY || '';
const BASE_URL = process.env.OPEN_ROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const MODEL = process.env.OPEN_ROUTER_MODEL || 'openai/gpt-3.5-turbo';

// SM-2 intervals in days: [1, 3, 7, 14, 30, 60]
const getInterval = (repetitions, easeFactor) => {
  if (repetitions === 0) return 1;
  if (repetitions === 1) return 3;
  if (repetitions === 2) return 7;
  if (repetitions === 3) return 14;
  if (repetitions === 4) return 30;
  return Math.round(60 * easeFactor);
};

/**
 * Generate flashcards from wrong answers in a test attempt.
 * Caches: if flashcards already exist for this attempt, returns them.
 */
export const generateFromAttempt = async (userId, attemptId) => {
  const existing = await Flashcard.find({ userId, attemptId });
  if (existing.length > 0) {
    return { flashcards: existing, generated: false };
  }

  const attempt = await TestAttempt.findById(attemptId)
    .populate('testId', 'title subject examId');

  if (!attempt) throw new Error('Attempt not found');

  const wrongAnswers = (attempt.answers || []).filter(
    (a) => a.isCorrect === false && a.selectedAnswer?.length > 0
  );

  if (wrongAnswers.length === 0) {
    return { flashcards: [], generated: false, message: 'No wrong answers to generate from' };
  }

  const questionIds = wrongAnswers.map((a) => a.questionId);
  const questions = await Question.find({ _id: { $in: questionIds } });

  const questionMap = {};
  questions.forEach((q) => { questionMap[q._id.toString()] = q; });

  const questionData = wrongAnswers.map((a) => {
    const q = questionMap[a.questionId.toString()];
    if (!q) return null;
    return {
      question: q.questionText || q.question || q.text || '',
      options: q.options || [],
      correctAnswer: q.correctAnswer || q.answer || '',
      explanation: q.explanation || '',
      subject: q.subject || attempt.testId?.subject || '',
      topic: q.topic || '',
    };
  }).filter(Boolean);

  if (questionData.length === 0) {
    return { flashcards: [], generated: false, message: 'Question data not found' };
  }

  const flashcards = await callAIFlashcardGenerator(questionData);

  const savedCards = await Flashcard.insertMany(
    flashcards.map((card) => ({
      userId,
      attemptId,
      front: card.front,
      back: card.back,
      subject: card.subject || '',
      topic: card.topic || '',
      difficulty: card.difficulty || 'medium',
      source: 'ai_generated',
      easeFactor: 2.5,
      interval: 1,
      repetitions: 0,
      nextReview: new Date(),
    }))
  );

  return { flashcards: savedCards, generated: true };
};

/**
 * Call AI to generate flashcards from question data.
 */
const callAIFlashcardGenerator = async (questionData) => {
  if (!API_KEY) return questionData.flatMap((q) => buildFallbackCards(q));

  const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL, timeout: 90000, maxRetries: 1 });

  const questionsText = questionData.map((q, i) => {
    const opts = (q.options || []).map((o, j) => `  ${String.fromCharCode(65 + j)}. ${o}`).join('\n');
    return `Q${i + 1}: ${q.question}\n${opts}\nCorrect: ${q.correctAnswer}\nExplanation: ${q.explanation}\nSubject: ${q.subject}\nTopic: ${q.topic}`;
  }).join('\n\n');

  const prompt = `You are an expert Indian competitive exam tutor creating flashcards for spaced repetition revision.

CRITICAL RULES:
1. From EACH question, generate 2-5 flashcards covering ALL distinct concepts involved
2. Each flashcard must be COMPLETELY SELF-CONTAINED — the reader should NOT need to see the original question
3. NEVER reference "statement 1", "statement 2", "option A", "which of the following" etc. in your flashcard answers
4. Instead, directly state the fact, definition, formula, or concept as a standalone Q&A pair
5. Each card tests ONE specific concept, formula, definition, or fact
6. Mix card types: definitions, formulas, true/false, fill-in-the-blank, comparison, cause-effect

WHAT NOT TO DO (bad examples from original questions with statements):
❌ "Which statements are correct? → Statement 1 and 3 are correct"
❌ "The correct option is B because statement 2 is true"
❌ "Consider the following: A, B, C. Answer: B and C"

WHAT TO DO INSTEAD (good standalone flashcard examples):
✅ Front: "What is the boiling point of water at sea level?" Back: "100°C (212°F). At higher altitudes, boiling point decreases due to lower atmospheric pressure."
✅ Front: "Newton's Second Law formula" Back: "F = ma. Force equals mass times acceleration. Unit: Newton (N) = kg·m/s²."
✅ Front: "Is carbon a metal or non-metal?" Back: "Non-metal. Carbon belongs to Group 14 and forms covalent bonds. Examples: diamond, graphite."

CONCEPT EXTRACTION STRATEGY per question:
- What definition/fact is being tested? → Make a standalone definition card with the actual fact
- What formula is used? → Make a formula card (front: "Formula for X?", back: the formula + when to use)
- What relationship/comparison is involved? → Make a comparison card with actual values
- What is the underlying principle/rule? → Make a principle card stating the rule directly
- What common mistake does this question trap? → Make a "common error" card
- What is the correct answer? → Extract the actual concept/fact from the explanation and state it directly

Example: A question "Consider the following statements about planets: 1. Earth is densest 2. Jupiter is largest 3. Mars has moons. Which are correct?"
Bad flashcard: Front: "Which statements are correct?" Back: "Statement 1 and 3"
Good flashcards:
1. Front: "Which planet has the highest density in our solar system?" Back: "Earth (5.51 g/cm³). Its iron-nickel core gives it the highest density among planets."
2. Front: "How many moons does Mars have?" Back: "2 moons — Phobos and Deimos. They are small, irregular-shaped captured asteroids."
3. Front: "Largest planet in our solar system" Back: "Jupiter. Mass: 1.898 × 10²⁷ kg. It has 95 known moons and the Great Red Spot storm."

Questions:
${questionsText}

Return a JSON array. Each element:
{
  "front": "Clear, standalone question testing one concept (never reference original question's statements/options)",
  "back": "Direct answer with the actual fact/concept + brief 1-2 line explanation (never say 'statement X is correct')",
  "subject": "subject name",
  "topic": "specific topic/sub-topic",
  "difficulty": "easy|medium|hard"
}

Generate 2-5 cards per question. Total cards should be 2x-5x the number of questions.
Return ONLY the JSON array, no other text.`;

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: 'You are an exam preparation flashcard generator. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 8192,
    });

    const content = completion.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.error('[FlashcardService] AI generation failed:', err.message);
  }

  return questionData.flatMap((q) => buildFallbackCards(q));
};

const buildFallbackCards = (q) => {
  const cards = [];
  if (q.question) {
    cards.push({
      front: q.question.substring(0, 200),
      back: q.correctAnswer || 'See explanation',
      subject: q.subject || '',
      topic: q.topic || '',
      difficulty: 'medium',
    });
  }
  if (q.explanation && q.explanation.length > 20) {
    cards.push({
      front: `Concept: ${q.subject || q.topic || 'Topic'}`,
      back: q.explanation.substring(0, 300),
      subject: q.subject || '',
      topic: q.topic || '',
      difficulty: 'medium',
    });
  }
  return cards.length > 0 ? cards : [{ front: 'Concept', back: q.correctAnswer || 'Review needed', subject: q.subject || '', topic: q.topic || '', difficulty: 'medium' }];
};

/**
 * Process a review (SM-2 algorithm).
 * quality: 1-5 (1=Again, 2=Hard, 3=Good, 4=Easy, 5=Perfect)
 */
export const processReview = async (flashcardId, userId, quality) => {
  const card = await Flashcard.findOne({ _id: flashcardId, userId });
  if (!card) throw new Error('Flashcard not found');

  quality = Math.max(1, Math.min(5, quality));

  card.totalReviews += 1;
  if (quality >= 3) card.correctReviews += 1;

  if (quality < 3) {
    card.repetitions = 0;
    card.interval = 1;
  } else {
    card.repetitions += 1;
    const newEF = card.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    card.easeFactor = Math.max(1.3, newEF);
    card.interval = getInterval(card.repetitions, card.easeFactor);
  }

  card.lastReview = new Date();
  card.nextReview = new Date(Date.now() + card.interval * 24 * 60 * 60 * 1000);

  if (card.repetitions >= 5 && quality >= 4) {
    card.status = 'mastered';
  }

  await card.save();
  return card;
};

/**
 * Get deck stats for a user.
 */
export const getDeckStats = async (userId) => {
  const now = new Date();

  const [dueCount, masteredCount, totalActive, recentSessions] = await Promise.all([
    Flashcard.countDocuments({ userId, status: 'active', nextReview: { $lte: now } }),
    Flashcard.countDocuments({ userId, status: 'mastered' }),
    Flashcard.countDocuments({ userId, status: 'active' }),
  ]);

  return {
    dueToday: dueCount,
    mastered: masteredCount,
    totalActive: totalActive,
    retentionRate: totalActive > 0 ? Math.round((masteredCount / totalActive) * 100) : 0,
  };
};
