import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['plan', 'test_series'], required: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  testSeries: { type: mongoose.Schema.Types.ObjectId, ref: 'TestSeries' },
  amount: { type: Number, required: true }, // final payable amount (after coupon)
  subtotal: { type: Number, required: true, default: 0 }, // amount before coupon
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending', index: true },
  paymentProvider: { type: String, enum: ['razorpay', 'offline'], default: 'razorpay' },
  paymentId: String,
  razorpayOrderId: String,
  razorpayQrId: String,
  couponCode: String,
  discount: { type: Number, default: 0 },
}, {
  timestamps: true,
});

orderSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('Order', orderSchema);
