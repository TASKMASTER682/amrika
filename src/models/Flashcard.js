import mongoose from 'mongoose';

const flashcardSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  attemptId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestAttempt',
    default: null,
  },
  front: {
    type: String,
    required: true,
    trim: true,
  },
  back: {
    type: String,
    required: true,
    trim: true,
  },
  subject: {
    type: String,
    default: '',
  },
  topic: {
    type: String,
    default: '',
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium',
  },
  source: {
    type: String,
    enum: ['ai_generated', 'manual', 'wrong_answer'],
    default: 'ai_generated',
  },
  // SM-2 Spaced Repetition fields
  easeFactor: {
    type: Number,
    default: 2.5,
    min: 1.3,
  },
  interval: {
    type: Number,
    default: 1,
  },
  repetitions: {
    type: Number,
    default: 0,
  },
  nextReview: {
    type: Date,
    default: Date.now,
  },
  lastReview: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['active', 'mastered', 'suspended'],
    default: 'active',
  },
  totalReviews: {
    type: Number,
    default: 0,
  },
  correctReviews: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

flashcardSchema.index({ userId: 1, nextReview: 1, status: 1 });
flashcardSchema.index({ userId: 1, attemptId: 1 });
flashcardSchema.index({ userId: 1, subject: 1 });

export default mongoose.model('Flashcard', flashcardSchema);
