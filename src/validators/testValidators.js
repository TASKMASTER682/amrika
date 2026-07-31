const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const testSectionSchema = z.object({
  name: z.string().min(1),
  questions: z.array(objectId).min(1),
  durationSec: z.number().optional(),
  shuffleQuestions: z.boolean().default(true),
  shuffleOptions: z.boolean().default(true),
  isLocked: z.boolean().default(false),
});

const createTestSchema = z.object({
  testSeries: objectId.optional(),
  exam: objectId,
  title: z.string().min(3),
  instructions: z.string().optional(),
  sections: z.array(testSectionSchema).min(1),
  totalDurationSec: z.number().positive(),
  totalMarks: z.number().positive(),
  passingMarks: z.number().optional(),
  negativeMarkingRatio: z.number().min(0).max(1).default(0.25),
  calculatorAllowed: z.boolean().default(false),
  fullscreenRequired: z.boolean().default(true),
  maxAttempts: z.number().min(1).default(1),
  publishAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
});

const updateTestSchema = createTestSchema.partial();

const saveAnswerSchema = z.object({
  questionIndex: z.number().min(0),
  selectedOptionIds: z.array(z.string()).default([]),
  numericAnswer: z.number().optional(),
  status: z.enum(['not_answered', 'answered', 'marked', 'answered_marked']),
  timeTakenSec: z.number().min(0).default(0),
});

module.exports = { createTestSchema, updateTestSchema, saveAnswerSchema };
