import mongoose from 'mongoose';

const doubtSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    default: null,
  },
  title: { type: String, required: true, trim: true },
  body: { type: String, required: true },
  subject: { type: String, default: '' },
  topic: { type: String, default: '' },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['open', 'answered', 'resolved'],
    default: 'open',
  },
  aiAnswered: { type: Boolean, default: false },
  replyCount: { type: Number, default: 0 },
}, {
  timestamps: true,
});

doubtSchema.index({ title: 'text', body: 'text', subject: 'text', topic: 'text' });

export default mongoose.model('Doubt', doubtSchema);
