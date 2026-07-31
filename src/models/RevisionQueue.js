import mongoose from 'mongoose';

const revisionQueueSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true,
  },
  stage: {
    type: Number,
    enum: [1, 2, 3, 4, 5], // Corresponds to Days: [1, 3, 7, 15, 30]
    default: 1,
  },
  dueDate: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // default to 1 day later
  },
  status: {
    type: String,
    enum: ['Active', 'Snoozed', 'Mastered'],
    default: 'Active',
  },
  attemptsCount: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

revisionQueueSchema.index({ studentId: 1, dueDate: 1 });
revisionQueueSchema.index({ studentId: 1, questionId: 1 }, { unique: true });

export default mongoose.model('RevisionQueue', revisionQueueSchema);
