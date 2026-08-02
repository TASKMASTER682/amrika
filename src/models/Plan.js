import mongoose from 'mongoose';

const planSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: String,
  price: { type: Number, required: true, default: 0 },
  billingCycle: { type: String, enum: ['monthly', 'quarterly', 'yearly', 'lifetime'], default: 'monthly' },
  durationDays: { type: Number, default: 30 }, // 0 = lifetime
  features: [String],
  active: { type: Boolean, default: true },
  popular: { type: Boolean, default: false },
}, {
  timestamps: true,
});

export default mongoose.model('Plan', planSchema);
