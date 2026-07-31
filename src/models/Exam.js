import mongoose from 'mongoose';

const examSchema = new mongoose.Schema({
  agencyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agency',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  description: String,
  active: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// Compound index to guarantee uniqueness of exam code under agency
examSchema.index({ agencyId: 1, name: 1 }, { unique: true });

export default mongoose.model('Exam', examSchema);
