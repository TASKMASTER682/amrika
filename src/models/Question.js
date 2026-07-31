import mongoose from 'mongoose';

const optionSchema = new mongoose.Schema({
  key: { type: String, required: true }, // e.g., 'A', 'B', 'C', 'D'
  text: { type: String, required: true },
  imageUrl: String,
});

const questionSchema = new mongoose.Schema({
  body: {
    type: String,
    required: true,
  },
  options: [optionSchema],
  // Correct answers representation:
  // - Single/Multiple Correct: array of keys (e.g., ['A'], ['A', 'C'])
  // - Integer/Numerical: array with the string representation of answer value (e.g., ['42'])
  // - Match the Following: array mapping pairs (e.g., ['A-P', 'B-Q', 'C-R'])
  correctAnswer: {
    type: [String],
    required: true,
  },
  type: {
    type: String,
    enum: [
      'Single Correct',
      'Multiple Correct',
      'Integer',
      'Numerical',
      'True False',
      'Assertion Reason',
      'Match the Following',
      'Paragraph Based',
      'Image Based',
      'Case Study',
      'Passage',
      'Conceptual',
      'Reasoning',
      'Data Sufficiency',
      'Data Interpretation',
    ],
    default: 'Single Correct',
  },
  subject: { type: String, required: true, trim: true },
  topic: { type: String, required: true, trim: true },
  subtopic: { type: String, trim: true },
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard'],
    default: 'Medium',
  },
  language: {
    type: String,
    enum: ['English', 'Hindi'],
    default: 'English',
  },
  explanation: String,
  context: String,
  statements: [String],
  matchPairs: [String],
  subQ: String,
  formula: String,
  concept: String,
  hint: String,
  imageUrl: String,
  marks: { type: Number, default: 1 },
  negativeMarks: { type: Number, default: 0 },
  source: String, // e.g. "CGL 2024 Tier 1"
  year: Number,
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam' },
  agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency' },
  tags: [String],
  avgSolvingTime: { type: Number, default: 60 }, // in seconds
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvalStatus: {
    type: String,
    enum: ['Draft', 'In-Review', 'Approved'],
    default: 'Approved',
  },
  usageStatus: {
    type: String,
    enum: ['unused', 'used'],
    default: 'unused',
  },
  version: { type: Number, default: 1 },
  active: { type: Boolean, default: true },
  revisionHistory: [
    {
      version: Number,
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      updatedAt: { type: Date, default: Date.now },
      changes: String,
    }
  ],
}, {
  timestamps: true,
});

// Create search indexes for fast lookup and filtering
questionSchema.index({ subject: 1, topic: 1 });
questionSchema.index({ body: 'text', tags: 'text' });
questionSchema.index({ examId: 1, approvalStatus: 1 });

export default mongoose.model('Question', questionSchema);
