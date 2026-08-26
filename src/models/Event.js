import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    date: {
      type: Date,
      required: true,
    },
    color: {
      type: String,
      enum: ['lime', 'sky', 'amber', 'rose', 'violet', 'emerald'],
      default: 'lime',
    },
  },
  { timestamps: true }
);

eventSchema.index({ userId: 1, date: 1 });

// TTL index — auto-delete documents 24 hours after their event date
eventSchema.index({ date: 1 }, { expireAfterSeconds: 86400 });

export default mongoose.models.Event || mongoose.model('Event', eventSchema);
