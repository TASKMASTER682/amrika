import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  discountType: { type: String, enum: ['percent', 'flat'], default: 'percent' },
  value: { type: Number, required: true },
  maxUses: { type: Number, default: 0 }, // 0 = unlimited
  usedCount: { type: Number, default: 0 },
  minAmount: { type: Number, default: 0 },
  expiresAt: Date,
  active: { type: Boolean, default: true },
}, {
  timestamps: true,
});

export default mongoose.model('Coupon', couponSchema);
