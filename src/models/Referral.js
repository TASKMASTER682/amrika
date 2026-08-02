import mongoose from 'mongoose';

const referralSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  referralCount: { type: Number, default: 0 },
  rewardAmount: { type: Number, default: 0 },
}, {
  timestamps: true,
});

export default mongoose.model('Referral', referralSchema);
