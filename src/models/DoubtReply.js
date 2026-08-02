import mongoose from 'mongoose';

const doubtReplySchema = new mongoose.Schema({
  doubtId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doubt',
    required: true,
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  authorName: { type: String, default: '' },
  body: { type: String, required: true },
  isAI: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
}, {
  timestamps: true,
});

export default mongoose.model('DoubtReply', doubtReplySchema);
