import mongoose from 'mongoose';

const courseRequestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  message: {
    type: String,
    required: true,
    trim: true,
  },
  telegramLink: {
    type: String,
    required: true,
    trim: true,
  },
  telegramId: {
    type: String,
    trim: true,
    default: '',
  },
  status: {
    type: String,
    enum: ['new', 'contacted', 'closed'],
    default: 'new',
    index: true,
  },
  adminNotes: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
});

courseRequestSchema.index({ createdAt: -1 });

export default mongoose.model('CourseRequest', courseRequestSchema);
