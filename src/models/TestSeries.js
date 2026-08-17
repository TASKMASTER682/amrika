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
  description: String,
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
  active: {
    type: Boolean,
    default: true,
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
