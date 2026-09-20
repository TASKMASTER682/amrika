import mongoose from 'mongoose';

const practiceAnswerSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true,
  },
  selectedAnswer: [String],
  isCorrect: { type: Boolean, default: false },
  timeSpent: { type: Number, default: 0 }, // seconds
}, { _id: false });

const practiceSessionSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  source: {
    type: String,
    enum: ['weak', 'slow', 'custom', 'create_test', 'recommended', 'general'],
    default: 'general',
  },
  subject: { type: String, default: '' },
  topic: { type: String, default: '' },
  totalQuestions: { type: Number, default: 0 },
  answered: { type: Number, default: 0 },
  correct: { type: Number, default: 0 },
  timeSpentSeconds: { type: Number, default: 0 },
  answers: [practiceAnswerSchema],
  startedAt: { type: Date, default: Date.now },
  completedAt: Date,
}, {
  timestamps: true,
});

practiceSessionSchema.index({ studentId: 1, createdAt: -1 });

const PracticeSession = mongoose.model('PracticeSession', practiceSessionSchema);
export default PracticeSession;
