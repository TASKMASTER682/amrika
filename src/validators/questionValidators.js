const { z } = require('zod');
const { QUESTION_TYPES, DIFFICULTY } = require('../models/Question');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const optionSchema = z.object({
  text: z.string().optional(),
  imageUrl: z.string().url().optional(),
  isCorrect: z.boolean().default(false),
});

const createQuestionSchema = z.object({
  text: z.string().min(3),
  type: z.enum(QUESTION_TYPES).default('single_correct'),
  options: z.array(optionSchema).default([]),
  correctNumericAnswer: z.number().optional(),
  numericTolerance: z.number().default(0),
  explanation: z.string().optional(),
  hint: z.string().optional(),
  formula: z.string().optional(),
  concept: z.string().optional(),
  imageUrl: z.string().url().optional(),
  diagramUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
  exam: objectId,
  subject: objectId,
  topic: objectId,
  subtopic: objectId.optional(),
  difficulty: z.enum(DIFFICULTY).default('moderate'),
  language: z.string().default('en'),
  tags: z.array(z.string()).default([]),
  marks: z.number().default(1),
  negativeMarks: z.number().default(0),
  avgSolvingTimeSec: z.number().default(60),
  isPreviousYear: z.boolean().default(false),
  source: z.string().optional(),
});

const updateQuestionSchema = createQuestionSchema.partial();

const questionQuerySchema = z.object({
  exam: objectId.optional(),
  subject: objectId.optional(),
  topic: objectId.optional(),
  difficulty: z.enum(DIFFICULTY).optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
  approvalStatus: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

module.exports = { createQuestionSchema, updateQuestionSchema, questionQuerySchema };
