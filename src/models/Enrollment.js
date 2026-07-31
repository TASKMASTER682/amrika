import mongoose from 'mongoose';

const enrollmentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  testSeriesId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestSeries',
    required: true,
  },
  enrolledAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

enrollmentSchema.index({ userId: 1, testSeriesId: 1 }, { unique: true });

export default mongoose.model('Enrollment', enrollmentSchema);
