import mongoose from 'mongoose';

const testSeriesSchema = new mongoose.Schema({
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
  },
  description: String,
  // Admin-authored HTML for the public SEO landing page (sanitized on write/read).
  body: String,
  price: {
    type: Number,
    default: 0, // 0 means Free
  },
  banner: String,
  featured: {
    type: Boolean,
    default: false,
  },
  publishAt: Date,
  tags: [String],
  // Draft series stay hidden from users until an admin activates them.
  active: {
    type: Boolean,
    default: false,
  },
  difficulty: {
    type: String,
    enum: ['hard', 'mix', 'easy'],
    default: 'mix',
  },
}, {
  timestamps: true,
});

export default mongoose.model('TestSeries', testSeriesSchema);
