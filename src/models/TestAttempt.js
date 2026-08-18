import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true,
  },
  sectionId: {
    type: String, // ID of the section
    required: true,
  },
  selectedAnswer: [String], // Array of keys, e.g., ['A'], ['A', 'B'], ['15']
  status: {
    type: String,
    enum: ['Answered', 'Marked for Review', 'Not Answered', 'Answered & Marked for Review', 'Not Visited'],
    default: 'Not Visited',
  },
  timeSpent: { type: Number, default: 0 }, // in seconds
  isCorrect: { type: Boolean, default: false },
  marksObtained: { type: Number, default: 0 },
});

const sectionAnalysisSchema = new mongoose.Schema({
  sectionName: String,
  score: { type: Number, default: 0 },
  totalQuestions: { type: Number, default: 0 },
  attempted: { type: Number, default: 0 },
  correct: { type: Number, default: 0 },
  wrong: { type: Number, default: 0 },
  accuracy: { type: Number, default: 0 },
  timeSpent: { type: Number, default: 0 }, // in seconds
});

const testAttemptSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  testId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Test',
    required: true,
  },
  testSeriesId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestSeries',
    default: null,
  },
  status: {
    type: String,
    enum: ['In Progress', 'Submitted'],
    default: 'In Progress',
  },
  startedAt: {
    type: Date,
    default: Date.now,
  },
  submittedAt: Date,
  answers: [answerSchema],
  
  // Resumable CBT Engine State
  activeSectionIndex: { type: Number, default: 0 },
  remainingSeconds: { type: Number, required: true }, // keeps track of time remaining
  sectionTimeLeft: [Number], // per-section remaining seconds (0 = no limit)
  lastHeartbeat: { type: Date, default: Date.now },
  
  // Post-submission Analytics (computed on submit)
  score: { type: Number, default: 0 },
  accuracy: { type: Number, default: 0 }, // correct / attempted * 100
  attemptPercentage: { type: Number, default: 0 }, // attempted / total * 100
  rank: { type: Number, default: null },
  percentile: { type: Number, default: null },
  sectionAnalysis: [sectionAnalysisSchema],
}, {
  timestamps: true,
});

testAttemptSchema.index({ studentId: 1, testId: 1 });
testAttemptSchema.index({ testId: 1, score: -1 }); // Index for fast ranking

export default mongoose.model('TestAttempt', testAttemptSchema);
