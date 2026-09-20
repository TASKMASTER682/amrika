import mongoose from 'mongoose';

const flashcardSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  cardsReviewed: {
    type: Number,
    default: 0,
  },
  correctCount: {
    type: Number,
    default: 0,
  },
  duration: {
    type: Number,
    default: 0,
  },
  subject: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
});

flashcardSessionSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('FlashcardSession', flashcardSessionSchema);
